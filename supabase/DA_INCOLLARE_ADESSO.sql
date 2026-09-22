-- ============================================================
-- DA INCOLLARE ADESSO — 22 settembre 2026
--
-- Dentro ci sono i due pezzi che mancano al database:
--   1. la grafica del biglietto  (era lo script 13)
--   2. la galleria delle foto    (era lo script 17)
--
-- Si incolla tutto insieme, si preme Run una volta sola.
-- Si può rieseguire senza fare danni.
-- ============================================================




-- ------------------------------------------------------------
-- Il deposito: pubblico, chi ha il link la vede
-- ------------------------------------------------------------
insert into storage.buckets (id, name, public)
values ('biglietti', 'biglietti', true)
on conflict (id) do update set public = true;

-- La legge chiunque: è la grafica che arriva al cliente.
drop policy if exists "grafica_biglietto_pubblica" on storage.objects;
create policy "grafica_biglietto_pubblica"
on storage.objects for select to anon, authenticated
using (bucket_id = 'biglietti');

-- La carica, sostituisce e cancella solo lo staff.
drop policy if exists "grafica_biglietto_admin_carica" on storage.objects;
create policy "grafica_biglietto_admin_carica"
on storage.objects for insert to authenticated
with check (bucket_id = 'biglietti' and public.is_admin());

drop policy if exists "grafica_biglietto_admin_sostituisce" on storage.objects;
create policy "grafica_biglietto_admin_sostituisce"
on storage.objects for update to authenticated
using (bucket_id = 'biglietti' and public.is_admin())
with check (bucket_id = 'biglietti' and public.is_admin());

drop policy if exists "grafica_biglietto_admin_cancella" on storage.objects;
create policy "grafica_biglietto_admin_cancella"
on storage.objects for delete to authenticated
using (bucket_id = 'biglietti' and public.is_admin());


-- ------------------------------------------------------------
-- Dove la teniamo segnata
-- ------------------------------------------------------------
alter table public.events add column if not exists ticket_key text;
alter table public.events add column if not exists ticket_updated_at timestamptz;


create or replace function public.admin_set_event_ticket(p_id uuid, p_key text)
returns bigint
language plpgsql
security definer
set search_path = public
as $$
declare v_quando timestamptz;
begin
  if not public.is_admin() then
    raise exception 'Non autorizzato';
  end if;

  if coalesce(trim(p_key), '') = '' then
    update public.events e
       set ticket_key = null, ticket_updated_at = null
     where e.id = p_id;
    return 0;
  end if;

  v_quando := now();
  update public.events e
     set ticket_key = trim(p_key), ticket_updated_at = v_quando
   where e.id = p_id;

  if not found then
    raise exception 'Evento non trovato';
  end if;

  return extract(epoch from v_quando)::bigint;
end;
$$;

revoke execute on function public.admin_set_event_ticket(uuid, text) from anon;
grant execute on function public.admin_set_event_ticket(uuid, text) to authenticated;


-- Il pannello deve sapere se una serata ce l'ha già.
create or replace function public.admin_event_ticket(p_event uuid)
returns table (ticket_key text, ticket_v bigint)
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
    select e.ticket_key, coalesce(extract(epoch from e.ticket_updated_at)::bigint, 0)
    from public.events e where e.id = p_event;
end;
$$;

grant execute on function public.admin_event_ticket(uuid) to authenticated;


-- ------------------------------------------------------------
-- Il biglietto la porta con sé
-- ------------------------------------------------------------
drop function if exists public.biglietto(text);

