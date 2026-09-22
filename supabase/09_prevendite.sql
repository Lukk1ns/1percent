-- ============================================================
-- 09 — PREVENDITE / PR  (Fase 1)
--
-- Sostituisce Evently. Nessun pagamento passa dal sito: è un
-- registro interno, i soldi restano contanti.
--
-- Come funziona, in una riga:
--   Luka consegna N prevendite a un PR → il PR inserisce i nominativi
--   → ogni nominativo diventa un biglietto "IN ATTESA" → quando il PR
--   porta i contanti, Luka segna l'incasso e i biglietti diventano ATTIVI.
--   In porta entra solo un biglietto ATTIVO.
--
-- Chi sono i PR: la crew già approvata su questo sito (role = 'crew').
-- Non si importa nessuno da Evently, non si crea nessun ruolo nuovo.
--
-- Da incollare nel SQL Editor di Supabase. Si può rieseguire.
-- ============================================================


-- ------------------------------------------------------------
-- L'INTERRUTTORE
--
-- Finché "aperta" è false il modulo esiste ma lo vede solo l'admin:
-- i PR che provano a entrare su /pr trovano la porta chiusa.
-- Si accende dal pannello quando il giro di prova è andato bene.
-- ------------------------------------------------------------
create table if not exists public.prevendite_config (
  id           int primary key default 1 check (id = 1),
  aperta       boolean not null default false,  -- i PR possono entrare
  vendite_on   boolean not null default true,   -- si possono inserire nominativi
  updated_at   timestamptz not null default now(),
  updated_by   text
);

insert into public.prevendite_config (id) values (1) on conflict (id) do nothing;


-- ------------------------------------------------------------
-- LE FASCE DI PREZZO, evento per evento
-- Oggi su Evently sono due: Donna 15 € e Uomo 20 €. Qui sono
-- righe di tabella, così cambiano senza toccare il codice.
-- stock null = nessun tetto.
-- ------------------------------------------------------------
create table if not exists public.event_tiers (
  id         uuid primary key default gen_random_uuid(),
  event_id   uuid not null references public.events (id) on delete cascade,
  label      text not null,
  price      numeric(10,2) not null check (price >= 0),
  stock      int check (stock >= 0),
  sort       int not null default 0,
  created_at timestamptz not null default now(),
  unique (event_id, label)
);

create index if not exists event_tiers_event_idx on public.event_tiers (event_id, sort);


-- ------------------------------------------------------------
-- I BLOCCHETTI: quante prevendite ha in mano un PR
-- Ogni riga è un movimento: +10 consegna, -3 ritiro. Il saldo è
-- la somma. Così resta la storia di chi ha dato cosa e quando.
-- ------------------------------------------------------------
create table if not exists public.pr_allocations (
  id         uuid primary key default gen_random_uuid(),
  event_id   uuid not null references public.events (id) on delete cascade,
  pr_id      uuid not null references public.profiles (id) on delete cascade,
  delta      int not null check (delta <> 0),
  nota       text,
  created_at timestamptz not null default now(),
  created_by text
);

create index if not exists pr_allocations_idx on public.pr_allocations (event_id, pr_id);


-- ------------------------------------------------------------
-- IL BIGLIETTO
-- prezzo e fascia sono COPIATI dentro la riga al momento della
-- vendita: se domani Luka cambia i prezzi, i biglietti già venduti
-- non cambiano importo sotto il naso di nessuno.
-- ------------------------------------------------------------
create table if not exists public.presales (
  id             uuid primary key default gen_random_uuid(),
  event_id       uuid not null references public.events (id) on delete cascade,
  pr_id          uuid not null references public.profiles (id) on delete restrict,

  nome           text not null,
  cognome        text not null,
  anno_nascita   int  not null check (anno_nascita between 1900 and 2100),
  telefono       text,

  tier_id        uuid references public.event_tiers (id) on delete set null,
  tier_label     text not null,
  prezzo         numeric(10,2) not null check (prezzo >= 0),

  token          text not null unique,
  stato          text not null default 'in_attesa'
                 check (stato in ('in_attesa','attiva','usata','annullata')),

  attivata_at    timestamptz,
  attivata_da    text,
  usata_at       timestamptz,
  usata_da       text,
  annullata_at   timestamptz,
  annullata_da   text,
  annulla_motivo text,

  created_at     timestamptz not null default now()
);

