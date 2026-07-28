-- ============================================================
-- 1% — LOCALI ED EVENTI (step 2)
--
-- Da eseguire DOPO RESET.sql. Incollalo tutto e premi Run.
-- È idempotente: rilanciarlo non rompe niente.
--
-- Cosa introduce:
--   · i locali in cui organizziamo
--   · gli eventi, ognuno col suo nome e la sua identità
--   · il REVEAL: un evento può restare nascosto dietro i punti
--     di domanda finché non decidi tu di svelarlo
--
-- IMPORTANTE — il nome di un evento non ancora svelato NON esce
-- mai dal server. Le funzioni pubbliche lo tolgono dalla risposta,
-- quindi non si può sbirciare aprendo il codice del sito.
-- ============================================================

create extension if not exists "pgcrypto";

-- ============================================================
-- 1. LOCALI
-- ============================================================

create table if not exists public.venues (
  id         uuid primary key default gen_random_uuid(),
  name       text not null,
  slug       text not null unique,
  city       text,
  address    text,
  created_at timestamptz not null default now()
);

alter table public.venues enable row level security;


-- ============================================================
-- 2. EVENTI
--
-- Ogni festa tiene il proprio nome: "1%" è la firma sopra, sta
-- nel layout del sito, non dentro il dato.
-- ============================================================

create table if not exists public.events (
  id          uuid primary key default gen_random_uuid(),
  venue_id    uuid references public.venues (id) on delete restrict,
  name        text not null,
  slug        text not null unique,
  starts_at   timestamptz not null,
  ends_at     timestamptz,
  -- null = già svelato. Con una data, il nome resta nascosto fino ad allora.
  reveal_at   timestamptz,
  -- cosa si legge al posto del nome prima del reveal
  teaser      text,
  descrizione text,
  cover_key   text,
  published   boolean not null default false,
  created_at  timestamptz not null default now()
);

create index if not exists events_starts_idx on public.events (starts_at desc);
create index if not exists events_published_idx on public.events (published, starts_at);

alter table public.events enable row level security;
-- Nessuna policy: si legge solo dalle funzioni qui sotto, che
-- sanno cosa nascondere. Accesso diretto alla tabella = niente.


-- ============================================================
-- 3. UTILITÀ
-- ============================================================

-- Sostituzione accenti minimale: evita di dover installare unaccent.
-- Va definita prima di slugify, che la usa.
create or replace function public.unaccent_semplice(p_testo text)
returns text
language sql
immutable
as $$
  select translate(
    coalesce(p_testo, ''),
    'àáâäãåèéêëìíîïòóôöõùúûüñçÀÁÂÄÃÅÈÉÊËÌÍÎÏÒÓÔÖÕÙÚÛÜÑÇ',
    'aaaaaaeeeeiiiiooooouuuuncAAAAAAEEEEIIIIOOOOOUUUUNC'
  );
$$;

-- Trasforma "MALDITA by 1%" in "maldita-by-1". Serve per gli
-- indirizzi delle pagine, così non devi inventarteli tu.
create or replace function public.slugify(p_testo text)
returns text
language sql
immutable
as $$
  select trim(both '-' from
    regexp_replace(
      regexp_replace(lower(public.unaccent_semplice(p_testo)), '[^a-z0-9]+', '-', 'g'),
      '-+', '-', 'g'
    )
  );
$$;

-- Un evento è svelato se non ha una data di reveal, o se è passata.
create or replace function public.evento_svelato(p_reveal timestamptz)
returns boolean
language sql
immutable
as $$
  select p_reveal is null or p_reveal <= now();
$$;


-- ============================================================
-- 4. LETTURE PUBBLICHE
--
-- Qui sta la regola: se l'evento non è svelato, nome, locale,
-- descrizione e indirizzo della pagina NON vengono restituiti.
-- Esce solo la data e il teaser.
-- ============================================================

create or replace function public.evento_pubblico(e public.events, v public.venues)
returns jsonb
language sql
stable
as $$
  select case
    when public.evento_svelato(e.reveal_at) then jsonb_build_object(
      'svelato',     true,
      'id',          e.id,
      'slug',        e.slug,
      'nome',        e.name,
      'locale',      v.name,
      'citta',       v.city,
      'indirizzo',   v.address,
      'descrizione', e.descrizione,
      'cover_key',   e.cover_key,
      'starts_at',   e.starts_at,
      'ends_at',     e.ends_at,
      'passato',     coalesce(e.ends_at, e.starts_at) < now()
    )
    else jsonb_build_object(
      'svelato',   false,
      'teaser',    e.teaser,
      'reveal_at', e.reveal_at,
      'starts_at', e.starts_at,
      'ends_at',   e.ends_at,
      'passato',   false
    )
  end;
