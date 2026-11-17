-- ============================================================
-- 61 — I PR DEL PAPI-ON (la loro app)
--
-- Luka, 17 novembre 2026: i PR del PAPI-ON sono un gruppo a sé,
-- fisso, con regole loro: *"ognuno abbia il proprio profilo online,
-- gli vengano segnati gli ingressi, si faccia scannerizzare il codice
-- quando entra dalla cassiera"*. Non sono i PR dell'1% (quelli delle
-- prevendite): niente si mescola, tabelle tutte nuove.
--
-- COME FUNZIONA
--   · Luka li aggiunge dal pannello (/admin/papion-pr): nome, numero.
--     Ognuno ha un LINK SEGRETO alla sua app (unpercento.it/papion/pr/
--     <link>): chi ha il link è lui, niente mail né codici, e messa
--     sulla schermata Home resta "dentro" per sempre.
--   · Il QR dell'app (PPR-…) è un'altra cosa dal link: si mostra in
--     cassa e al bar, ma non apre l'app.
--   · IN CASSA (scanner porta): entra gratis, si segna la presenza
--     della serata (una a sera) e gli si carica il DRINK OMAGGIO.
--     Ogni 5 presenze (5ª, 10ª, 15ª…) anche lo SHOT OMAGGIO.
--     Valgono solo quella sera.
--   · AL BAR (/admin/bar): il barista scansiona e tocca DRINK OMAGGIO,
--     SHOT OMAGGIO o SCONTO 1 € (un drink alla volta, da 7 € in su,
--     lo applica il barista prima dello scontrino). Scansionare non
--     segna niente: conta il tocco. Ogni sconto resta scritto.
--   · I TAVOLI: il PR segna serata, a nome di chi, budget e/o bottiglie.
--     Luka li vede per serata e segna venuto / non venuto.
--
-- LA SERATA è la data della sera: dalle 12:00 alle 11:59 del giorno
-- dopo (ora italiana) conta come la stessa notte. Non dipende dagli
-- eventi pubblicati sul sito: il PAPI-ON apre anche senza prevendite.
--
-- COSA NON TOCCA: nessuna funzione esistente viene riscritta. La porta
-- riconosce il QR del PR dal prefisso PPR- nel browser e chiama le
-- funzioni nuove; porta_checkin resta com'era.
--
-- Da incollare nel SQL Editor di Supabase. Si può rieseguire.
-- ============================================================


-- ------------------------------------------------------------
-- 1 · LE TABELLE
-- ------------------------------------------------------------
create table if not exists public.papion_pr (
  id             uuid primary key default gen_random_uuid(),
  nome           text not null,
  cognome        text not null default '',
  telefono       text,
  link           text not null unique,          -- l'indirizzo della sua app: segreto
  qr             text not null unique,          -- 'PPR-' + 20 hex: cassa e bar
  foto           text,                          -- chiave su R2: papion-pr/<id>/<x>.webp
  attivo         boolean not null default true,
  prevendite_1p  boolean not null default false, -- fa anche le prevendite dell'1%: tasto nell'app
  installata_at  timestamptz,                   -- prima apertura dall'icona sulla Home
  aperta_at      timestamptz,                   -- ultima apertura dell'app
  created_at     timestamptz not null default now(),
  created_by     text
);

create table if not exists public.papion_pr_presenze (
  id          uuid primary key default gen_random_uuid(),
  pr_id       uuid not null references public.papion_pr (id) on delete cascade,
  serata      date not null,
  entrato_at  timestamptz not null default now(),
  da          text not null default 'cassa' check (da in ('cassa', 'bar', 'direzione')),
  numero      int not null,                     -- la sua presenza n. (1, 2, 3…)
  shot        boolean not null default false,   -- presenza multipla di 5: c'è lo shot
  drink_at    timestamptz,                      -- drink omaggio dato al bar
  drink_da    text,
  shot_at     timestamptz,
  shot_da     text,
  operatore   text,                             -- chi ha segnato l'ingresso
  unique (pr_id, serata)
);

create table if not exists public.papion_pr_sconti (
  id         uuid primary key default gen_random_uuid(),
  pr_id      uuid not null references public.papion_pr (id) on delete cascade,
  serata     date not null,
  at         timestamptz not null default now(),
  operatore  text
);
create index if not exists papion_pr_sconti_pr_serata on public.papion_pr_sconti (pr_id, serata);

