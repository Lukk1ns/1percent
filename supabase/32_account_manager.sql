-- ============================================================
-- 32 — GLI ACCOUNT MANAGER
--
-- Chiesto da Luka il 25 settembre 2026: tre persone di fiducia —
-- LEONARDO CEOLIN, SAMUELE CHEZZI, MARCO FLOREAN — che gli tolgono di
-- mano il lavoro della serata. Sono PR come gli altri, con tre poteri
-- in più e **nient'altro**:
--
--   1. stare in porta a leggere i QR delle prevendite;
--   2. consegnare prevendite ai PR, e anche a se stessi, senza tetto;
--   3. ritirare i contanti da un PR — tutti o una parte — e da quel
--      momento quei soldi sono **a carico loro** finché non li portano
--      a Luka.
--
-- Quello che NON possono fare, per decisione di Luka: omaggi, tavoli,
-- annullare biglietti, vedere il cruscotto, le percentuali, le scorte
-- rimaste o la classifica dei PR. Vedono l'elenco dei PR e quanto c'è
-- da ritirare da ognuno. Punto.
--
-- **I soldi restano un registro.** Come `pr_settlements` (script 19),
-- anche `am_movimenti` rifiuta UPDATE e DELETE: si corregge solo con un
-- movimento contrario (`admin_am_storna`). Ogni riga dice chi l'ha
-- scritta e da chi venivano i soldi, così una cifra che non torna ha
-- sempre un nome sopra.
--
-- Da incollare nel SQL Editor. Si può rieseguire.
-- ============================================================


-- ------------------------------------------------------------
-- Chi sono
-- ------------------------------------------------------------
create table if not exists public.account_managers (
  profile_id uuid primary key references public.profiles (id) on delete cascade,
  attivo     boolean not null default true,
  dal        timestamptz not null default now(),
  nominato_da text
);

alter table public.account_managers enable row level security;
-- Nessuna policy: si legge solo attraverso le funzioni qui sotto.

create or replace function public.is_account_manager()
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1 from public.account_managers m
     where m.profile_id = auth.uid() and m.attivo
  );
$$;

grant execute on function public.is_account_manager() to authenticated;


-- ------------------------------------------------------------
-- I soldi che un manager ha in mano
-- ------------------------------------------------------------
-- `importo` positivo = li ha presi da un PR; negativo = li ha portati
-- alla direzione. La somma è quello che ha ancora addosso.
create table if not exists public.am_movimenti (
  id         uuid primary key default gen_random_uuid(),
  event_id   uuid not null references public.events (id) on delete cascade,
  am_id      uuid not null references public.profiles (id) on delete cascade,
  da_pr      uuid references public.profiles (id) on delete set null,
  importo    numeric(10,2) not null check (importo <> 0),
  tipo       text not null check (tipo in ('raccolta', 'consegna', 'storno')),
  nota       text,
  created_at timestamptz not null default now(),
  created_by text
);

create index if not exists am_movimenti_am on public.am_movimenti (am_id, event_id);

alter table public.am_movimenti enable row level security;

-- Il registro non si riscrive: si aggiunge in fondo.
create or replace function public.proteggi_am_movimenti()
returns trigger
language plpgsql
as $$
begin
  raise exception 'I movimenti dei manager non si modificano né si cancellano: usa admin_am_storna';
end;
$$;

drop trigger if exists am_movimenti_immutabili on public.am_movimenti;
create trigger am_movimenti_immutabili
  before update or delete on public.am_movimenti
  for each row execute function public.proteggi_am_movimenti();