create index if not exists presales_event_idx on public.presales (event_id);
create index if not exists presales_pr_idx    on public.presales (event_id, pr_id);
create index if not exists presales_token_idx on public.presales (token);


-- ------------------------------------------------------------
-- I CONTANTI RACCOLTI dal PR
-- ------------------------------------------------------------
create table if not exists public.pr_settlements (
  id         uuid primary key default gen_random_uuid(),
  event_id   uuid not null references public.events (id) on delete cascade,
  pr_id      uuid not null references public.profiles (id) on delete cascade,
  importo    numeric(10,2) not null check (importo <> 0),
  nota       text,
  created_at timestamptz not null default now(),
  created_by text
);

create index if not exists pr_settlements_idx on public.pr_settlements (event_id, pr_id);


-- ------------------------------------------------------------
-- RLS: tutto chiuso. Si passa solo dalle funzioni qui sotto,
-- che controllano una per una chi sta chiamando.
-- ------------------------------------------------------------
alter table public.prevendite_config enable row level security;
alter table public.event_tiers       enable row level security;
alter table public.pr_allocations    enable row level security;
alter table public.presales          enable row level security;
alter table public.pr_settlements    enable row level security;


-- ============================================================
-- CHI PUÒ FARE COSA
-- ============================================================

-- È un PR? Sì se è crew approvata su questo sito.
-- Non c'è un ruolo "pr" separato: i PR sono i ragazzi che si sono
-- candidati quest'estate e che Luka ha approvato.
create or replace function public.is_pr()
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and role = 'crew' and deleted_at is null
  );
$$;

grant execute on function public.is_pr() to authenticated;


-- Lo stato del modulo, per decidere cosa mostrare.
-- Con "aperta = false" il PR non entra: lo vede solo l'admin.
create or replace function public.prevendite_stato()
returns table (aperta boolean, vendite_on boolean, sono_pr boolean, sono_admin boolean)
language sql
security definer
set search_path = public
stable
as $$
  select c.aperta, c.vendite_on, public.is_pr(), public.is_admin()
  from public.prevendite_config c where c.id = 1;
$$;

grant execute on function public.prevendite_stato() to authenticated;


-- ------------------------------------------------------------
-- Il credito di un PR: quanto ha consegnato meno quanto vale
-- quello che gli è già stato attivato. Con l'avanzo si attivano
-- i biglietti ancora in attesa, dal più vecchio.
-- Si può richiamare quante volte si vuole: rifà i conti da capo.
-- ------------------------------------------------------------
create or replace function public._pr_applica_credito(
  p_event uuid,
  p_pr    uuid,
  p_by    text
)
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  v_credito numeric;
  v_attivati int := 0;
  r record;
begin
  select coalesce((select sum(importo) from public.pr_settlements
                   where event_id = p_event and pr_id = p_pr), 0)
       - coalesce((select sum(prezzo) from public.presales
                   where event_id = p_event and pr_id = p_pr
                     and stato in ('attiva','usata')), 0)
  into v_credito;

  for r in
    select id, prezzo from public.presales
    where event_id = p_event and pr_id = p_pr and stato = 'in_attesa'
    order by created_at
  loop
    exit when v_credito < r.prezzo;
    update public.presales
       set stato = 'attiva', attivata_at = now(), attivata_da = p_by
     where id = r.id;
    v_credito := v_credito - r.prezzo;
    v_attivati := v_attivati + 1;
  end loop;

  return v_attivati;
end;
$$;

revoke execute on function public._pr_applica_credito(uuid, uuid, text) from anon, authenticated;


-- ============================================================
-- AREA PR  (/pr)
-- ============================================================