create table if not exists public.papion_pr_tavoli (
  id          uuid primary key default gen_random_uuid(),
  pr_id       uuid not null references public.papion_pr (id) on delete cascade,
  serata      date not null,
  nome        text not null,                    -- a nome di chi
  budget      int,                              -- euro
  bottiglie   text,
  stato       text not null default 'segnato' check (stato in ('segnato', 'venuto', 'non_venuto')),
  created_at  timestamptz not null default now(),
  deciso_at   timestamptz,
  deciso_da   text
);
create index if not exists papion_pr_tavoli_serata on public.papion_pr_tavoli (serata);

-- tutto chiuso: si passa solo dalle funzioni
alter table public.papion_pr          enable row level security;
alter table public.papion_pr_presenze enable row level security;
alter table public.papion_pr_sconti   enable row level security;
alter table public.papion_pr_tavoli   enable row level security;


-- ------------------------------------------------------------
-- 2 · I PEZZI INTERNI
-- ------------------------------------------------------------
-- La serata di adesso: dalle 12:00 alle 11:59 del giorno dopo.
create or replace function public._papion_serata()
returns date
language sql
stable
set search_path = public
as $$
  select ((now() at time zone 'Europe/Rome') - interval '12 hours')::date;
$$;

-- Ogni quante presenze c'è lo shot. Se cambia, cambia anche lib/papion-pr.ts.
create or replace function public._papion_ogni()
returns int
language sql
immutable
as $$ select 5 $$;

-- Chi sta usando lo scanner o il pannello (per i registri)
create or replace function public._papion_operatore()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    nullif(lower(auth.jwt() ->> 'email'), ''),
    (select lower(p.email) from public.profiles p where p.id = auth.uid()),
    'sconosciuto'
  );
$$;

create or replace function public._papion_tok(p_len int)
returns text
language sql
volatile
as $$
  select substr(md5(gen_random_uuid()::text || clock_timestamp()::text)
             || md5(gen_random_uuid()::text || random()::text), 1, p_len);
$$;