-- ------------------------------------------------------------
-- 1 · L'elenco dei PR, e basta
-- ------------------------------------------------------------
-- Niente scorte, niente percentuali, niente classifica: solo chi ha
-- venduto, quanto deve, quanto ha già dato e quanto c'è da ritirare.
-- `in_mano` sono le prevendite che quel PR ha ancora da vendere — un
-- numero che lui stesso vede sulla sua pagina, quindi non è un segreto.
create or replace function public.am_pr_lista(p_event uuid)
returns table (
  pr_id      uuid,
  alias      text,
  nome       text,
  numero     int,
  telefono   text,
  vendute    int,
  in_mano    int,
  dovuto     numeric,
  raccolto   numeric,
  da_ritirare numeric
)
language plpgsql
security definer
set search_path = public
stable
as $$
#variable_conflict use_column
begin
  if not (public.is_account_manager() or public.is_admin()) then
    raise exception 'Non autorizzato';
  end if;

  return query
    select p.id, p.alias, p.nome, p.member_number, p.phone,
           coalesce(s.vendute, 0)::int,
           greatest(coalesce(a.tot, 0) - coalesce(s.vendute, 0), 0)::int,
           coalesce(s.dovuto, 0),
           coalesce(t.raccolto, 0),
           coalesce(s.dovuto, 0) - coalesce(t.raccolto, 0)
    from public.profiles p
    left join lateral (
      select sum(al.delta)::int as tot
      from public.pr_allocations al
      where al.event_id = p_event and al.pr_id = p.id
    ) a on true
    left join lateral (
      select count(*) filter (where ps.stato <> 'annullata') as vendute,
             sum(ps.prezzo) filter (where ps.stato <> 'annullata') as dovuto
      from public.presales ps
      where ps.event_id = p_event and ps.pr_id = p.id
    ) s on true
    left join lateral (
      select sum(st.importo) as raccolto
      from public.pr_settlements st
      where st.event_id = p_event and st.pr_id = p.id
    ) t on true
    -- Tutta la crew, anche chi è ancora a zero: a quelli si consegnano
    -- le prevendite, e se non comparissero non si potrebbe rifornirli.
    -- La pagina li tiene in fondo, dietro un interruttore.
    where p.role = 'crew' and p.deleted_at is null
    order by (coalesce(s.dovuto, 0) - coalesce(t.raccolto, 0)) desc,
             coalesce(s.vendute, 0) desc, p.alias;
end;
$$;

revoke execute on function public.am_pr_lista(uuid) from public, anon;
grant execute on function public.am_pr_lista(uuid) to authenticated;


-- ------------------------------------------------------------
-- 2 · Consegnare prevendite (senza tetto, deciso da Luka)
-- ------------------------------------------------------------
create or replace function public.am_consegna(
  p_event  uuid,
  p_pr     uuid,
  p_quante int,
  p_nota   text default null
)
returns int
language plpgsql
security definer
set search_path = public
as $$
declare v_io text := (auth.jwt() ->> 'email');
begin
  if not public.is_account_manager() then
    raise exception 'Non autorizzato';
  end if;
  if p_quante is null or p_quante <= 0 then
    raise exception 'Quante prevendite?';
  end if;
  if not exists (select 1 from public.profiles p
                  where p.id = p_pr and p.role = 'crew' and p.deleted_at is null) then
    raise exception 'Questo non è un PR';
  end if;

  insert into public.pr_allocations (event_id, pr_id, delta, nota, created_by)
  values (p_event, p_pr, p_quante,
          coalesce(nullif(trim(p_nota), ''), 'consegna del manager'),
          coalesce(v_io, 'manager') || ' · manager');

  return coalesce((select sum(al.delta)::int from public.pr_allocations al
                    where al.event_id = p_event and al.pr_id = p_pr), 0);
end;
$$;

revoke execute on function public.am_consegna(uuid, uuid, int, text) from public, anon;
grant execute on function public.am_consegna(uuid, uuid, int, text) to authenticated;


-- ------------------------------------------------------------
-- 3 · Ritirare i contanti da un PR
-- ------------------------------------------------------------
-- Due righe per un gesto solo: il PR risulta saldato (e i suoi
-- biglietti si attivano, come quando incassa Luka) e la stessa cifra
-- resta scritta a carico del manager finché non la porta alla direzione.
create or replace function public.am_incassa(
  p_event   uuid,
  p_pr      uuid,
  p_importo numeric,
  p_nota    text default null
)
returns table (esito text, attivati int, ancora_in_attesa int, mancante numeric, in_mano numeric)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_io    text := (auth.jwt() ->> 'email');
  v_alias text;
  v_att   int;