-- Gli eventi per cui questo PR ha prevendite in mano.
create or replace function public.pr_eventi()
returns table (
  event_id    uuid,
  nome        text,
  slug        text,
  locale      text,
  starts_at   timestamptz,
  cover_key   text,
  assegnate   int,
  vendute     int,
  residue     int
)
language plpgsql
security definer
set search_path = public
stable
as $$
begin
  if not public.is_pr() then
    raise exception 'Non autorizzato';
  end if;
  if not exists (select 1 from public.prevendite_config where id = 1 and aperta)
     and not public.is_admin() then
    raise exception 'Prevendite non ancora aperte';
  end if;

  return query
    select e.id, e.name, e.slug, v.name, e.starts_at, e.cover_key,
           coalesce(a.tot, 0)::int,
           coalesce(p.tot, 0)::int,
           (coalesce(a.tot, 0) - coalesce(p.tot, 0))::int
    from public.events e
    left join public.venues v on v.id = e.venue_id
    join lateral (
      select sum(delta)::int as tot from public.pr_allocations
      where event_id = e.id and pr_id = auth.uid()
    ) a on true
    left join lateral (
      select count(*)::int as tot from public.presales
      where event_id = e.id and pr_id = auth.uid() and stato <> 'annullata'
    ) p on true
    where a.tot is not null
    order by e.starts_at;
end;
$$;

grant execute on function public.pr_eventi() to authenticated;


-- Il quadro di un evento per il PR: quante ne ha, quanto deve portare.
create or replace function public.pr_riepilogo(p_event uuid)
returns table (
  assegnate    int,
  vendute      int,
  residue      int,
  in_attesa    int,
  attive       int,
  entrate      int,
  dovuto       numeric,
  consegnato   numeric,
  da_portare   numeric,
  vendite_on   boolean
)
language plpgsql
security definer
set search_path = public
stable
as $$
declare v_me uuid := auth.uid();
begin
  if not public.is_pr() then
    raise exception 'Non autorizzato';
  end if;

  return query
  select
    coalesce((select sum(delta) from public.pr_allocations
              where event_id = p_event and pr_id = v_me), 0)::int,
    (select count(*) from public.presales
      where event_id = p_event and pr_id = v_me and stato <> 'annullata')::int,
    (coalesce((select sum(delta) from public.pr_allocations
               where event_id = p_event and pr_id = v_me), 0)
     - (select count(*) from public.presales
        where event_id = p_event and pr_id = v_me and stato <> 'annullata'))::int,
    (select count(*) from public.presales
      where event_id = p_event and pr_id = v_me and stato = 'in_attesa')::int,
    (select count(*) from public.presales
      where event_id = p_event and pr_id = v_me and stato = 'attiva')::int,
    (select count(*) from public.presales
      where event_id = p_event and pr_id = v_me and stato = 'usata')::int,
    coalesce((select sum(prezzo) from public.presales
              where event_id = p_event and pr_id = v_me and stato <> 'annullata'), 0),
    coalesce((select sum(importo) from public.pr_settlements
              where event_id = p_event and pr_id = v_me), 0),
    coalesce((select sum(prezzo) from public.presales
              where event_id = p_event and pr_id = v_me and stato <> 'annullata'), 0)
    - coalesce((select sum(importo) from public.pr_settlements
                where event_id = p_event and pr_id = v_me), 0),
    (select vendite_on from public.prevendite_config where id = 1);
end;
$$;

grant execute on function public.pr_riepilogo(uuid) to authenticated;


-- Le fasce di prezzo di un evento, con quante ne restano.
create or replace function public.pr_fasce(p_event uuid)
returns table (id uuid, label text, price numeric, stock int, rimaste int)
language plpgsql
security definer
set search_path = public
stable
as $$
begin
  if not public.is_pr() and not public.is_admin() then
    raise exception 'Non autorizzato';
  end if;

  return query
    select t.id, t.label, t.price, t.stock,
           case when t.stock is null then null::int
                else (t.stock - (select count(*) from public.presales s
                                 where s.tier_id = t.id and s.stato <> 'annullata'))::int
           end
    from public.event_tiers t
    where t.event_id = p_event
    order by t.sort, t.label;
end;
$$;

grant execute on function public.pr_fasce(uuid) to authenticated;


-- I biglietti che ha fatto questo PR per un evento.
create or replace function public.pr_miei_biglietti(p_event uuid)
returns table (
  id uuid, nome text, cognome text, anno_nascita int, telefono text,
  tier_label text, prezzo numeric, token text, stato text,
  minorenne boolean, created_at timestamptz
)
language plpgsql
security definer
set search_path = public
stable
as $$
begin
  if not public.is_pr() then
    raise exception 'Non autorizzato';
  end if;

  return query
    select s.id, s.nome, s.cognome, s.anno_nascita, s.telefono,
           s.tier_label, s.prezzo, s.token, s.stato,
           (extract(year from now())::int - s.anno_nascita) < 18,
           s.created_at
    from public.presales s
    where s.event_id = p_event and s.pr_id = auth.uid()
    order by s.created_at desc;