create function public.biglietto(p_token text)
returns table (
  nome        text,
  cognome     text,
  tier_label  text,
  prezzo      numeric,
  stato       text,
  minorenne   boolean,
  under16     boolean,
  evento      text,
  locale      text,
  citta       text,
  indirizzo   text,
  starts_at   timestamptz,
  ticket_key  text,
  ticket_v    bigint
)
language sql
security definer
set search_path = public
stable
as $$
  select s.nome, s.cognome, s.tier_label, s.prezzo, s.stato,
         (extract(year from now())::int - s.anno_nascita) < 18,
         (extract(year from now())::int - s.anno_nascita) < 16,
         e.name, v.name, v.city, v.address, e.starts_at,
         e.ticket_key,
         coalesce(extract(epoch from e.ticket_updated_at)::bigint, 0)
  from public.presales s
  join public.events e on e.id = s.event_id
  left join public.venues v on v.id = e.venue_id
  where s.token = p_token;
$$;

grant execute on function public.biglietto(text) to anon, authenticated;


-- ============================================================
-- Controllo
-- ============================================================
select
  (select count(*) from storage.buckets where id = 'biglietti') as "deposito grafiche",
  (select count(*) from public.events where ticket_key is not null) as "serate con grafica";




-- ------------------------------------------------------------
-- Gli album: uno per serata (ma se ne possono fare più d'uno)
-- ------------------------------------------------------------
create table if not exists public.albums (
  id           uuid primary key default gen_random_uuid(),
  event_id     uuid references public.events (id) on delete set null,
  nome         text not null,
  slug         text not null unique,
  descrizione  text,
  data_serata  date,
  -- da quando è visibile agli iscritti. null = non ancora pubblicato
  visibile_dal timestamptz,
  cover_photo  uuid,
  created_at   timestamptz not null default now()
);

create index if not exists albums_evento_idx on public.albums (event_id);


-- ------------------------------------------------------------
-- Le foto. I file veri stanno su R2: qui ci sono le chiavi.
-- Tre formati: miniatura per la griglia, media per la visione,
-- originale per chi la scarica.
-- ------------------------------------------------------------
create table if not exists public.photos (
  id          uuid primary key default gen_random_uuid(),
  album_id    uuid not null references public.albums (id) on delete cascade,
  key_thumb   text not null,
  key_medium  text not null,
  key_hd      text not null,
  width       int,
  height      int,
  sort        int not null default 0,
  -- una foto tolta non si cancella: sparisce dalla galleria e resta
  -- la riga, così si sa che è stata rimossa e perché
  removed_at  timestamptz,
  removed_why text,
  created_at  timestamptz not null default now()
);

create index if not exists photos_album_idx on public.photos (album_id, sort, created_at);

alter table public.albums drop constraint if exists albums_cover_fk;
alter table public.albums
  add constraint albums_cover_fk
  foreign key (cover_photo) references public.photos (id) on delete set null;


-- ------------------------------------------------------------
-- "In questa foto ci sono io e non mi va": le richieste di rimozione.
-- Con le foto di una serata è il minimo, e vale anche come risposta
-- pronta se qualcuno protesta.
-- ------------------------------------------------------------
create table if not exists public.photo_removal_requests (
  id          uuid primary key default gen_random_uuid(),
  photo_id    uuid not null references public.photos (id) on delete cascade,
  profile_id  uuid references public.profiles (id) on delete set null,
  motivo      text,
  stato       text not null default 'aperta'
              check (stato in ('aperta', 'rimossa', 'respinta')),
  created_at  timestamptz not null default now(),
  handled_at  timestamptz,
  handled_by  text
);

create index if not exists rimozioni_aperte_idx
  on public.photo_removal_requests (stato, created_at);


alter table public.albums                enable row level security;
alter table public.photos                enable row level security;
alter table public.photo_removal_requests enable row level security;


-- ============================================================
-- CHI VEDE COSA
-- ============================================================

-- È uno di noi? Cioè: si è iscritto (o è staff).
create or replace function public.sono_iscritto()
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select public.is_admin() or exists (
    select 1 from public.profiles p
    where p.id = auth.uid() and p.deleted_at is null
  );
$$;

grant execute on function public.sono_iscritto() to anon, authenticated;


-- L'elenco degli album. Questo lo vede CHIUNQUE, anche chi non è
-- iscritto: è la vetrina, deve far venire voglia di entrare. Escono
-- il nome, la data e quante foto ci sono — non le foto.
create or replace function public.albums_pubblici()
returns table (
  id          uuid,
  nome        text,
  slug        text,
  descrizione text,
  data_serata date,
  foto        int,
  -- l'id della foto di copertina: il file lo chiede il sito con questo,
  -- e lo riceve solo se è iscritto
  cover_id    uuid
)
language sql
security definer
set search_path = public
stable
as $$
  select a.id, a.nome, a.slug, a.descrizione, a.data_serata,
         (select count(*) from public.photos p
           where p.album_id = a.id and p.removed_at is null)::int,
         (select p.id from public.photos p
           where p.id = a.cover_photo and p.removed_at is null)
  from public.albums a
  where a.visibile_dal is not null and a.visibile_dal <= now()
  order by coalesce(a.data_serata, a.created_at::date) desc;
$$;

grant execute on function public.albums_pubblici() to anon, authenticated;


-- Le foto di un album: SOLO per chi è iscritto.
-- Chi non lo è riceve zero righe, non una versione ridotta.
create or replace function public.album_foto(p_slug text)
returns table (
  id       uuid,
  thumb    text,
  medium   text,
  width    int,
  height   int
)
language plpgsql
security definer
set search_path = public
stable
as $$
begin
  if not public.sono_iscritto() then
    raise exception 'Serve un account';
  end if;

  return query
    select p.id, p.key_thumb, p.key_medium, p.width, p.height
    from public.photos p
    join public.albums a on a.id = p.album_id
    where a.slug = p_slug
      and p.removed_at is null
      and a.visibile_dal is not null and a.visibile_dal <= now()
    order by p.sort, p.created_at;
end;
$$;

grant execute on function public.album_foto(text) to authenticated;


-- Il permesso su una singola foto, per quando il sito chiede il file.
-- Risponde con la chiave del formato richiesto, e solo a chi ha diritto.
create or replace function public.foto_chiave(p_id uuid, p_formato text)
returns text
language plpgsql
security definer
set search_path = public
stable
as $$
declare v_foto record;
begin
  if not public.sono_iscritto() then
    return null;
  end if;

  select p.*, a.visibile_dal into v_foto
  from public.photos p
  join public.albums a on a.id = p.album_id
  where p.id = p_id and p.removed_at is null;

  if not found then return null; end if;

  -- Un album non ancora pubblicato lo vede solo lo staff.
  if (v_foto.visibile_dal is null or v_foto.visibile_dal > now())
     and not public.is_admin() then
    return null;
  end if;

  return case p_formato
           when 'thumb'  then v_foto.key_thumb
           when 'medium' then v_foto.key_medium
           when 'hd'     then v_foto.key_hd
           else null
         end;
end;
$$;

grant execute on function public.foto_chiave(uuid, text) to authenticated;


-- "Toglietemi da questa foto"
create or replace function public.chiedi_rimozione(p_photo uuid, p_motivo text)
returns text
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.sono_iscritto() then
    raise exception 'Serve un account';
  end if;

  if exists (
    select 1 from public.photo_removal_requests r
    where r.photo_id = p_photo and r.profile_id = auth.uid() and r.stato = 'aperta'
  ) then
    return 'gia_chiesto';
  end if;

  insert into public.photo_removal_requests (photo_id, profile_id, motivo)
  values (p_photo, auth.uid(), nullif(trim(p_motivo), ''));

  return 'ok';
end;
$$;

grant execute on function public.chiedi_rimozione(uuid, text) to authenticated;


-- ============================================================
-- PANNELLO
-- ============================================================

create or replace function public.admin_albums()
returns table (
  id           uuid,
  nome         text,
  slug         text,
  descrizione  text,
  data_serata  date,
  visibile_dal timestamptz,
  evento       text,
  event_id     uuid,
  foto         int,
  rimozioni    int
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
    select a.id, a.nome, a.slug, a.descrizione, a.data_serata, a.visibile_dal,
           e.name, a.event_id,
           (select count(*) from public.photos p
             where p.album_id = a.id and p.removed_at is null)::int,
           (select count(*) from public.photo_removal_requests r
             join public.photos p2 on p2.id = r.photo_id
             where p2.album_id = a.id and r.stato = 'aperta')::int
    from public.albums a
    left join public.events e on e.id = a.event_id
    order by coalesce(a.data_serata, a.created_at::date) desc;
end;
$$;

grant execute on function public.admin_albums() to authenticated;


create or replace function public.admin_album_salva(
  p_id     uuid,
  p_nome   text,
  p_slug   text,
  p_event  uuid,
  p_data   date,
  p_descr  text
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
    insert into public.albums (nome, slug, event_id, data_serata, descrizione)
    values (trim(p_nome), lower(trim(p_slug)), p_event, p_data, nullif(trim(p_descr), ''))
    returning id into v_id;
  else
    update public.albums a
       set nome = trim(p_nome),
           slug = lower(trim(p_slug)),
           event_id = p_event,
           data_serata = p_data,
           descrizione = nullif(trim(p_descr), '')
     where a.id = p_id
    returning a.id into v_id;
  end if;

  return v_id;
end;
$$;

grant execute on function public.admin_album_salva(uuid, text, uuid, date, text) to authenticated;


-- Pubblica o nascondi un album.
create or replace function public.admin_album_pubblica(p_id uuid, p_pubblica boolean)
returns timestamptz
language plpgsql
security definer
set search_path = public
as $$
declare v_quando timestamptz;
begin
  if not public.is_admin() then
    raise exception 'Non autorizzato';
  end if;

  v_quando := case when p_pubblica then now() else null end;

  update public.albums a set visibile_dal = v_quando where a.id = p_id;
  return v_quando;
end;
$$;

grant execute on function public.admin_album_pubblica(uuid, boolean) to authenticated;


-- Registra una foto appena caricata su R2.
create or replace function public.admin_foto_aggiungi(
  p_album  uuid,
  p_thumb  text,
  p_medium text,
  p_hd     text,
  p_w      int,
  p_h      int
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

  insert into public.photos (album_id, key_thumb, key_medium, key_hd, width, height,
                             sort)
  values (p_album, p_thumb, p_medium, p_hd, p_w, p_h,
          coalesce((select max(p.sort) + 1 from public.photos p where p.album_id = p_album), 0))
  returning id into v_id;

  -- la prima foto diventa la copertina, se non ce n'è una
  update public.albums a set cover_photo = v_id
   where a.id = p_album and a.cover_photo is null;

  return v_id;
end;
$$;

grant execute on function public.admin_foto_aggiungi(uuid, text, text, text, int, int) to authenticated;


create or replace function public.admin_foto_togli(p_id uuid, p_motivo text)
returns text
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception 'Non autorizzato';
  end if;

  update public.photos p
     set removed_at = now(), removed_why = nullif(trim(p_motivo), '')
   where p.id = p_id;

  update public.photo_removal_requests r
     set stato = 'rimossa', handled_at = now(), handled_by = (auth.jwt() ->> 'email')
   where r.photo_id = p_id and r.stato = 'aperta';

  return 'ok';
end;
$$;

grant execute on function public.admin_foto_togli(uuid, text) to authenticated;


create or replace function public.admin_album_foto(p_slug text)
returns table (id uuid, thumb text, width int, height int, rimozioni int)
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
    select p.id, p.key_thumb, p.width, p.height,
           (select count(*) from public.photo_removal_requests r
             where r.photo_id = p.id and r.stato = 'aperta')::int
    from public.photos p
    join public.albums a on a.id = p.album_id
    where a.slug = p_slug and p.removed_at is null
    order by p.sort, p.created_at;
end;
$$;

grant execute on function public.admin_album_foto(text) to authenticated;


-- ============================================================
-- Controllo
-- ============================================================
select
  (select count(*) from public.albums) as "album",
  (select count(*) from public.photos where removed_at is null) as "foto";