begin
  if not public.is_account_manager() then
    raise exception 'Non autorizzato';
  end if;
  if p_importo is null or p_importo <= 0 then
    raise exception 'Quanto hai ritirato?';
  end if;

  select p.alias into v_alias
    from public.profiles p
   where p.id = p_pr and p.role = 'crew' and p.deleted_at is null;
  if v_alias is null then
    raise exception 'Questo non è un PR';
  end if;

  -- il PR ha pagato
  insert into public.pr_settlements (event_id, pr_id, importo, nota, created_by)
  values (p_event, p_pr, p_importo,
          coalesce(nullif(trim(p_nota), ''), 'ritirati dal manager'),
          coalesce(v_io, 'manager') || ' · manager');

  -- e adesso i soldi ce li ha il manager
  insert into public.am_movimenti (event_id, am_id, da_pr, importo, tipo, nota, created_by)
  values (p_event, auth.uid(), p_pr, p_importo, 'raccolta',
          coalesce(nullif(trim(p_nota), ''), 'ritirati da ' || v_alias), v_io);

  v_att := public._pr_applica_credito(p_event, p_pr, coalesce(v_io, 'manager') || ' (manager)');

  return query
    select 'ok'::text, v_att,
      (select count(*) from public.presales ps
        where ps.event_id = p_event and ps.pr_id = p_pr and ps.stato = 'in_attesa')::int,
      coalesce((select sum(ps.prezzo) from public.presales ps
                 where ps.event_id = p_event and ps.pr_id = p_pr and ps.stato <> 'annullata'), 0)
      - coalesce((select sum(st.importo) from public.pr_settlements st
                   where st.event_id = p_event and st.pr_id = p_pr), 0),
      coalesce((select sum(m.importo) from public.am_movimenti m
                 where m.am_id = auth.uid() and m.event_id = p_event), 0);
end;
$$;

revoke execute on function public.am_incassa(uuid, uuid, numeric, text) from public, anon;
grant execute on function public.am_incassa(uuid, uuid, numeric, text) to authenticated;


-- Quanto ha addosso adesso, e cosa ha fatto.
create or replace function public.am_saldo(p_event uuid)
returns table (in_mano numeric, raccolto numeric, consegnato numeric, movimenti int)
language plpgsql
security definer
set search_path = public
stable
as $$
begin
  if not public.is_account_manager() then
    raise exception 'Non autorizzato';
  end if;

  return query
    select coalesce(sum(m.importo), 0),
           coalesce(sum(m.importo) filter (where m.importo > 0), 0),
           coalesce(-sum(m.importo) filter (where m.importo < 0), 0),
           count(*)::int
      from public.am_movimenti m
     where m.am_id = auth.uid() and m.event_id = p_event;
end;
$$;

revoke execute on function public.am_saldo(uuid) from public, anon;
grant execute on function public.am_saldo(uuid) to authenticated;


-- Il suo registro: cosa ha ritirato e da chi, in ordine di tempo.
create or replace function public.am_registro(p_event uuid)
returns table (quando timestamptz, tipo text, da text, importo numeric, nota text)
language plpgsql
security definer
set search_path = public
stable
as $$
begin
  if not public.is_account_manager() then
    raise exception 'Non autorizzato';
  end if;

  return query
    select m.created_at, m.tipo, coalesce(p.alias, 'DIREZIONE'), m.importo, m.nota
      from public.am_movimenti m
      left join public.profiles p on p.id = m.da_pr
     where m.am_id = auth.uid() and m.event_id = p_event
     order by m.created_at desc;
end;
$$;

revoke execute on function public.am_registro(uuid) from public, anon;
grant execute on function public.am_registro(uuid) to authenticated;


-- ------------------------------------------------------------
-- Il lato di Luka
-- ------------------------------------------------------------
create or replace function public.admin_am_lista(p_event uuid default null)
returns table (
  profile_id uuid, alias text, nome text, numero int, attivo boolean,
  dal timestamptz, in_mano numeric, raccolto numeric, consegnato numeric
)
language plpgsql
security definer
set search_path = public
stable
as $$
#variable_conflict use_column
begin
  if not public.is_admin() then
    raise exception 'Non autorizzato';
  end if;

  return query
    select p.id, p.alias, p.nome, p.member_number, m.attivo, m.dal,
           coalesce(s.tot, 0), coalesce(s.dentro, 0), coalesce(s.fuori, 0)
      from public.account_managers m
      join public.profiles p on p.id = m.profile_id
      left join lateral (
        select sum(x.importo) as tot,
               sum(x.importo) filter (where x.importo > 0) as dentro,
               -sum(x.importo) filter (where x.importo < 0) as fuori
          from public.am_movimenti x
         where x.am_id = p.id and (p_event is null or x.event_id = p_event)
      ) s on true
     order by m.attivo desc, p.alias;
end;
$$;