-- Segna la presenza della serata (se non c'è già). true = nuova adesso.
create or replace function public._papion_pr_entra(p_pr uuid, p_da text)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_serata date := public._papion_serata();
  v_n      int;
begin
  -- uno alla volta per lo stesso PR: due scanner insieme non fanno due presenze
  perform 1 from public.papion_pr where id = p_pr for update;

  if exists (select 1 from public.papion_pr_presenze where pr_id = p_pr and serata = v_serata) then
    return false;
  end if;

  select count(*)::int + 1 into v_n from public.papion_pr_presenze where pr_id = p_pr;

  insert into public.papion_pr_presenze (pr_id, serata, da, numero, shot, operatore)
  values (p_pr, v_serata, p_da, v_n, v_n % public._papion_ogni() = 0, public._papion_operatore())
  on conflict (pr_id, serata) do nothing;

  return found;
end;
$$;

revoke execute on function public._papion_pr_entra(uuid, text) from public, anon, authenticated;
revoke execute on function public._papion_tok(int) from public, anon, authenticated;


-- ------------------------------------------------------------
-- 3 · IN CASSA (scanner porta)
-- ------------------------------------------------------------
-- esito: ok (entra, presenza nuova) · gia (già passato stasera)
--        disattivo · sconosciuto
create or replace function public.papion_pr_cassa(p_qr text)
returns table (
  esito text, nome text, cognome text, foto text,
  numero int, shot boolean, entrato_at timestamptz, da text
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_pr    public.papion_pr%rowtype;
  v_nuova boolean;
  v_p     public.papion_pr_presenze%rowtype;
begin
  if not (public.is_staff() or public.is_account_manager()) then
    raise exception 'Non autorizzato' using errcode = '42501';
  end if;

  select * into v_pr from public.papion_pr where qr = trim(p_qr);
  if not found then
    return query select 'sconosciuto'::text, null::text, null::text, null::text,
                        null::int, null::boolean, null::timestamptz, null::text;
    return;
  end if;
  if not v_pr.attivo then
    return query select 'disattivo'::text, v_pr.nome, v_pr.cognome, v_pr.foto,
                        null::int, null::boolean, null::timestamptz, null::text;
    return;
  end if;

  v_nuova := public._papion_pr_entra(v_pr.id, 'cassa');
  select * into v_p from public.papion_pr_presenze
   where pr_id = v_pr.id and serata = public._papion_serata();

  return query select case when v_nuova then 'ok' else 'gia' end,
                      v_pr.nome, v_pr.cognome, v_pr.foto,
                      v_p.numero, v_p.shot, v_p.entrato_at, v_p.da;
end;
$$;

revoke execute on function public.papion_pr_cassa(text) from public, anon;
grant execute on function public.papion_pr_cassa(text) to authenticated;


-- ------------------------------------------------------------
-- 4 · AL BAR
-- ------------------------------------------------------------
-- Leggere: chi è e cosa gli spetta stasera. Non segna niente.
-- Se non è passato dalla cassa il drink c'è lo stesso: è dentro,
-- e usandolo la presenza si segna da sola.
create or replace function public.papion_pr_bar(p_qr text)
returns table (
  esito text, nome text, cognome text, foto text,
  entrato_at timestamptz, drink_at timestamptz,
  shot_previsto boolean, shot_at timestamptz,
  sconti int, ultimo_sconto timestamptz, presenze int
)
language plpgsql
security definer
set search_path = public
stable
as $$
declare
  v_pr  public.papion_pr%rowtype;
  v_p   public.papion_pr_presenze%rowtype;
  v_tot int;
  v_s   int;
  v_u   timestamptz;
begin
  if not (public.is_staff() or public.is_account_manager()) then
    raise exception 'Non autorizzato' using errcode = '42501';
  end if;

  select * into v_pr from public.papion_pr where qr = trim(p_qr);
  if not found then
    return query select 'sconosciuto'::text, null::text, null::text, null::text,
      null::timestamptz, null::timestamptz, null::boolean, null::timestamptz,
      null::int, null::timestamptz, null::int;
    return;
  end if;

  select count(*)::int into v_tot from public.papion_pr_presenze where pr_id = v_pr.id;
  select * into v_p from public.papion_pr_presenze
   where pr_id = v_pr.id and serata = public._papion_serata();
  select count(*)::int, max(s.at) into v_s, v_u from public.papion_pr_sconti s
   where s.pr_id = v_pr.id and s.serata = public._papion_serata();

  return query select
    case when v_pr.attivo then 'ok' else 'disattivo' end,
    v_pr.nome, v_pr.cognome, v_pr.foto,
    v_p.entrato_at, v_p.drink_at,
    case when v_p.id is null then (v_tot + 1) % public._papion_ogni() = 0 else v_p.shot end,
    v_p.shot_at,
    v_s, v_u, v_tot;
end;
$$;

revoke execute on function public.papion_pr_bar(text) from public, anon;
grant execute on function public.papion_pr_bar(text) to authenticated;


-- Usare: p_cosa = 'drink' · 'shot' · 'sconto'
-- esito: ok · gia (già dato / sconto appena segnato: doppio tocco)
--        niente_shot · disattivo · sconosciuto · cosa
create or replace function public.papion_pr_bar_usa(p_qr text, p_cosa text)
returns table (esito text, quando timestamptz, sconti int)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_pr     public.papion_pr%rowtype;
  v_serata date := public._papion_serata();
  v_op     text := public._papion_operatore();
  v_quando timestamptz;
  v_shot   boolean;
  v_s      int;
begin
  if not (public.is_staff() or public.is_account_manager()) then
    raise exception 'Non autorizzato' using errcode = '42501';
  end if;
  if p_cosa not in ('drink', 'shot', 'sconto') then
    return query select 'cosa'::text, null::timestamptz, null::int; return;
  end if;

  select * into v_pr from public.papion_pr where qr = trim(p_qr);
  if not found then
    return query select 'sconosciuto'::text, null::timestamptz, null::int; return;
  end if;
  if not v_pr.attivo then
    return query select 'disattivo'::text, null::timestamptz, null::int; return;
  end if;

  if p_cosa = 'sconto' then
    -- uno alla volta; un secondo tocco entro 10 secondi è lo stesso drink
    perform 1 from public.papion_pr where id = v_pr.id for update;
    select max(s.at) into v_quando from public.papion_pr_sconti s
     where s.pr_id = v_pr.id and s.serata = v_serata;
    if v_quando is not null and v_quando > now() - interval '10 seconds' then
      select count(*)::int into v_s from public.papion_pr_sconti s
       where s.pr_id = v_pr.id and s.serata = v_serata;
      return query select 'gia'::text, v_quando, v_s; return;
    end if;
    insert into public.papion_pr_sconti (pr_id, serata, operatore) values (v_pr.id, v_serata, v_op);
    select count(*)::int into v_s from public.papion_pr_sconti s
     where s.pr_id = v_pr.id and s.serata = v_serata;
    return query select 'ok'::text, now(), v_s; return;
  end if;

  -- drink e shot stanno sulla presenza: se non è passato dalla cassa, si segna adesso
  perform public._papion_pr_entra(v_pr.id, 'bar');

  if p_cosa = 'drink' then
    update public.papion_pr_presenze p
       set drink_at = now(), drink_da = v_op
     where p.pr_id = v_pr.id and p.serata = v_serata and p.drink_at is null;
    if found then
      return query select 'ok'::text, now(), null::int; return;
    end if;
    select p.drink_at into v_quando from public.papion_pr_presenze p
     where p.pr_id = v_pr.id and p.serata = v_serata;
    return query select 'gia'::text, v_quando, null::int; return;
  end if;

  -- shot
  select p.shot, p.shot_at into v_shot, v_quando from public.papion_pr_presenze p
   where p.pr_id = v_pr.id and p.serata = v_serata;
  if not coalesce(v_shot, false) then
    return query select 'niente_shot'::text, null::timestamptz, null::int; return;
  end if;
  if v_quando is not null then
    return query select 'gia'::text, v_quando, null::int; return;
  end if;
  update public.papion_pr_presenze p
     set shot_at = now(), shot_da = v_op
   where p.pr_id = v_pr.id and p.serata = v_serata and p.shot_at is null;
  return query select 'ok'::text, now(), null::int;
end;
$$;

revoke execute on function public.papion_pr_bar_usa(text, text) from public, anon;
grant execute on function public.papion_pr_bar_usa(text, text) to authenticated;


-- ------------------------------------------------------------
-- 5 · L'APP DEL PR (chi ha il link è lui)
-- ------------------------------------------------------------
-- Tutto quello che la sua pagina mostra. null = link sbagliato o tolto.
-- p_icona: la pagina è aperta dall'icona sulla Home (per il pannello).
create or replace function public.papion_pr_app(p_link text, p_icona boolean default false)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_pr     public.papion_pr%rowtype;
  v_serata date := public._papion_serata();
  v_p      public.papion_pr_presenze%rowtype;
begin
  if p_link is null or p_link !~ '^[0-9a-f]{24}$' then
    return null;
  end if;
  select * into v_pr from public.papion_pr where link = p_link;
  if not found or not v_pr.attivo then
    return null;
  end if;

  -- quando l'ha aperta: per il pannello, senza scrivere a ogni giro
  if v_pr.aperta_at is null or v_pr.aperta_at < now() - interval '5 minutes'
     or (p_icona and v_pr.installata_at is null) then
    update public.papion_pr
       set aperta_at = now(),
           installata_at = case when p_icona and installata_at is null then now() else installata_at end
     where id = v_pr.id;
  end if;

  select * into v_p from public.papion_pr_presenze where pr_id = v_pr.id and serata = v_serata;

  return jsonb_build_object(
    'id', v_pr.id,
    'nome', v_pr.nome,
    'cognome', v_pr.cognome,
    'foto', v_pr.foto,
    'qr', v_pr.qr,
    'prevendite_1p', v_pr.prevendite_1p,
    'dal', v_pr.created_at,
    'ogni', public._papion_ogni(),
    'serata', v_serata,
    'presenze', (select count(*) from public.papion_pr_presenze where pr_id = v_pr.id),
    'drink', (select count(*) from public.papion_pr_presenze where pr_id = v_pr.id and drink_at is not null),
    'shot', (select count(*) from public.papion_pr_presenze where pr_id = v_pr.id and shot_at is not null),
    'sconti', (select count(*) from public.papion_pr_sconti where pr_id = v_pr.id),
    'sconti_stasera', (select count(*) from public.papion_pr_sconti where pr_id = v_pr.id and serata = v_serata),
    'stasera', case when v_p.id is null then null else jsonb_build_object(
        'entrato_at', v_p.entrato_at, 'numero', v_p.numero, 'shot', v_p.shot,
        'drink_at', v_p.drink_at, 'shot_at', v_p.shot_at) end,
    'storico', coalesce((
        select jsonb_agg(jsonb_build_object(
                 'serata', x.serata, 'numero', x.numero, 'shot', x.shot,
                 'drink', x.drink_at is not null, 'shot_preso', x.shot_at is not null)
               order by x.serata desc)
          from (select * from public.papion_pr_presenze
                 where pr_id = v_pr.id order by serata desc limit 12) x), '[]'::jsonb),
    'tavoli', coalesce((
        select jsonb_agg(jsonb_build_object(
                 'id', t.id, 'serata', t.serata, 'nome', t.nome, 'budget', t.budget,
                 'bottiglie', t.bottiglie, 'stato', t.stato)
               order by t.serata desc, t.created_at desc)
          from public.papion_pr_tavoli t
         where t.pr_id = v_pr.id and t.serata >= v_serata - 60), '[]'::jsonb),
    'tavoli_tot', (select count(*) from public.papion_pr_tavoli
                    where pr_id = v_pr.id and stato <> 'non_venuto')
  );
end;
$$;

grant execute on function public.papion_pr_app(text, boolean) to anon, authenticated;


-- Segna un tavolo. esito: ok:<id> · link · data · nome · vuoto · budget · troppi
create or replace function public.papion_pr_tavolo(
  p_link text, p_serata date, p_nome text, p_budget int, p_bottiglie text
)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_pr   public.papion_pr%rowtype;
  v_nome text := nullif(btrim(regexp_replace(coalesce(p_nome, ''), '\s+', ' ', 'g')), '');
  v_bott text := nullif(btrim(coalesce(p_bottiglie, '')), '');
  v_id   uuid;
begin
  if p_link is null or p_link !~ '^[0-9a-f]{24}$' then return 'link'; end if;
  select * into v_pr from public.papion_pr where link = p_link and attivo;
  if not found then return 'link'; end if;

  if p_serata is null or p_serata < public._papion_serata()
     or p_serata > public._papion_serata() + 120 then
    return 'data';
  end if;
  if v_nome is null or length(v_nome) < 2 or length(v_nome) > 60 then return 'nome'; end if;
  if p_budget is null and v_bott is null then return 'vuoto'; end if;
  if p_budget is not null and (p_budget < 1 or p_budget > 20000) then return 'budget'; end if;
  if v_bott is not null and length(v_bott) > 200 then return 'vuoto'; end if;
  if (select count(*) from public.papion_pr_tavoli
       where pr_id = v_pr.id and serata = p_serata) >= 40 then
    return 'troppi';
  end if;

  insert into public.papion_pr_tavoli (pr_id, serata, nome, budget, bottiglie)
  values (v_pr.id, p_serata, v_nome, p_budget, v_bott)
  returning id into v_id;
  return 'ok:' || v_id;
end;
$$;

grant execute on function public.papion_pr_tavolo(text, date, text, int, text) to anon, authenticated;


-- Toglie un suo tavolo, finché la serata non è passata e Luka non l'ha già segnato.
create or replace function public.papion_pr_tavolo_togli(p_link text, p_id uuid)
returns text
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_link is null or p_link !~ '^[0-9a-f]{24}$' then return 'link'; end if;
  delete from public.papion_pr_tavoli t
   using public.papion_pr p
   where t.id = p_id and t.pr_id = p.id and p.link = p_link and p.attivo
     and t.serata >= public._papion_serata() and t.stato = 'segnato';
  return case when found then 'ok' else 'no' end;
end;
$$;

grant execute on function public.papion_pr_tavolo_togli(text, uuid) to anon, authenticated;


-- La foto: la carica il server (/api/papion-pr/foto) e poi la segna qui.
-- Torna la chiave vecchia (da buttare) o ''. null = link sbagliato.
create or replace function public.papion_pr_foto(p_link text, p_key text)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_pr public.papion_pr%rowtype;
begin
  if p_link is null or p_link !~ '^[0-9a-f]{24}$' then return null; end if;
  select * into v_pr from public.papion_pr where link = p_link and attivo;
  if not found then return null; end if;
  if p_key !~ ('^papion-pr/' || v_pr.id::text || '/[0-9a-f]{12}\.webp$') then
    raise exception 'chiave non valida';
  end if;
  update public.papion_pr set foto = p_key where id = v_pr.id;
  return coalesce(v_pr.foto, '');
end;
$$;

grant execute on function public.papion_pr_foto(text, text) to anon, authenticated;


-- ------------------------------------------------------------
-- 6 · IL PANNELLO DI LUKA
-- ------------------------------------------------------------
create or replace function public.admin_papion_pr_lista()
returns table (
  id uuid, nome text, cognome text, telefono text, link text, foto text,
  attivo boolean, prevendite_1p boolean, created_at timestamptz,
  installata_at timestamptz, aperta_at timestamptz,
  presenze int, ultima date, presenze_30 int, stasera boolean,
  drink int, shot int, sconti int, tavoli int, tavoli_budget int
)
language plpgsql
security definer
set search_path = public
stable
as $$
declare
  v_serata date := public._papion_serata();
begin
  if not public.is_admin() then
    raise exception 'Non autorizzato' using errcode = '42501';
  end if;
  return query
    select p.id, p.nome, p.cognome, p.telefono, p.link, p.foto,
           p.attivo, p.prevendite_1p, p.created_at, p.installata_at, p.aperta_at,
           (select count(*)::int from public.papion_pr_presenze x where x.pr_id = p.id),
           (select max(x.serata) from public.papion_pr_presenze x where x.pr_id = p.id),
           (select count(*)::int from public.papion_pr_presenze x
             where x.pr_id = p.id and x.serata > v_serata - 30),
           exists (select 1 from public.papion_pr_presenze x where x.pr_id = p.id and x.serata = v_serata),
           (select count(*)::int from public.papion_pr_presenze x where x.pr_id = p.id and x.drink_at is not null),
           (select count(*)::int from public.papion_pr_presenze x where x.pr_id = p.id and x.shot_at is not null),
           (select count(*)::int from public.papion_pr_sconti s where s.pr_id = p.id),
           (select count(*)::int from public.papion_pr_tavoli t where t.pr_id = p.id and t.stato <> 'non_venuto'),
           (select coalesce(sum(t.budget), 0)::int from public.papion_pr_tavoli t
             where t.pr_id = p.id and t.stato <> 'non_venuto')
      from public.papion_pr p
     order by p.attivo desc, lower(p.nome), lower(p.cognome);
end;
$$;

revoke execute on function public.admin_papion_pr_lista() from public, anon;
grant execute on function public.admin_papion_pr_lista() to authenticated;


-- Crea (p_id null) o modifica. Torna l'id.
create or replace function public.admin_papion_pr_salva(
  p_id uuid, p_nome text, p_cognome text, p_telefono text,
  p_attivo boolean default true, p_prevendite_1p boolean default false
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_nome text := nullif(btrim(regexp_replace(coalesce(p_nome, ''), '\s+', ' ', 'g')), '');
  v_cogn text := btrim(regexp_replace(coalesce(p_cognome, ''), '\s+', ' ', 'g'));
  v_tel  text := nullif(btrim(coalesce(p_telefono, '')), '');
  v_id   uuid;
begin
  if not public.is_admin() then
    raise exception 'Non autorizzato' using errcode = '42501';
  end if;
  if v_nome is null or length(v_nome) > 40 or length(v_cogn) > 60 then
    raise exception 'Nome mancante o troppo lungo';
  end if;
  if v_tel is not null and v_tel !~ '^\+\d{10,15}$' then
    raise exception 'Numero non valido: scrivilo col prefisso, tipo +39 347…';
  end if;

  if p_id is null then
    insert into public.papion_pr (nome, cognome, telefono, link, qr, attivo, prevendite_1p, created_by)
    values (v_nome, v_cogn, v_tel, public._papion_tok(24), 'PPR-' || public._papion_tok(20),
            coalesce(p_attivo, true), coalesce(p_prevendite_1p, false), public._papion_operatore())
    returning id into v_id;
    insert into public.admin_log (actor, action, target, payload)
    values (public._papion_operatore(), 'papion_pr_crea', v_id::text,
            jsonb_build_object('nome', v_nome, 'cognome', v_cogn));
    return v_id;
  end if;

  update public.papion_pr
     set nome = v_nome, cognome = v_cogn, telefono = v_tel,
         attivo = coalesce(p_attivo, attivo),
         prevendite_1p = coalesce(p_prevendite_1p, prevendite_1p)
   where id = p_id
  returning id into v_id;
  if v_id is null then raise exception 'PR non trovato'; end if;
  return v_id;
end;
$$;

revoke execute on function public.admin_papion_pr_salva(uuid, text, text, text, boolean, boolean) from public, anon;
grant execute on function public.admin_papion_pr_salva(uuid, text, text, text, boolean, boolean) to authenticated;


-- Link e QR nuovi: i vecchi smettono di funzionare (telefono perso, link girato).
create or replace function public.admin_papion_pr_nuovo_link(p_id uuid)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_link text := public._papion_tok(24);
begin
  if not public.is_admin() then
    raise exception 'Non autorizzato' using errcode = '42501';
  end if;
  update public.papion_pr
     set link = v_link, qr = 'PPR-' || public._papion_tok(20), installata_at = null
   where id = p_id;
  if not found then raise exception 'PR non trovato'; end if;
  insert into public.admin_log (actor, action, target, payload)
  values (public._papion_operatore(), 'papion_pr_nuovo_link', p_id::text, null);
  return v_link;
end;
$$;

revoke execute on function public.admin_papion_pr_nuovo_link(uuid) from public, anon;
grant execute on function public.admin_papion_pr_nuovo_link(uuid) to authenticated;


-- Elimina il PR con presenze, sconti e tavoli. Torna la chiave della foto (o '').
create or replace function public.admin_papion_pr_elimina(p_id uuid)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_pr public.papion_pr%rowtype;
begin
  if not public.is_admin() then
    raise exception 'Non autorizzato' using errcode = '42501';
  end if;
  delete from public.papion_pr where id = p_id returning * into v_pr;
  if v_pr.id is null then raise exception 'PR non trovato'; end if;
  insert into public.admin_log (actor, action, target, payload)
  values (public._papion_operatore(), 'papion_pr_elimina', p_id::text,
          jsonb_build_object('nome', v_pr.nome, 'cognome', v_pr.cognome));
  return coalesce(v_pr.foto, '');
end;
$$;

revoke execute on function public.admin_papion_pr_elimina(uuid) from public, anon;
grant execute on function public.admin_papion_pr_elimina(uuid) to authenticated;


-- La foto messa da Luka dal pannello (stessa regola della chiave). Torna la vecchia.
create or replace function public.admin_papion_pr_foto(p_id uuid, p_key text)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_old text;
begin
  if not public.is_admin() then
    raise exception 'Non autorizzato' using errcode = '42501';
  end if;
  if p_key !~ ('^papion-pr/' || p_id::text || '/[0-9a-f]{12}\.webp$') then
    raise exception 'chiave non valida';
  end if;
  select foto into v_old from public.papion_pr where id = p_id;
  if not found then raise exception 'PR non trovato'; end if;
  update public.papion_pr set foto = p_key where id = p_id;
  return coalesce(v_old, '');
end;
$$;

revoke execute on function public.admin_papion_pr_foto(uuid, text) from public, anon;
grant execute on function public.admin_papion_pr_foto(uuid, text) to authenticated;


-- La scheda di un PR: presenze, sconti per serata, tavoli.
create or replace function public.admin_papion_pr_scheda(p_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
stable
as $$
begin
  if not public.is_admin() then
    raise exception 'Non autorizzato' using errcode = '42501';
  end if;
  return jsonb_build_object(
    'presenze', coalesce((
      select jsonb_agg(jsonb_build_object(
               'serata', x.serata, 'entrato_at', x.entrato_at, 'da', x.da, 'numero', x.numero,
               'shot', x.shot, 'drink_at', x.drink_at, 'shot_at', x.shot_at,
               'sconti', (select count(*) from public.papion_pr_sconti s
                           where s.pr_id = x.pr_id and s.serata = x.serata))
             order by x.serata desc)
        from public.papion_pr_presenze x where x.pr_id = p_id), '[]'::jsonb),
    -- sconti presi in serate senza presenza (non è passato da cassa né ha preso il drink)
    'sconti_fuori', coalesce((
      select jsonb_agg(jsonb_build_object('serata', s.serata, 'n', s.n) order by s.serata desc)
        from (select serata, count(*) as n from public.papion_pr_sconti
               where pr_id = p_id
                 and serata not in (select serata from public.papion_pr_presenze where pr_id = p_id)
               group by serata) s), '[]'::jsonb),
    'tavoli', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', t.id, 'serata', t.serata, 'nome', t.nome, 'budget', t.budget,
               'bottiglie', t.bottiglie, 'stato', t.stato, 'created_at', t.created_at)
             order by t.serata desc, t.created_at desc)
        from public.papion_pr_tavoli t where t.pr_id = p_id), '[]'::jsonb)
  );