$$;

-- Il prossimo evento, per la home. null se non c'è niente in programma.
create or replace function public.next_event()
returns jsonb
language sql
security definer
set search_path = public
stable
as $$
  select public.evento_pubblico(e, v)
  from public.events e
  left join public.venues v on v.id = e.venue_id
  where e.published
    and coalesce(e.ends_at, e.starts_at + interval '4 hours') >= now()
  order by e.starts_at
  limit 1;
$$;

grant execute on function public.next_event() to anon, authenticated;

-- Il calendario completo: in programma prima, poi i passati.
create or replace function public.events_list()
returns jsonb
language sql
security definer
set search_path = public
stable
as $$
  select coalesce(jsonb_agg(x order by grp, ord), '[]'::jsonb)
  from (
    select
      public.evento_pubblico(e, v) as x,
      -- prima quelli in programma, poi i passati
      case when coalesce(e.ends_at, e.starts_at) >= now() then 0 else 1 end as grp,
      -- futuri: il più vicino per primo. passati: il più recente per primo.
      case when coalesce(e.ends_at, e.starts_at) >= now()
           then  extract(epoch from e.starts_at)
           else -extract(epoch from e.starts_at)
      end as ord
    from public.events e
    left join public.venues v on v.id = e.venue_id
    where e.published
  ) t;
$$;

grant execute on function public.events_list() to anon, authenticated;

-- La scheda di un evento. Gli eventi non svelati non hanno un
-- indirizzo pubblico, quindi da qui non si raggiungono.
create or replace function public.event_by_slug(p_slug text)
returns jsonb
language sql
security definer
set search_path = public
stable
as $$
  select public.evento_pubblico(e, v)
  from public.events e
  left join public.venues v on v.id = e.venue_id
  where e.published
    and e.slug = p_slug
    and public.evento_svelato(e.reveal_at)
  limit 1;
$$;

grant execute on function public.event_by_slug(text) to anon, authenticated;


-- ============================================================
-- 5. PANNELLO ADMIN
-- ============================================================

create or replace function public.admin_venues()
returns table (id uuid, name text, slug text, city text, address text, eventi bigint)
language plpgsql
security definer
set search_path = public
stable
as $$
begin
  if not public.is_admin() then raise exception 'Non autorizzato'; end if;

  return query
  select v.id, v.name, v.slug, v.city, v.address,
         (select count(*) from public.events e where e.venue_id = v.id)
  from public.venues v
  order by v.name;
end;
$$;

revoke execute on function public.admin_venues() from anon;
grant execute on function public.admin_venues() to authenticated;