grant execute on function public.admin_am_lista(uuid) to authenticated;


create or replace function public.admin_am_nomina(p_profile uuid, p_on boolean)
returns text
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception 'Non autorizzato';
  end if;

  if not exists (select 1 from public.profiles p
                  where p.id = p_profile and p.role = 'crew' and p.deleted_at is null) then
    raise exception 'Prima deve essere un PR approvato';
  end if;

  insert into public.account_managers (profile_id, attivo, nominato_da)
  values (p_profile, p_on, (auth.jwt() ->> 'email'))
  on conflict (profile_id) do update
    set attivo = excluded.attivo,
        nominato_da = excluded.nominato_da,
        dal = case when public.account_managers.attivo then public.account_managers.dal else now() end;

  return case when p_on then 'nominato' else 'revocato' end;
end;
$$;

grant execute on function public.admin_am_nomina(uuid, boolean) to authenticated;


-- "Leonardo mi ha portato 450 €": il carico gli si scarica di dosso.
create or replace function public.admin_am_ricevi(
  p_am      uuid,
  p_event   uuid,
  p_importo numeric,
  p_nota    text default null
)
returns numeric
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception 'Non autorizzato';
  end if;
  if p_importo is null or p_importo <= 0 then
    raise exception 'Quanto hai ricevuto?';
  end if;

  insert into public.am_movimenti (event_id, am_id, da_pr, importo, tipo, nota, created_by)
  values (p_event, p_am, null, -p_importo, 'consegna',
          coalesce(nullif(trim(p_nota), ''), 'consegnati alla direzione'),
          (auth.jwt() ->> 'email'));

  return coalesce((select sum(m.importo) from public.am_movimenti m
                    where m.am_id = p_am and m.event_id = p_event), 0);
end;
$$;

grant execute on function public.admin_am_ricevi(uuid, uuid, numeric, text) to authenticated;


-- Le correzioni si fanno con un movimento contrario, mai cancellando.
create or replace function public.admin_am_storna(p_movimento uuid, p_nota text default null)
returns numeric
language plpgsql
security definer
set search_path = public
as $$
declare r record;
begin
  if not public.is_admin() then
    raise exception 'Non autorizzato';
  end if;

  select * into r from public.am_movimenti m where m.id = p_movimento;
  if not found then
    raise exception 'Movimento non trovato';
  end if;

  insert into public.am_movimenti (event_id, am_id, da_pr, importo, tipo, nota, created_by)
  values (r.event_id, r.am_id, r.da_pr, -r.importo, 'storno',
          coalesce(nullif(trim(p_nota), ''),
                   'STORNO del movimento del ' || to_char(r.created_at, 'DD/MM HH24:MI')),
          (auth.jwt() ->> 'email'));

  return coalesce((select sum(m.importo) from public.am_movimenti m
                    where m.am_id = r.am_id and m.event_id = r.event_id), 0);
end;
$$;

grant execute on function public.admin_am_storna(uuid, text) to authenticated;


