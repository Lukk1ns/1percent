-- ============================================================
-- FIX VOLTI — correzione post-lancio (6 lug 2026)
--
-- Bug scoperto: Supabase VIETA il delete SQL sulle tabelle storage
-- ("Use the Storage API instead") → clear_my_photo, delete_my_profile
-- e admin_remove_photo fallivano al momento di cancellare i file.
-- Ora i file li cancella il sito via Storage API; le funzioni SQL
-- toccano solo il database.
--
-- In più: policy per l'admin sui file, Muro senza profili cancellati,
-- pulizia del membro di test tecnico.
-- ============================================================

-- 1. clear_my_photo: solo colonne (i file li rimuove il sito)
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

  update profiles
  set photo_blur_path  = null,
      photo_updated_at = null
  where id = auth.uid();
end;
$$;

grant execute on function public.clear_my_photo() to authenticated;

-- 2. delete_my_profile: come prima ma senza toccare lo storage
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

-- 3. admin_remove_photo: solo colonne
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

  update profiles
  set photo_blur_path  = null,
      photo_updated_at = null
  where id = p_profile;
end;
$$;

grant execute on function public.admin_remove_photo(uuid) to authenticated;

-- 4. Lo staff può cancellare i file foto di chiunque (via Storage API)
drop policy if exists "volto_admin_delete" on storage.objects;
create policy "volto_admin_delete"
  on storage.objects
  for delete
  to authenticated
  using (
    bucket_id in ('volti', 'volti-blur')
    and public.is_admin()
  );

-- 5. Il Muro non mostra più i profili cancellati
--    (blocks + _is_blocked inclusi qui per sicurezza: servono al Muro
--    e arrivano anche col blocco SQL della Fase C — doppioni innocui)
create table if not exists public.blocks (
  blocker    uuid not null references public.profiles(id)
               on delete cascade on update cascade,
  blocked    uuid not null references public.profiles(id)
               on delete cascade on update cascade,
  created_at timestamptz not null default now(),
  primary key (blocker, blocked),
  constraint blocks_no_self check (blocker <> blocked)
);
alter table public.blocks enable row level security;

create or replace function public._is_blocked(u1 uuid, u2 uuid)
returns boolean
language sql
stable
as $$
  select exists (
    select 1 from public.blocks
    where (blocker = u1 and blocked = u2) or (blocker = u2 and blocked = u1)
  );
$$;

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
    and p.deleted_at is null
    and not public._is_blocked(auth.uid(), p.id)
  order by coalesce(k.cnt, 0) desc, p.member_number asc;
$$;

grant execute on function public.members_wall() to authenticated;

-- 6. Pulizia: rimuove il membro di test tecnico creato durante il debug
delete from public.profiles where alias = 'x_test_tecnico';
