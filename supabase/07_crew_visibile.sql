-- ============================================================
-- 07 — IL SEGNO DELLA CREW È VISIBILE AGLI ALTRI
--
-- Chi viene approvato deve distinguersi nel nome, non solo nel suo
-- pannello: sul Muro e sulla sua pagina l'alias esce con il segno (1%).
--
-- L'alias NON viene toccato: resta quello scelto in fase d'iscrizione,
-- resta unico ed è ancora l'indirizzo della pagina /u/<alias>. Qui
-- aggiungiamo solo il ruolo alle due funzioni che mandano i nomi al
-- sito; il "(1%)" lo disegna il sito, così se un giorno cambia il segno
-- non si tocca il database.
--
-- Le due funzioni cambiano forma (una colonna in più), quindi vanno
-- prima eliminate: Postgres non sa cambiare il risultato di una
-- funzione già esistente. Il resto è identico a com'era.
--
-- Da incollare nel SQL Editor di Supabase. Si può rieseguire.
-- ============================================================


-- ============================================================
-- 1. IL MURO — ora dice anche chi è della crew
-- ============================================================

drop function if exists public.members_wall();

create function public.members_wall()
returns table (
  member_number     integer,
  alias             text,
  avatar_id         text,
  role              text,
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
    p.role,
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


-- ============================================================
-- 2. LA PAGINA DI UN MEMBRO — stessa cosa
-- ============================================================

drop function if exists public.public_profile(text);

create function public.public_profile(p_alias text)
returns table (
  member_number     integer,
  alias             text,
  avatar_id         text,
  role              text,
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
    p.role,
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
    and exists (select 1 from profiles me where me.id = auth.uid())
    and not public._is_blocked(auth.uid(), p.id);
$$;

grant execute on function public.public_profile(text) to authenticated;


-- ============================================================
-- Controllo: chi è crew adesso
-- ============================================================

select member_number, alias, role, crew_request_status
from public.profiles
where role = 'crew' or crew_request_status = 'in_attesa'
order by member_number;