end;
$$;

revoke execute on function public.admin_papion_pr_scheda(uuid) from public, anon;
grant execute on function public.admin_papion_pr_scheda(uuid) to authenticated;


-- Le serate con qualcosa dentro (presenze, sconti o tavoli): le future in cima.
create or replace function public.admin_papion_pr_serate()
returns table (serata date, entrati int, sconti int, tavoli int, adesso boolean)
language plpgsql
security definer
set search_path = public
stable
as $$
declare
  v_serata date := public._papion_serata();
begin
  if not public.is_admin() then
    raise exception 'Non autorizzato' using errcode = '42501';
  end if;
  return query
    with d as (
      select v_serata as serata
      union select x.serata from public.papion_pr_presenze x
      union select s.serata from public.papion_pr_sconti s
      union select t.serata from public.papion_pr_tavoli t
    )
    select d.serata,
           (select count(*)::int from public.papion_pr_presenze x where x.serata = d.serata),
           (select count(*)::int from public.papion_pr_sconti s where s.serata = d.serata),
           (select count(*)::int from public.papion_pr_tavoli t where t.serata = d.serata),
           d.serata = v_serata
      from d
     where d.serata > v_serata - 120
     order by d.serata desc
     limit 60;
end;
$$;

revoke execute on function public.admin_papion_pr_serate() from public, anon;
grant execute on function public.admin_papion_pr_serate() to authenticated;


