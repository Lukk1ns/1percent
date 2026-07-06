-- ============================================================
-- IL LEGAME — Fase B del social 1%
-- Poke reciproco = le due persone si vedono NITIDE a vicenda.
--
-- Da incollare UNA VOLTA nel SQL Editor di Supabase
-- (dopo volti.sql).
--
-- Cosa fa:
--   1. Policy storage: chi ha un Legame con te può leggere la tua
--      foto nitida (bucket privato "volti", via URL firmati)
--   2. send_poke v2: ritorna 'link' quando il poke crea un Legame
--   3. my_links(): i miei Legami (per /legami, il Muro, /u/[alias])
-- ============================================================

-- ------------------------------------------------------------
-- 1. Lettura foto nitida tra Legami.
--    Legame = esiste un poke A→B E un poke B→A (in qualsiasi data).
-- ------------------------------------------------------------
drop policy if exists "volto_link_read" on storage.objects;
create policy "volto_link_read"
  on storage.objects
  for select
  to authenticated
  using (
    bucket_id = 'volti'
    and exists (
      select 1
      from public.pokes a
      join public.pokes b
        on b.from_profile = a.to_profile
       and b.to_profile   = a.from_profile
      where a.from_profile = auth.uid()
        and a.to_profile::text = (storage.foldername(name))[1]
    )
  );

-- ------------------------------------------------------------
-- 2. send_poke v2: come prima, ma se questo poke chiude il cerchio
--    (lui/lei mi aveva già pokato e io non l'avevo mai fatto prima)
--    ritorna 'link' → il sito mostra la rivelazione.
--    Ritorna: 'ok' | 'link' | 'already' | 'self' | 'not_found' | 'not_member'
-- ------------------------------------------------------------
create or replace function public.send_poke(p_member_number integer)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_me     uuid := auth.uid();
  v_target uuid;
begin
  if v_me is null or not exists (select 1 from profiles where id = v_me) then
    return 'not_member';
  end if;

  select id into v_target from profiles where member_number = p_member_number;
  if v_target is null then
    return 'not_found';
  end if;
  if v_target = v_me then
    return 'self';
  end if;

  insert into pokes (from_profile, to_profile)
  values (v_me, v_target)
  on conflict (from_profile, to_profile, poked_on) do nothing;

  if not found then
    return 'already';
  end if;

  -- Nuovo Legame: era il mio PRIMO poke verso di lui/lei
  -- e lui/lei mi aveva già pokato almeno una volta.
  if (select count(*) from pokes s
      where s.from_profile = v_me and s.to_profile = v_target) = 1
     and exists (select 1 from pokes r
                 where r.from_profile = v_target and r.to_profile = v_me) then
    return 'link';
  end if;

  return 'ok';
end;
$$;

grant execute on function public.send_poke(integer) to authenticated;

-- ------------------------------------------------------------
-- 3. my_links: i miei Legami, dal più recente.
--    linked_at = quando il cerchio si è chiuso (il secondo poke).
-- ------------------------------------------------------------
create or replace function public.my_links()
returns table (
  profile_id       uuid,
  member_number    integer,
  alias            text,
  avatar_id        text,
  photo_blur_path  text,
  photo_updated_at timestamptz,
  bio              text,
  linked_at        timestamptz
)
language sql
security definer
set search_path = public
stable
as $$
  with mine as (
    select to_profile as other, min(created_at) as first_out
    from pokes
    where from_profile = auth.uid()
    group by to_profile
  ),
  theirs as (
    select from_profile as other, min(created_at) as first_in
    from pokes
    where to_profile = auth.uid()
    group by from_profile
  )
  select
    p.id,
    p.member_number,
    p.alias,
    p.avatar_id,
    p.photo_blur_path,
    p.photo_updated_at,
    p.bio,
    greatest(m.first_out, t.first_in) as linked_at
  from mine m
  join theirs t on t.other = m.other
  join profiles p on p.id = m.other
  where p.deleted_at is null
  order by linked_at desc;
$$;

grant execute on function public.my_links() to authenticated;
