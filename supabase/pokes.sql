-- ============================================================
-- POKE 👊 — muro dei membri con like giornaliero
-- Da eseguire UNA volta nel SQL Editor di Supabase.
--
-- Regole:
--  * un membro può pokare un altro membro 1 volta al giorno
--    (giorno italiano, reset a mezzanotte Europe/Rome)
--  * tutti i membri vedono solo i CONTEGGI e la classifica
--  * solo chi RICEVE il poke vede chi gliel'ha mandato
-- ============================================================

create table if not exists public.pokes (
  id           uuid primary key default gen_random_uuid(),
  from_profile uuid not null references public.profiles(id)
                 on delete cascade on update cascade,
  to_profile   uuid not null references public.profiles(id)
                 on delete cascade on update cascade,
  poked_on     date not null default ((now() at time zone 'Europe/Rome')::date),
  created_at   timestamptz not null default now(),
  seen         boolean not null default false,
  constraint pokes_no_self check (from_profile <> to_profile),
  constraint pokes_once_per_day unique (from_profile, to_profile, poked_on)
);

create index if not exists pokes_to_idx   on public.pokes (to_profile);
create index if not exists pokes_from_idx on public.pokes (from_profile);

alter table public.pokes enable row level security;

-- Solo chi riceve può leggere i propri poke (serve anche per il realtime).
-- Nessuna policy di insert/update/delete: si scrive solo via RPC.
drop policy if exists "receiver_reads_own_pokes" on public.pokes;
create policy "receiver_reads_own_pokes"
  on public.pokes for select
  using (auth.uid() = to_profile);

-- Realtime sugli insert (notifica istantanea a chi riceve).
do $$
begin
  alter publication supabase_realtime add table public.pokes;
exception when duplicate_object then
  null; -- già aggiunta
end $$;

-- ------------------------------------------------------------
-- send_poke: lascia un poke a un membro (identificato dal numero).
-- Ritorna: 'ok' | 'already' (già pokato oggi) | 'self' | 'not_found' | 'not_member'
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

  if found then
    return 'ok';
  else
    return 'already';
  end if;
end;
$$;

grant execute on function public.send_poke(integer) to authenticated;

-- ------------------------------------------------------------
-- members_wall: tutti i membri con conteggio poke, ordinati per
-- classifica. Solo per membri. Niente PII: alias + avatar + numero.
-- ------------------------------------------------------------
create or replace function public.members_wall()
returns table (
  member_number     integer,
  alias             text,
  avatar_id         text,
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
-- my_pokes_received: chi mi ha pokato (solo io posso vederlo).
-- ------------------------------------------------------------
create or replace function public.my_pokes_received(limit_count integer default 40)
returns table (
  alias      text,
  avatar_id  text,
  created_at timestamptz,
  seen       boolean
)
language sql
security definer
set search_path = public
stable
as $$
  select s.alias, s.avatar_id, k.created_at, k.seen
  from pokes k
  join profiles s on s.id = k.from_profile
  where k.to_profile = auth.uid()
  order by k.created_at desc
  limit greatest(1, least(coalesce(limit_count, 40), 100));
$$;

grant execute on function public.my_pokes_received(integer) to authenticated;

-- ------------------------------------------------------------
-- unseen_pokes_count + mark_pokes_seen: badge di notifica.
-- ------------------------------------------------------------
create or replace function public.unseen_pokes_count()
returns integer
language sql
security definer
set search_path = public
stable
as $$
  select count(*)::int from pokes
  where to_profile = auth.uid() and not seen;
$$;

grant execute on function public.unseen_pokes_count() to authenticated;

create or replace function public.mark_pokes_seen()
returns void
language sql
security definer
set search_path = public
as $$
  update pokes set seen = true
  where to_profile = auth.uid() and not seen;
$$;

grant execute on function public.mark_pokes_seen() to authenticated;

-- ------------------------------------------------------------
-- pokes_received_count: totale poke ricevuti (visti + non visti).
-- Per il contatore sempre visibile sulla card.
-- ------------------------------------------------------------
create or replace function public.pokes_received_count()
returns integer
language sql
security definer
set search_path = public
stable
as $$
  select count(*)::int from pokes where to_profile = auth.uid();
$$;

grant execute on function public.pokes_received_count() to authenticated;