-- Crea o aggiorna un locale. p_id null = nuovo.
create or replace function public.admin_save_venue(
  p_id      uuid,
  p_name    text,
  p_city    text default null,
  p_address text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id   uuid;
  v_slug text;
begin
  if not public.is_admin() then raise exception 'Non autorizzato'; end if;
  if coalesce(trim(p_name), '') = '' then raise exception 'Serve il nome del locale'; end if;

  v_slug := public.slugify(p_name);

  if p_id is null then
    -- se lo slug è già preso, ci attacco un pezzo casuale
    if exists (select 1 from public.venues where slug = v_slug) then
      v_slug := v_slug || '-' || substr(md5(gen_random_uuid()::text), 1, 4);
    end if;

    insert into public.venues (name, slug, city, address)
    values (trim(p_name), v_slug, nullif(trim(coalesce(p_city, '')), ''),
            nullif(trim(coalesce(p_address, '')), ''))
    returning id into v_id;

    perform public.log_admin('crea_locale', v_id::text, jsonb_build_object('nome', p_name));
  else
    update public.venues
    set name = trim(p_name),
        city = nullif(trim(coalesce(p_city, '')), ''),
        address = nullif(trim(coalesce(p_address, '')), '')
    where id = p_id
    returning id into v_id;

    perform public.log_admin('modifica_locale', v_id::text, jsonb_build_object('nome', p_name));
  end if;

  return v_id;
end;
$$;

revoke execute on function public.admin_save_venue(uuid, text, text, text) from anon;
grant execute on function public.admin_save_venue(uuid, text, text, text) to authenticated;


create or replace function public.admin_delete_venue(p_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then raise exception 'Non autorizzato'; end if;

  if exists (select 1 from public.events where venue_id = p_id) then
    raise exception 'Ci sono eventi in questo locale: spostali o cancellali prima';
  end if;

  delete from public.venues where id = p_id;
  perform public.log_admin('cancella_locale', p_id::text, null);
end;
$$;

revoke execute on function public.admin_delete_venue(uuid) from anon;
grant execute on function public.admin_delete_venue(uuid) to authenticated;


-- Tutti gli eventi, senza nascondere niente: qui sei tu.
create or replace function public.admin_events()
returns table (
  id uuid, name text, slug text, venue_id uuid, locale text,
  starts_at timestamptz, ends_at timestamptz, reveal_at timestamptz,
  teaser text, descrizione text, published boolean, svelato boolean
)
language plpgsql
security definer
set search_path = public
stable
as $$
begin
  if not public.is_admin() then raise exception 'Non autorizzato'; end if;

  return query
  select e.id, e.name, e.slug, e.venue_id, v.name,
         e.starts_at, e.ends_at, e.reveal_at,
         e.teaser, e.descrizione, e.published,
         public.evento_svelato(e.reveal_at)
  from public.events e
  left join public.venues v on v.id = e.venue_id
  order by e.starts_at desc;
end;
$$;

revoke execute on function public.admin_events() from anon;
grant execute on function public.admin_events() to authenticated;


-- Crea o aggiorna un evento. p_id null = nuovo.
create or replace function public.admin_save_event(
  p_id          uuid,
  p_name        text,
  p_venue_id    uuid,
  p_starts_at   timestamptz,
  p_ends_at     timestamptz default null,
  p_reveal_at   timestamptz default null,
  p_teaser      text        default null,
  p_descrizione text        default null,
  p_published   boolean     default false
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id   uuid;
  v_slug text;
begin
  if not public.is_admin() then raise exception 'Non autorizzato'; end if;
  if coalesce(trim(p_name), '') = '' then raise exception 'Serve il nome dell''evento'; end if;
  if p_starts_at is null then raise exception 'Serve la data'; end if;

  if p_id is null then
    v_slug := public.slugify(p_name);
    if exists (select 1 from public.events where slug = v_slug) then
      v_slug := v_slug || '-' || to_char(p_starts_at, 'YYYYMMDD');
    end if;
    if exists (select 1 from public.events where slug = v_slug) then
      v_slug := v_slug || '-' || substr(md5(gen_random_uuid()::text), 1, 4);
    end if;

    insert into public.events (
      name, slug, venue_id, starts_at, ends_at, reveal_at,
      teaser, descrizione, published
    )
    values (
      trim(p_name), v_slug, p_venue_id, p_starts_at, p_ends_at, p_reveal_at,
      nullif(trim(coalesce(p_teaser, '')), ''),
      nullif(trim(coalesce(p_descrizione, '')), ''),
      coalesce(p_published, false)
    )
    returning id into v_id;

    perform public.log_admin('crea_evento', v_id::text, jsonb_build_object('nome', p_name));
  else
    update public.events
    set name        = trim(p_name),
        venue_id    = p_venue_id,
        starts_at   = p_starts_at,
        ends_at     = p_ends_at,
        reveal_at   = p_reveal_at,
        teaser      = nullif(trim(coalesce(p_teaser, '')), ''),
        descrizione = nullif(trim(coalesce(p_descrizione, '')), ''),
        published   = coalesce(p_published, false)
    where id = p_id
    returning id into v_id;

    perform public.log_admin('modifica_evento', v_id::text, jsonb_build_object('nome', p_name));
  end if;

  return v_id;
end;
$$;

revoke execute on function
  public.admin_save_event(uuid, text, uuid, timestamptz, timestamptz, timestamptz, text, text, boolean)
  from anon;
grant execute on function
  public.admin_save_event(uuid, text, uuid, timestamptz, timestamptz, timestamptz, text, text, boolean)
  to authenticated;


-- Svela subito un evento, senza aspettare la data del reveal.
create or replace function public.admin_reveal_event(p_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then raise exception 'Non autorizzato'; end if;
  update public.events set reveal_at = null where id = p_id;
  perform public.log_admin('svela_evento', p_id::text, null);
end;
$$;

revoke execute on function public.admin_reveal_event(uuid) from anon;
grant execute on function public.admin_reveal_event(uuid) to authenticated;


create or replace function public.admin_delete_event(p_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then raise exception 'Non autorizzato'; end if;
  delete from public.events where id = p_id;
  perform public.log_admin('cancella_evento', p_id::text, null);
end;
$$;

revoke execute on function public.admin_delete_event(uuid) from anon;
grant execute on function public.admin_delete_event(uuid) to authenticated;


-- ============================================================
-- VERIFICA
-- ============================================================
select
  (select count(*) from public.venues) as locali,
  (select count(*) from public.events) as eventi;