-- Una serata: chi dei PR è entrato (drink, shot, sconti) e i tavoli segnati.
create or replace function public.admin_papion_pr_serata(p_serata date)
returns jsonb
language plpgsql
security definer
set search_path = public
stable
as $$
begin
  if not public.is_admin() then
    raise exception 'Non autorizzato' using errcode = '42501';
  end if;
  return jsonb_build_object(
    'entrati', coalesce((
      select jsonb_agg(jsonb_build_object(
               'pr_id', p.id, 'nome', p.nome, 'cognome', p.cognome, 'foto', p.foto,
               'entrato_at', x.entrato_at, 'da', x.da, 'numero', x.numero, 'shot', x.shot,
               'drink_at', x.drink_at, 'shot_at', x.shot_at,
               'sconti', (select count(*) from public.papion_pr_sconti s
                           where s.pr_id = p.id and s.serata = p_serata))
             order by x.entrato_at)
        from public.papion_pr_presenze x
        join public.papion_pr p on p.id = x.pr_id
       where x.serata = p_serata), '[]'::jsonb),
    'sconti_senza_ingresso', coalesce((
      select jsonb_agg(jsonb_build_object('pr_id', p.id, 'nome', p.nome, 'cognome', p.cognome, 'n', s.n))
        from (select pr_id, count(*) as n from public.papion_pr_sconti
               where serata = p_serata
                 and pr_id not in (select pr_id from public.papion_pr_presenze where serata = p_serata)
               group by pr_id) s
        join public.papion_pr p on p.id = s.pr_id), '[]'::jsonb),
    'tavoli', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', t.id, 'pr_id', p.id, 'pr', trim(p.nome || ' ' || p.cognome),
               'nome', t.nome, 'budget', t.budget, 'bottiglie', t.bottiglie,
               'stato', t.stato, 'created_at', t.created_at)
             order by lower(p.nome), t.created_at)
        from public.papion_pr_tavoli t
        join public.papion_pr p on p.id = t.pr_id
       where t.serata = p_serata), '[]'::jsonb)
  );
