-- ============================================================
-- I VOLTI — Fase A del social 1%
-- Foto profilo sfocata + bio + profilo pubblico
--
-- Da incollare UNA VOLTA nel SQL Editor di Supabase
-- (come già fatto per pokes.sql).
--
-- Cosa fa:
--   1. Colonne nuove su profiles (foto, bio, consenso)
--   2. Bucket storage: volti (privato, nitide) + volti-blur (pubblico, sfocate)
--   3. Policy storage: ognuno scrive/legge solo la propria cartella
--   4. RPC: set_my_photo, clear_my_photo, update_my_bio, public_profile
--   5. members_wall aggiornata con la foto sfocata
--   6. delete_my_profile estesa (GDPR: cancella anche le foto)
--   7. admin_remove_photo (rimozione foto inappropriata)
-- ============================================================

-- ------------------------------------------------------------
-- 1. Colonne nuove su profiles
-- ------------------------------------------------------------
alter table public.profiles add column if not exists photo_blur_path  text;
alter table public.profiles add column if not exists photo_updated_at timestamptz;
alter table public.profiles add column if not exists photo_consent_at timestamptz;
alter table public.profiles add column if not exists bio              text;

-- ------------------------------------------------------------
-- 2. Bucket storage
--    volti      = foto NITIDE  → privato (solo proprietario, in
--                 futuro i Legami via URL firmati)
--    volti-blur = foto SFOCATE → pubblico (è l'unica che circola)
-- ------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  ('volti',      'volti',      false, 6291456, array['image/webp']),
  ('volti-blur', 'volti-blur', true,  6291456, array['image/webp'])
on conflict (id) do nothing;

-- ------------------------------------------------------------
-- 3. Policy storage: ogni membro tocca SOLO la cartella col suo uuid
--    (il path è sempre "<uuid>/volto.webp")
-- ------------------------------------------------------------
drop policy if exists "volto_owner_rw" on storage.objects;
create policy "volto_owner_rw"
  on storage.objects
  for all
  to authenticated
  using (
    bucket_id in ('volti', 'volti-blur')
    and (storage.foldername(name))[1] = auth.uid()::text
  )
  with check (
    bucket_id in ('volti', 'volti-blur')
    and (storage.foldername(name))[1] = auth.uid()::text
  );

-- ------------------------------------------------------------
-- 4a. set_my_photo: registra che il membro ha caricato la foto.
--     I file veri li carica il sito (path deterministico
--     <uuid>/volto.webp). Registra anche il consenso la prima volta.
-- ------------------------------------------------------------
create or replace function public.set_my_photo()
returns timestamptz
language plpgsql
security definer
set search_path = public
as $$
declare
  v_now timestamptz := now();
begin
  if auth.uid() is null then
    raise exception 'Nessuna sessione attiva';
  end if;

  update profiles
  set photo_blur_path  = auth.uid()::text || '/volto.webp',
      photo_updated_at = v_now,
      photo_consent_at = coalesce(photo_consent_at, v_now)
  where id = auth.uid() and deleted_at is null;

  if not found then
    raise exception 'Profilo non trovato';
  end if;

  return v_now;
end;
$$;

grant execute on function public.set_my_photo() to authenticated;

-- ------------------------------------------------------------
-- 4b. clear_my_photo: rimuove la foto (file compresi) e torna all'emoji.
-- ------------------------------------------------------------
create or replace function public.clear_my_photo()
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'Nessuna sessione attiva';
  end if;

  delete from storage.objects
  where bucket_id in ('volti', 'volti-blur')
    and (storage.foldername(name))[1] = auth.uid()::text;

  update profiles
  set photo_blur_path  = null,
      photo_updated_at = null
  where id = auth.uid();
end;
$$;

grant execute on function public.clear_my_photo() to authenticated;

-- ------------------------------------------------------------
-- 4c. update_my_bio: una riga, max 120 caratteri, niente a capo.
-- ------------------------------------------------------------
create or replace function public.update_my_bio(p_bio text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_bio text := nullif(trim(regexp_replace(coalesce(p_bio, ''), '\s+', ' ', 'g')), '');
begin
  if auth.uid() is null then
    raise exception 'Nessuna sessione attiva';
  end if;
  if length(v_bio) > 120 then
    raise exception 'Bio troppo lunga (max 120)';
  end if;

  update profiles set bio = v_bio
  where id = auth.uid() and deleted_at is null;
end;
$$;

grant execute on function public.update_my_bio(text) to authenticated;

-- ------------------------------------------------------------
-- 4d. public_profile: la pagina /u/[alias]. Solo per membri.
--     Niente PII: alias, volto sfocato, bio, archetipo, poke.
-- ------------------------------------------------------------
create or replace function public.public_profile(p_alias text)
returns table (
  member_number     integer,
  alias             text,
  avatar_id         text,
  photo_blur_path   text,
  photo_updated_at  timestamptz,
  bio               text,
  created_at        timestamptz,
  archetype         text,
  poke_count        bigint,
  poke_rank         bigint,
  poked_by_me_today boolean,
  is_me             boolean
)
language sql
security definer
set search_path = public
stable
as $$
  select
    p.member_number,
    p.alias,
    p.avatar_id,
    p.photo_blur_path,
    p.photo_updated_at,
    p.bio,
    p.created_at,
    p.quiz_answers->>'archetype' as archetype,
    coalesce(k.cnt, 0) as poke_count,
    (
      select 1 + count(*)
      from (select to_profile, count(*) as c from pokes group by to_profile) t
      where t.c > coalesce(k.cnt, 0)
    ) as poke_rank,
    exists (
      select 1 from pokes x
      where x.from_profile = auth.uid()
        and x.to_profile   = p.id
        and x.poked_on     = ((now() at time zone 'Europe/Rome')::date)
    ) as poked_by_me_today,
    (p.id = auth.uid()) as is_me
  from profiles p
  left join (
    select to_profile, count(*) as cnt
    from pokes
    group by to_profile
  ) k on k.to_profile = p.id
  where lower(p.alias) = lower(p_alias)
    and p.deleted_at is null
    and exists (select 1 from profiles me where me.id = auth.uid());
$$;

grant execute on function public.public_profile(text) to authenticated;

-- ------------------------------------------------------------
-- 5. members_wall v2: come prima + volto sfocato.
--    (drop necessario: cambia il tipo di ritorno)
-- ------------------------------------------------------------
drop function if exists public.members_wall();

create or replace function public.members_wall()
returns table (
  member_number     integer,
  alias             text,
  avatar_id         text,
  photo_blur_path   text,
  photo_updated_at  timestamptz,
  poke_count        bigint,
  poked_by_me_today boolean,
  is_me             boolean
)
language sql
security definer
set search_path = public
stable
as $$
  select
    p.member_number,
    p.alias,
    p.avatar_id,
    p.photo_blur_path,
    p.photo_updated_at,
    coalesce(k.cnt, 0) as poke_count,
    exists (
      select 1 from pokes x
      where x.from_profile = auth.uid()
        and x.to_profile   = p.id
        and x.poked_on     = ((now() at time zone 'Europe/Rome')::date)
    ) as poked_by_me_today,
    (p.id = auth.uid()) as is_me
  from profiles p
  left join (
    select to_profile, count(*) as cnt
    from pokes
    group by to_profile
  ) k on k.to_profile = p.id
  where exists (select 1 from profiles me where me.id = auth.uid())
  order by coalesce(k.cnt, 0) desc, p.member_number asc;
$$;

grant execute on function public.members_wall() to authenticated;

-- ------------------------------------------------------------
-- 6. delete_my_profile v2 (GDPR): come prima + foto e bio.
-- ------------------------------------------------------------
create or replace function public.delete_my_profile()
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'Nessuna sessione attiva';
  end if;

  delete from storage.objects
  where bucket_id in ('volti', 'volti-blur')
    and (storage.foldername(name))[1] = auth.uid()::text;

  update public.profiles
  set alias = 'cancellato_' || member_number,
      avatar_id = null,
      email = null,
      phone = null,
      quiz_answers = null,
      bio = null,
      photo_blur_path = null,
      photo_updated_at = null,
      photo_consent_at = null,
      deleted_at = now()
  where id = auth.uid();

  delete from public.passes where profile_id = auth.uid();
end;
$$;

grant execute on function public.delete_my_profile() to authenticated;

-- ------------------------------------------------------------
-- 7. admin_remove_photo: lo staff rimuove una foto inappropriata.
-- ------------------------------------------------------------
create or replace function public.admin_remove_photo(p_profile uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception 'Non autorizzato';
  end if;

  delete from storage.objects
  where bucket_id in ('volti', 'volti-blur')
    and (storage.foldername(name))[1] = p_profile::text;

  update profiles
  set photo_blur_path  = null,
      photo_updated_at = null
  where id = p_profile;
end;
$$;

grant execute on function public.admin_remove_photo(uuid) to authenticated;