create or replace function public.admin_am_registro(p_event uuid)
returns table (
  id uuid, quando timestamptz, manager text, tipo text, da text,
  importo numeric, nota text, segnato_da text
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
    select m.id, m.created_at, am.alias, m.tipo, coalesce(pr.alias, 'DIREZIONE'),
           m.importo, m.nota, m.created_by
      from public.am_movimenti m
      join public.profiles am on am.id = m.am_id
      left join public.profiles pr on pr.id = m.da_pr
     where m.event_id = p_event
     order by m.created_at desc;
end;
$$;

grant execute on function public.admin_am_registro(uuid) to authenticated;


-- ------------------------------------------------------------
-- La porta si apre anche ai manager
-- ------------------------------------------------------------
-- Le stesse funzioni di `20_porta.sql`, `21_porta_offline.sql` e
-- `31_delega_automatica.sql`, copiate senza toccare una virgola: cambia
-- solo chi le può chiamare, che adesso è `is_staff()` **oppure** un
-- account manager. `porta_forza` (far passare un biglietto non pagato)
-- resta di Luka soltanto, come prima.
create or replace function public.porta_checkin(p_token text, p_event uuid default null)
returns table (
  esito       text,
  nome        text,
  cognome     text,
  tier_label  text,
  prezzo      numeric,
  minorenne   boolean,
  under16     boolean,
  pr_alias    text,
  evento      text,
  entrata_at  timestamptz,
  presale_id  uuid
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_b      record;
  v_pr     text;
  v_ev     text;
  v_i      record;
  v_soglia int;
  v_vend   int;
begin
  if not (public.is_staff() or public.is_account_manager()) then
    raise exception 'Non autorizzato';
  end if;

  select s.*, e.name as nome_evento, e.starts_at as quando_evento,
           p.alias as alias_pr
    into v_b
    from public.presales s
    join public.events e on e.id = s.event_id
    left join public.profiles p on p.id = s.pr_id
   where s.token = p_token;

  if not found then
    -- Non è un biglietto: può essere il pass di un PR.
    select i.*, e.name as nome_evento, pf.alias as alias_pr
      into v_i
      from public.pr_ingressi i
      join public.events e on e.id = i.event_id
      join public.profiles pf on pf.id = i.pr_id
     where i.token = p_token;

    if not found then
      return query select 'sconosciuto'::text, null::text, null::text, null::text,
                          null::numeric, null::boolean, null::boolean,
                          null::text, null::text, null::timestamptz, null::uuid;
      return;
    end if;

    if p_event is not null and v_i.event_id <> p_event then
      return query select 'altra_serata'::text, v_i.alias_pr, null::text, 'PASS PR'::text,
                          null::numeric, null::boolean, null::boolean,
                          v_i.alias_pr, v_i.nome_evento, null::timestamptz, null::uuid;
      return;
    end if;

    if v_i.usato_at is not null then
      return query select 'gia_usato'::text, v_i.alias_pr, null::text, 'PASS PR'::text,
                          null::numeric, null::boolean, null::boolean,
                          v_i.alias_pr, v_i.nome_evento, v_i.usato_at, null::uuid;
      return;
    end if;

    select coalesce(c.ingresso_soglia, 10) into v_soglia
      from public.prevendite_config c where c.id = 1;

    select count(*)::int into v_vend
      from public.presales ps
     where ps.event_id = v_i.event_id and ps.pr_id = v_i.pr_id
       and ps.stato <> 'annullata';

    if not (v_vend >= v_soglia or v_i.forzato) then
      return query select 'pr_non_attivo'::text, v_i.alias_pr, null::text,
                          format('%s su %s', v_vend, v_soglia)::text,
                          null::numeric, null::boolean, null::boolean,
                          v_i.alias_pr, v_i.nome_evento, null::timestamptz, null::uuid;
      return;
    end if;

    update public.pr_ingressi i
       set usato_at = now(), usato_da = (auth.jwt() ->> 'email')
     where i.event_id = v_i.event_id and i.pr_id = v_i.pr_id and i.usato_at is null;

    if not found then
      return query select 'gia_usato'::text, v_i.alias_pr, null::text, 'PASS PR'::text,
                          null::numeric, null::boolean, null::boolean,
                          v_i.alias_pr, v_i.nome_evento, now(), null::uuid;
      return;
    end if;

    return query select 'pr_ok'::text, v_i.alias_pr, null::text, 'PASS PR'::text,
                        null::numeric, null::boolean, null::boolean,
                        v_i.alias_pr, v_i.nome_evento, now(), null::uuid;
    return;
  end if;

  v_pr := coalesce(v_b.alias_pr, 'DIREZIONE');
  v_ev := v_b.nome_evento;

  if p_event is not null and v_b.event_id <> p_event then
    return query select 'altra_serata'::text, v_b.nome, v_b.cognome, v_b.tier_label,
                        v_b.prezzo, null::boolean, null::boolean, v_pr, v_ev,
                        null::timestamptz, v_b.id;
    return;
  end if;

  if v_b.stato = 'annullata' then
    return query select 'annullato'::text, v_b.nome, v_b.cognome, v_b.tier_label,
                        v_b.prezzo, null::boolean, null::boolean, v_pr, v_ev,
                        null::timestamptz, v_b.id;
    return;
  end if;

  if v_b.stato = 'usata' then
    return query select 'gia_usato'::text, v_b.nome, v_b.cognome, v_b.tier_label,
                        v_b.prezzo, null::boolean, null::boolean, v_pr, v_ev,
                        v_b.usata_at, v_b.id;
    return;
  end if;

  if v_b.stato = 'in_attesa' then
    return query select 'non_pagato'::text, v_b.nome, v_b.cognome, v_b.tier_label,
                        v_b.prezzo, null::boolean, null::boolean, v_pr, v_ev,
                        null::timestamptz, v_b.id;
    return;
  end if;

  update public.presales s
     set stato = 'usata',
         usata_at = now(),
         usata_da = (auth.jwt() ->> 'email'),
         entrata_da = (auth.jwt() ->> 'email')
   where s.id = v_b.id and s.stato = 'attiva';

  if not found then
    return query select 'gia_usato'::text, v_b.nome, v_b.cognome, v_b.tier_label,
                        v_b.prezzo, null::boolean, null::boolean, v_pr, v_ev,
                        now(), v_b.id;
    return;
  end if;

  return query select 'ok'::text, v_b.nome, v_b.cognome, v_b.tier_label, v_b.prezzo,
                      (extract(year from now())::int - v_b.anno_nascita) < 18,
                      public.forse_under16(v_b.anno_nascita, v_b.quando_evento),
                      v_pr, v_ev, now(), v_b.id;
end;
$$;



create or replace function public.porta_cerca(p_event uuid, p_testo text)
returns table (
  id         uuid,
  nome       text,
  cognome    text,
  tier_label text,
  stato      text,
  pr_alias   text,
  minorenne  boolean,
  under16    boolean,
  token      text
)
language plpgsql
security definer
set search_path = public
stable
as $$
begin
  if not (public.is_staff() or public.is_account_manager()) then
    raise exception 'Non autorizzato';
  end if;

  if coalesce(trim(p_testo), '') = '' or length(trim(p_testo)) < 2 then
    return;
  end if;

  return query
    select s.id, s.nome, s.cognome, s.tier_label, s.stato,
           coalesce(p.alias, 'DIREZIONE'),
           (extract(year from now())::int - s.anno_nascita) < 18,
           (extract(year from now())::int - s.anno_nascita) < 16,
           s.token
    from public.presales s
    left join public.profiles p on p.id = s.pr_id
    where s.event_id = p_event
      and s.stato <> 'annullata'
      and (s.nome || ' ' || s.cognome) ilike '%' || trim(p_testo) || '%'
    order by s.cognome, s.nome
    limit 25;
end;
$$;



create or replace function public.porta_riepilogo(p_event uuid)
returns table (
  entrati      int,
  attesi       int,
  non_pagati   int,
  ultimi       jsonb
)
language plpgsql
security definer
set search_path = public
stable
as $$
begin
  if not (public.is_staff() or public.is_account_manager()) then
    raise exception 'Non autorizzato';
  end if;

  return query
  select
    (select count(*) from public.presales s
      where s.event_id = p_event and s.stato = 'usata')::int,
    (select count(*) from public.presales s
      where s.event_id = p_event and s.stato in ('attiva','usata'))::int,
    (select count(*) from public.presales s
      where s.event_id = p_event and s.stato = 'in_attesa')::int,
    (select coalesce(jsonb_agg(x), '[]'::jsonb) from (
       select s.nome, s.cognome, s.usata_at
       from public.presales s
       where s.event_id = p_event and s.stato = 'usata'
       order by s.usata_at desc
       limit 8
     ) x);
end;
$$;



create or replace function public.porta_serate()
returns table (event_id uuid, nome text, starts_at timestamptz, biglietti int)
language plpgsql
security definer
set search_path = public
stable
as $$
begin
  if not (public.is_staff() or public.is_account_manager()) then
    raise exception 'Non autorizzato';
  end if;

  return query
    select e.id, e.name, e.starts_at,
           (select count(*) from public.presales s
             where s.event_id = e.id and s.stato <> 'annullata')::int
    from public.events e
    where e.starts_at between now() - interval '18 hours' and now() + interval '10 days'
    order by e.starts_at;
end;
$$;



create or replace function public.porta_lista(p_event uuid)
returns table (
  token      text,
  nome       text,
  cognome    text,
  tier_label text,
  stato      text,
  under16    boolean,
  minorenne  boolean,
  pr_alias   text
)
language plpgsql
security definer
set search_path = public
stable
as $$
begin
  if not (public.is_staff() or public.is_account_manager()) then
    raise exception 'Non autorizzato';
  end if;

  return query
    select s.token, s.nome, s.cognome, s.tier_label, s.stato,
           (extract(year from now())::int - s.anno_nascita) < 16,
           (extract(year from now())::int - s.anno_nascita) < 18,
           coalesce(p.alias, 'DIREZIONE')
    from public.presales s
    left join public.profiles p on p.id = s.pr_id
    where s.event_id = p_event
      and s.stato <> 'annullata'
    order by s.cognome, s.nome;
end;
$$;



create or replace function public.porta_sync(p_scansioni jsonb)
returns table (
  token     text,
  esito     text,
  nome      text,
  cognome   text,
  quando    timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
declare
  r      jsonb;
  v_b    record;
  v_when timestamptz;
  v_chi  text := (auth.jwt() ->> 'email');
begin
  if not (public.is_staff() or public.is_account_manager()) then
    raise exception 'Non autorizzato';
  end if;

  for r in select * from jsonb_array_elements(coalesce(p_scansioni, '[]'::jsonb))
  loop
    select s.* into v_b from public.presales s
     where s.token = (r ->> 'token');

    if not found then
      token := r ->> 'token'; esito := 'sconosciuto';
      nome := null; cognome := null; quando := null;
      return next;
      continue;
    end if;

    v_when := coalesce((r ->> 'quando')::timestamptz, now());

    if v_b.stato = 'usata' then
      -- era già passato prima che arrivasse questa scansione
      token := v_b.token; esito := 'gia_entrato';
      nome := v_b.nome; cognome := v_b.cognome; quando := v_b.usata_at;
      return next;
      continue;
    end if;

    update public.presales s
       set stato = 'usata',
           usata_at = v_when,
           usata_da = v_chi,
           entrata_da = v_chi || ' (senza rete)',
           -- se era in attesa, chi l'ha fatto entrare se n'è preso la
           -- responsabilità: resta scritto
           attivata_at = coalesce(s.attivata_at, v_when),
           attivata_da = coalesce(s.attivata_da, v_chi || ' (in porta, senza rete)')
     where s.id = v_b.id;

    token := v_b.token;
    esito := case when v_b.stato = 'in_attesa' then 'non_pagato' else 'entrato' end;
    nome := v_b.nome; cognome := v_b.cognome; quando := v_when;
    return next;
  end loop;
end;
$$;


grant execute on function public.porta_checkin(text, uuid) to authenticated;
grant execute on function public.porta_cerca(uuid, text) to authenticated;
grant execute on function public.porta_riepilogo(uuid) to authenticated;
grant execute on function public.porta_serate() to authenticated;
grant execute on function public.porta_lista(uuid) to authenticated;
grant execute on function public.porta_sync(jsonb) to authenticated;


-- ------------------------------------------------------------
-- I tre di Luka
-- ------------------------------------------------------------
-- Li cerco per nome fra la crew approvata. Se un nome non si trova, o
-- se ce ne sono due uguali, questo blocco non indovina: lo lascia stare
-- e il controllo in fondo lo dice, così lo nomini dal pannello.
do $$
declare
  v_nome  text;
  v_id    uuid;
  v_quanti int;
begin
  foreach v_nome in array array['Leonardo Ceolin', 'Samuele Chezzi', 'Marco Florean']
  loop
    select count(*), min(p.id) into v_quanti, v_id
      from public.profiles p
     where p.role = 'crew' and p.deleted_at is null
       and (
         lower(regexp_replace(coalesce(p.nome, ''), '\s+', ' ', 'g'))
           = lower(regexp_replace(v_nome, '\s+', ' ', 'g'))
         or lower(coalesce(p.nome, '')) like '%' || lower(split_part(v_nome, ' ', 2)) || '%'
            and lower(coalesce(p.nome, '')) like '%' || lower(split_part(v_nome, ' ', 1)) || '%'
       );

    if v_quanti = 1 then
      insert into public.account_managers (profile_id, attivo, nominato_da)
      values (v_id, true, 'script 32')
      on conflict (profile_id) do update set attivo = true;
    end if;
  end loop;
end;
$$;


-- ============================================================
-- Controllo
-- ============================================================
-- Prima riga: chi è stato nominato davvero.
-- Se un nome manca, cercalo dal pannello (scheda Manager): vuol dire
-- che nel sito è scritto in un altro modo, o che non è ancora crew.
select p.alias        as "alias",
       p.nome         as "nome vero",
       p.member_number as "tessera",
       m.attivo       as "attivo"
  from public.account_managers m
  join public.profiles p on p.id = m.profile_id
 order by p.alias;