end;
$$;

revoke execute on function public.admin_papion_pr_serata(date) from public, anon;
grant execute on function public.admin_papion_pr_serata(date) to authenticated;


-- Tavolo: segnato · venuto · non_venuto
create or replace function public.admin_papion_pr_tavolo_stato(p_id uuid, p_stato text)
returns text
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception 'Non autorizzato' using errcode = '42501';
  end if;
  if p_stato not in ('segnato', 'venuto', 'non_venuto') then
    raise exception 'Stato non valido';
  end if;
  update public.papion_pr_tavoli
     set stato = p_stato,
         deciso_at = case when p_stato = 'segnato' then null else now() end,
         deciso_da = case when p_stato = 'segnato' then null else public._papion_operatore() end
   where id = p_id;
  return case when found then 'ok' else 'no' end;
end;
$$;

revoke execute on function public.admin_papion_pr_tavolo_stato(uuid, text) from public, anon;
grant execute on function public.admin_papion_pr_tavolo_stato(uuid, text) to authenticated;


-- Presenza a mano (la cassa se l'è dimenticato) o tolta (scansionato per sbaglio).
-- Aggiunta: vale come le altre, anche per il conto degli shot.
create or replace function public.admin_papion_pr_presenza(p_pr uuid, p_serata date, p_on boolean)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_n int;
begin
  if not public.is_admin() then
    raise exception 'Non autorizzato' using errcode = '42501';
  end if;
  if p_serata is null or p_serata > public._papion_serata() then
    return 'data';
  end if;

  if not p_on then
    delete from public.papion_pr_presenze where pr_id = p_pr and serata = p_serata;
    return case when found then 'tolta' else 'non_cera' end;
  end if;

  perform 1 from public.papion_pr where id = p_pr for update;
  if not found then return 'pr'; end if;
  if exists (select 1 from public.papion_pr_presenze where pr_id = p_pr and serata = p_serata) then
    return 'gia';
  end if;
  select count(*)::int + 1 into v_n from public.papion_pr_presenze where pr_id = p_pr;
  insert into public.papion_pr_presenze (pr_id, serata, entrato_at, da, numero, shot, operatore)
  values (p_pr, p_serata,
          case when p_serata = public._papion_serata() then now()
               else ((p_serata + time '23:30') at time zone 'Europe/Rome') end,
          'direzione', v_n, v_n % public._papion_ogni() = 0, public._papion_operatore());
  return 'ok';
end;
$$;

revoke execute on function public.admin_papion_pr_presenza(uuid, date, boolean) from public, anon;
grant execute on function public.admin_papion_pr_presenza(uuid, date, boolean) to authenticated;


-- ------------------------------------------------------------
-- CONTROLLO: deve uscire una riga con "pronto ✓"
-- ------------------------------------------------------------
select 'pronto ✓' as pr_papion,
       (select count(*) from public.papion_pr) as pr_registrati,
       public._papion_serata() as serata_di_adesso;