end;
$$;

grant execute on function public.pr_miei_biglietti(uuid) to authenticated;


-- ------------------------------------------------------------
-- LA VENDITA
-- Il PR scrive il nominativo. Il biglietto nasce IN ATTESA:
-- diventa valido solo quando Luka segna che i contanti sono arrivati.
-- ------------------------------------------------------------
create or replace function public.pr_vendi(
  p_event    uuid,
  p_tier     uuid,
  p_nome     text,
  p_cognome  text,
  p_anno     int,
  p_telefono text
)
returns table (esito text, token text, prezzo numeric, minorenne boolean)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_me       uuid := auth.uid();
  v_tier     record;
  v_residue  int;
  v_rimaste  int;
  v_token    text;
begin
  if not public.is_pr() then
    raise exception 'Non autorizzato';
  end if;

  if not exists (select 1 from public.prevendite_config where id = 1 and aperta)
     and not public.is_admin() then
    return query select 'chiuso'::text, null::text, null::numeric, null::boolean; return;
  end if;

  if not exists (select 1 from public.prevendite_config where id = 1 and vendite_on) then
    return query select 'vendite_ferme'::text, null::text, null::numeric, null::boolean; return;
  end if;

  select * into v_tier from public.event_tiers where id = p_tier and event_id = p_event;
  if not found then
    return query select 'fascia_sconosciuta'::text, null::text, null::numeric, null::boolean; return;
  end if;

  -- Quante gliene restano in mano
  select coalesce((select sum(delta) from public.pr_allocations
                   where event_id = p_event and pr_id = v_me), 0)
       - (select count(*) from public.presales
          where event_id = p_event and pr_id = v_me and stato <> 'annullata')
  into v_residue;

  if v_residue <= 0 then
    return query select 'finite'::text, null::text, null::numeric, null::boolean; return;
  end if;

  -- Scorta della fascia (se c'è un tetto)
  if v_tier.stock is not null then
    select v_tier.stock - count(*) into v_rimaste from public.presales
      where tier_id = v_tier.id and stato <> 'annullata';
    if v_rimaste <= 0 then
      return query select 'fascia_esaurita'::text, null::text, null::numeric, null::boolean; return;
    end if;
  end if;

  if coalesce(trim(p_nome), '') = '' or coalesce(trim(p_cognome), '') = '' then
    return query select 'dati_mancanti'::text, null::text, null::numeric, null::boolean; return;
  end if;

  v_token := substr(md5(gen_random_uuid()::text || clock_timestamp()::text), 1, 20);

  insert into public.presales
    (event_id, pr_id, nome, cognome, anno_nascita, telefono,
     tier_id, tier_label, prezzo, token)
  values
    (p_event, v_me, trim(p_nome), trim(p_cognome), p_anno, nullif(trim(p_telefono), ''),
     v_tier.id, v_tier.label, v_tier.price, v_token);

  -- Se il PR ha già consegnato soldi in anticipo, il biglietto si attiva da solo.
  perform public._pr_applica_credito(p_event, v_me, 'automatico');

  return query select 'ok'::text, v_token, v_tier.price,
                      ((extract(year from now())::int - p_anno) < 18);
end;
$$;

grant execute on function public.pr_vendi(uuid, uuid, text, text, int, text) to authenticated;


-- ============================================================
-- IL BIGLIETTO  (/biglietto/<token>)
-- Pagina pubblica: la apre il cliente dal link WhatsApp.
-- Chi non ha il token non trova niente. Esce solo quello che
-- serve in porta: niente telefono, niente dati del PR.
-- ============================================================
create or replace function public.biglietto(p_token text)
returns table (
  nome        text,
  cognome     text,
  tier_label  text,
  prezzo      numeric,
  stato       text,
  minorenne   boolean,
  evento      text,
  locale      text,
  citta       text,
  indirizzo   text,
  starts_at   timestamptz,
  cover_key   text,
  cover_v     bigint
)
language sql
security definer
set search_path = public
stable
as $$
  select s.nome, s.cognome, s.tier_label, s.prezzo, s.stato,
         (extract(year from now())::int - s.anno_nascita) < 18,
         e.name, v.name, v.city, v.address, e.starts_at, e.cover_key, coalesce(extract(epoch from e.cover_updated_at)::bigint, 0)
  from public.presales s
  join public.events e on e.id = s.event_id
  left join public.venues v on v.id = e.venue_id
  where s.token = p_token;
$$;

grant execute on function public.biglietto(text) to anon, authenticated;


-- ============================================================
-- PANNELLO ADMIN  (/admin/pr)
-- Ogni funzione parte da is_admin(): senza quello non si entra,
-- anche chiamando la RPC a mano da fuori.
-- ============================================================

-- L'interruttore del modulo.
create or replace function public.admin_prevendite_config(
  p_aperta     boolean,
  p_vendite_on boolean
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception 'Non autorizzato';
  end if;

  update public.prevendite_config
     set aperta = p_aperta,
         vendite_on = p_vendite_on,
         updated_at = now(),
         updated_by = (auth.jwt() ->> 'email')
   where id = 1;
end;
$$;

grant execute on function public.admin_prevendite_config(boolean, boolean) to authenticated;


-- Gli eventi su cui si può lavorare, con i totali della serata.
create or replace function public.admin_pr_eventi()
returns table (
  event_id   uuid,
  nome       text,
  locale     text,
  starts_at  timestamptz,
  passato    boolean,
  fasce      int,
  assegnate  int,
  vendute    int,
  attive     int,
  entrate    int,
  incasso    numeric,
  raccolto   numeric
)
language plpgsql
security definer
set search_path = public
stable
as $$
begin
  if not public.is_admin() then
    raise exception 'Non autorizzato';
  end if;

  return query
    select e.id, e.name, v.name, e.starts_at,
           coalesce(e.ends_at, e.starts_at) < now(),
           (select count(*) from public.event_tiers t where t.event_id = e.id)::int,
           coalesce((select sum(delta) from public.pr_allocations a where a.event_id = e.id), 0)::int,
           (select count(*) from public.presales s
             where s.event_id = e.id and s.stato <> 'annullata')::int,
           (select count(*) from public.presales s
             where s.event_id = e.id and s.stato = 'attiva')::int,
           (select count(*) from public.presales s
             where s.event_id = e.id and s.stato = 'usata')::int,
           coalesce((select sum(prezzo) from public.presales s
                     where s.event_id = e.id and s.stato <> 'annullata'), 0),
           coalesce((select sum(importo) from public.pr_settlements t
                     where t.event_id = e.id), 0)
    from public.events e
    left join public.venues v on v.id = e.venue_id
    order by e.starts_at desc;
end;
$$;

grant execute on function public.admin_pr_eventi() to authenticated;


-- La crew approvata: sono loro i PR possibili.
-- "attivo" dice se ha già prevendite in mano per questo evento.
create or replace function public.admin_pr_lista(p_event uuid)
returns table (
  pr_id       uuid,
  alias       text,
  nome        text,
  email       text,
  assegnate   int,
  vendute     int,
  residue     int,
  in_attesa   int,
  attive      int,
  entrate     int,
  dovuto      numeric,
  consegnato  numeric,
  mancante    numeric
)
language plpgsql
security definer
set search_path = public
stable
as $$
begin
  if not public.is_admin() then
    raise exception 'Non autorizzato';
  end if;

  return query
    select p.id, p.alias, p.nome, p.email,
           coalesce(a.tot, 0)::int,
           coalesce(s.vendute, 0)::int,
           (coalesce(a.tot, 0) - coalesce(s.vendute, 0))::int,
           coalesce(s.in_attesa, 0)::int,
           coalesce(s.attive, 0)::int,
           coalesce(s.entrate, 0)::int,
           coalesce(s.dovuto, 0),
           coalesce(t.raccolto, 0),
           coalesce(s.dovuto, 0) - coalesce(t.raccolto, 0)
    from public.profiles p
    left join lateral (
      select sum(delta)::int as tot from public.pr_allocations
      where event_id = p_event and pr_id = p.id
    ) a on true
    left join lateral (
      select count(*) filter (where stato <> 'annullata')  as vendute,
             count(*) filter (where stato = 'in_attesa')   as in_attesa,
             count(*) filter (where stato = 'attiva')      as attive,
             count(*) filter (where stato = 'usata')       as entrate,
             sum(prezzo) filter (where stato <> 'annullata') as dovuto
      from public.presales where event_id = p_event and pr_id = p.id
    ) s on true
    left join lateral (
      select sum(importo) as raccolto from public.pr_settlements
      where event_id = p_event and pr_id = p.id
    ) t on true
    where p.role = 'crew' and p.deleted_at is null
    order by coalesce(a.tot, 0) desc, p.alias;
end;
$$;

grant execute on function public.admin_pr_lista(uuid) to authenticated;


-- Consegna (+) o ritira (-) prevendite.
create or replace function public.admin_pr_assegna(
  p_event uuid,
  p_pr    uuid,
  p_delta int,
  p_nota  text default null
)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare v_residue int;
begin
  if not public.is_admin() then
    raise exception 'Non autorizzato';
  end if;
  if p_delta = 0 then
    return 'niente';
  end if;

  -- Non si ritira più di quello che ha ancora in mano.
  if p_delta < 0 then
    select coalesce((select sum(delta) from public.pr_allocations
                     where event_id = p_event and pr_id = p_pr), 0)
         - (select count(*) from public.presales
            where event_id = p_event and pr_id = p_pr and stato <> 'annullata')
    into v_residue;
    if v_residue + p_delta < 0 then
      return 'troppe';
    end if;
  end if;

  insert into public.pr_allocations (event_id, pr_id, delta, nota, created_by)
  values (p_event, p_pr, p_delta, nullif(trim(p_nota), ''), (auth.jwt() ->> 'email'));

  return 'ok';
end;
$$;

grant execute on function public.admin_pr_assegna(uuid, uuid, int, text) to authenticated;


-- "Ho ricevuto X €": registra i contanti e attiva i biglietti coperti,
-- dal più vecchio. È il momento in cui la prevendita diventa valida.
create or replace function public.admin_pr_incassa(
  p_event   uuid,
  p_pr      uuid,
  p_importo numeric,
  p_nota    text default null
)
returns table (esito text, attivati int, ancora_in_attesa int, mancante numeric)
language plpgsql
security definer
set search_path = public
as $$
declare v_attivati int;
begin
  if not public.is_admin() then
    raise exception 'Non autorizzato';
  end if;

  if p_importo <> 0 then
    insert into public.pr_settlements (event_id, pr_id, importo, nota, created_by)
    values (p_event, p_pr, p_importo, nullif(trim(p_nota), ''), (auth.jwt() ->> 'email'));
  end if;

  v_attivati := public._pr_applica_credito(p_event, p_pr, (auth.jwt() ->> 'email'));

  return query
    select 'ok'::text, v_attivati,
      (select count(*) from public.presales
        where event_id = p_event and pr_id = p_pr and stato = 'in_attesa')::int,
      coalesce((select sum(prezzo) from public.presales
                where event_id = p_event and pr_id = p_pr and stato <> 'annullata'), 0)
      - coalesce((select sum(importo) from public.pr_settlements
                  where event_id = p_event and pr_id = p_pr), 0);
end;
$$;

grant execute on function public.admin_pr_incassa(uuid, uuid, numeric, text) to authenticated;


-- Attiva tutti i biglietti in attesa di un PR, anche senza soldi:
-- serve in porta, quando il PR arriva a serata iniziata e si salda dopo.
-- Registra comunque l'importo come dovuto, così i conti tornano.
create or replace function public.admin_pr_attiva_tutto(p_event uuid, p_pr uuid)
returns int
language plpgsql
security definer
set search_path = public
as $$
declare v_n int;
begin
  if not public.is_admin() then
    raise exception 'Non autorizzato';
  end if;

  update public.presales
     set stato = 'attiva', attivata_at = now(), attivata_da = (auth.jwt() ->> 'email') || ' (al volo)'
   where event_id = p_event and pr_id = p_pr and stato = 'in_attesa';

  get diagnostics v_n = row_count;
  return v_n;
end;
$$;

grant execute on function public.admin_pr_attiva_tutto(uuid, uuid) to authenticated;


-- Tutti i biglietti di una serata, per il pannello e per la porta.
create or replace function public.admin_presales(p_event uuid)
returns table (
  id uuid, nome text, cognome text, anno_nascita int, telefono text,
  tier_label text, prezzo numeric, token text, stato text,
  minorenne boolean, pr_alias text, pr_nome text, created_at timestamptz
)
language plpgsql
security definer
set search_path = public
stable
as $$
begin
  if not public.is_admin() then
    raise exception 'Non autorizzato';
  end if;

  return query
    select s.id, s.nome, s.cognome, s.anno_nascita, s.telefono,
           s.tier_label, s.prezzo, s.token, s.stato,
           (extract(year from now())::int - s.anno_nascita) < 18,
           p.alias, p.nome, s.created_at
    from public.presales s
    join public.profiles p on p.id = s.pr_id
    where s.event_id = p_event
    order by s.created_at desc;
end;
$$;

grant execute on function public.admin_presales(uuid) to authenticated;


-- Annulla un biglietto (errore di battitura, cliente che rinuncia).
-- Non si cancella: resta la riga, cambia lo stato.
create or replace function public.admin_presale_annulla(p_id uuid, p_motivo text default null)
returns text
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception 'Non autorizzato';
  end if;

  update public.presales
     set stato = 'annullata', annullata_at = now(), annullata_da = (auth.jwt() ->> 'email'),
         annulla_motivo = nullif(trim(p_motivo), '')
   where id = p_id and stato <> 'usata';

  if not found then return 'non_trovato'; end if;
  return 'ok';
end;
$$;

grant execute on function public.admin_presale_annulla(uuid, text) to authenticated;


-- ------------------------------------------------------------
-- Fasce di prezzo: crea, modifica, elimina.
-- ------------------------------------------------------------
create or replace function public.admin_tier_salva(
  p_id    uuid,
  p_event uuid,
  p_label text,
  p_price numeric,
  p_stock int,
  p_sort  int
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare v_id uuid;
begin
  if not public.is_admin() then
    raise exception 'Non autorizzato';
  end if;

  if p_id is null then
    insert into public.event_tiers (event_id, label, price, stock, sort)
    values (p_event, trim(p_label), p_price, p_stock, coalesce(p_sort, 0))
    returning id into v_id;
  else
    update public.event_tiers
       set label = trim(p_label), price = p_price, stock = p_stock,
           sort = coalesce(p_sort, 0)
     where id = p_id
    returning id into v_id;
  end if;

  return v_id;
end;
$$;

grant execute on function public.admin_tier_salva(uuid, uuid, text, numeric, int, int) to authenticated;


create or replace function public.admin_tier_elimina(p_id uuid)
returns text
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception 'Non autorizzato';
  end if;

  -- Se ci sono già biglietti su questa fascia non si tocca:
  -- la riga del biglietto punta qui.
  if exists (select 1 from public.presales where tier_id = p_id and stato <> 'annullata') then
    return 'in_uso';
  end if;

  delete from public.event_tiers where id = p_id;
  return 'ok';
end;
$$;

grant execute on function public.admin_tier_elimina(uuid) to authenticated;


-- La classifica dei PR di una serata.
create or replace function public.admin_pr_classifica(p_event uuid)
returns table (alias text, nome text, vendute int, assegnate int, resa numeric)
language plpgsql
security definer
set search_path = public
stable
as $$
begin
  if not public.is_admin() then
    raise exception 'Non autorizzato';
  end if;

  return query
    select p.alias, p.nome,
           coalesce(s.n, 0)::int,
           coalesce(a.tot, 0)::int,
           case when coalesce(a.tot, 0) = 0 then 0
                else round(coalesce(s.n, 0)::numeric * 100 / a.tot, 0) end
    from public.profiles p
    left join lateral (
      select count(*) as n from public.presales
      where event_id = p_event and pr_id = p.id and stato <> 'annullata'
    ) s on true
    left join lateral (
      select sum(delta)::int as tot from public.pr_allocations
      where event_id = p_event and pr_id = p.id
    ) a on true
    where p.role = 'crew' and p.deleted_at is null and coalesce(a.tot, 0) > 0
    order by coalesce(s.n, 0) desc, p.alias;
end;
$$;

grant execute on function public.admin_pr_classifica(uuid) to authenticated;


-- ============================================================
-- Controllo finale: se arrivi qui senza errori, è tutto a posto.
-- ============================================================
select
  (select count(*) from public.profiles where role = 'crew' and deleted_at is null) as "PR disponibili (crew approvata)",
  (select aperta from public.prevendite_config where id = 1)                        as "area PR aperta",
  (select count(*) from public.events)                                              as "eventi in archivio";
