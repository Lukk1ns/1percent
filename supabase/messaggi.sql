-- ============================================================
-- I MESSAGGI — Fase C del social 1%
-- Richiesta + accetta. Tra Legami la chat è aperta di default.
--
-- Da incollare UNA VOLTA nel SQL Editor di Supabase
-- (dopo volti.sql e legami.sql).
--
-- Cosa fa:
--   1. Tabelle: chat_requests, conversations, messages, blocks, reports
--   2. RLS: ogni conversazione la leggono SOLO i due partecipanti
--   3. RPC con anti-spam integrato:
--      - max 3 richieste pendenti in uscita, max 10 al giorno
--      - rifiuto = 30 giorni di silenzio verso quella persona
--      - max 20 messaggi al minuto
--   4. Blocco: chi blocchi sparisce per te e tu per lui (poke,
--      richieste, muro, profilo)
--   5. Segnalazioni + RPC admin
--   6. members_wall / public_profile / send_poke aggiornate
--      per rispettare i blocchi
-- ============================================================

-- ------------------------------------------------------------
-- 1. Tabelle
-- ------------------------------------------------------------
create table if not exists public.chat_requests (
  id           uuid primary key default gen_random_uuid(),
  from_profile uuid not null references public.profiles(id)
                 on delete cascade on update cascade,
  to_profile   uuid not null references public.profiles(id)
                 on delete cascade on update cascade,
  message      text not null check (char_length(message) between 1 and 280),
  status       text not null default 'pending'
                 check (status in ('pending', 'accepted', 'declined')),
  created_at   timestamptz not null default now(),
  responded_at timestamptz,
  constraint chat_requests_no_self check (from_profile <> to_profile)
);

-- Una sola richiesta pendente per coppia (per direzione)
create unique index if not exists chat_requests_pending_uq
  on public.chat_requests (from_profile, to_profile)
  where status = 'pending';
create index if not exists chat_requests_to_idx on public.chat_requests (to_profile);

create table if not exists public.conversations (
  id              uuid primary key default gen_random_uuid(),
  a               uuid not null references public.profiles(id)
                    on delete cascade on update cascade,
  b               uuid not null references public.profiles(id)
                    on delete cascade on update cascade,
  created_at      timestamptz not null default now(),
  last_message_at timestamptz not null default now(),
  constraint conversations_order check (a < b),
  constraint conversations_pair unique (a, b)
);

create table if not exists public.messages (
  id              uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  sender          uuid not null references public.profiles(id)
                    on delete cascade on update cascade,
  body            text not null check (char_length(body) between 1 and 1000),
  created_at      timestamptz not null default now(),
  read_at         timestamptz
);
create index if not exists messages_convo_idx on public.messages (conversation_id, created_at);
create index if not exists messages_sender_time_idx on public.messages (sender, created_at);

create table if not exists public.blocks (
  blocker    uuid not null references public.profiles(id)
               on delete cascade on update cascade,
  blocked    uuid not null references public.profiles(id)
               on delete cascade on update cascade,
  created_at timestamptz not null default now(),
  primary key (blocker, blocked),
  constraint blocks_no_self check (blocker <> blocked)
);

create table if not exists public.reports (
  id         uuid primary key default gen_random_uuid(),
  reporter   uuid not null references public.profiles(id)
               on delete cascade on update cascade,
  reported   uuid not null references public.profiles(id)
               on delete cascade on update cascade,
  reason     text not null check (char_length(reason) between 1 and 500),
  status     text not null default 'open' check (status in ('open', 'closed')),
  created_at timestamptz not null default now()
);

-- ------------------------------------------------------------
-- 2. RLS
-- ------------------------------------------------------------
alter table public.chat_requests enable row level security;
alter table public.conversations enable row level security;
alter table public.messages      enable row level security;
alter table public.blocks        enable row level security;
alter table public.reports       enable row level security;

-- Le richieste le vedono solo i due coinvolti (scrittura solo via RPC)
drop policy if exists "requests_participants_read" on public.chat_requests;
create policy "requests_participants_read"
  on public.chat_requests for select
  using (auth.uid() in (from_profile, to_profile));

drop policy if exists "conversations_participants_read" on public.conversations;
create policy "conversations_participants_read"
  on public.conversations for select
  using (auth.uid() in (a, b));

-- I messaggi li leggono solo i partecipanti (serve anche per il realtime)
drop policy if exists "messages_participants_read" on public.messages;
create policy "messages_participants_read"
  on public.messages for select
  using (exists (
    select 1 from public.conversations c
    where c.id = conversation_id and auth.uid() in (c.a, c.b)
  ));

-- I blocchi li vede solo chi li ha messi
drop policy if exists "blocks_own_read" on public.blocks;
create policy "blocks_own_read"
  on public.blocks for select
  using (auth.uid() = blocker);

-- Le segnalazioni non le legge nessuno via tabella (solo RPC admin)

-- Realtime sui messaggi e sulle richieste in arrivo
do $$
begin
  alter publication supabase_realtime add table public.messages;
exception when duplicate_object then null;
end $$;
do $$
begin
  alter publication supabase_realtime add table public.chat_requests;
exception when duplicate_object then null;
end $$;

-- ------------------------------------------------------------
-- Helper interno: c'è un blocco in una delle due direzioni?
-- ------------------------------------------------------------
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

-- ------------------------------------------------------------
-- 3a. send_chat_request: manda la richiesta (o apre subito la
--     chat se c'è il Legame). Ritorna jsonb {status, conversation_id?}
--     status: ok | legame_open | exists | pending | cooldown |
--             limit_pending | limit_daily | blocked | not_found |
--             self | not_member
-- ------------------------------------------------------------
create or replace function public.send_chat_request(
  p_member_number integer,
  p_message text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_me     uuid := auth.uid();
  v_target uuid;
  v_convo  uuid;
  v_msg    text := trim(coalesce(p_message, ''));
begin
  if v_me is null or not exists (select 1 from profiles where id = v_me) then
    return jsonb_build_object('status', 'not_member');
  end if;

  select id into v_target from profiles
  where member_number = p_member_number and deleted_at is null;
  if v_target is null then
    return jsonb_build_object('status', 'not_found');
  end if;
  if v_target = v_me then
    return jsonb_build_object('status', 'self');
  end if;
  if public._is_blocked(v_me, v_target) then
    return jsonb_build_object('status', 'blocked');
  end if;
  if char_length(v_msg) < 1 or char_length(v_msg) > 280 then
    return jsonb_build_object('status', 'bad_message');
  end if;

  -- Conversazione già aperta?
  select id into v_convo from conversations
  where a = least(v_me, v_target) and b = greatest(v_me, v_target);
  if v_convo is not null then
    return jsonb_build_object('status', 'exists', 'conversation_id', v_convo);
  end if;

  -- Legame (poke reciproco)? La chat si apre subito: il poke
  -- reciproco È il consenso.
  if exists (select 1 from pokes where from_profile = v_me and to_profile = v_target)
     and exists (select 1 from pokes where from_profile = v_target and to_profile = v_me) then
    insert into conversations (a, b)
    values (least(v_me, v_target), greatest(v_me, v_target))
    returning id into v_convo;
    insert into messages (conversation_id, sender, body) values (v_convo, v_me, v_msg);
    return jsonb_build_object('status', 'legame_open', 'conversation_id', v_convo);
  end if;

  -- Richiesta già pendente?
  if exists (select 1 from chat_requests
             where from_profile = v_me and to_profile = v_target and status = 'pending') then
    return jsonb_build_object('status', 'pending');
  end if;

  -- Rifiutato negli ultimi 30 giorni? Silenzio.
  if exists (select 1 from chat_requests
             where from_profile = v_me and to_profile = v_target
               and status = 'declined'
               and responded_at > now() - interval '30 days') then
    return jsonb_build_object('status', 'cooldown');
  end if;

  -- Anti-spam: max 3 pendenti in uscita, max 10 richieste al giorno
  if (select count(*) from chat_requests
      where from_profile = v_me and status = 'pending') >= 3 then
    return jsonb_build_object('status', 'limit_pending');
  end if;
  if (select count(*) from chat_requests
      where from_profile = v_me and created_at > now() - interval '24 hours') >= 10 then
    return jsonb_build_object('status', 'limit_daily');
  end if;

  insert into chat_requests (from_profile, to_profile, message)
  values (v_me, v_target, v_msg);
  return jsonb_build_object('status', 'ok');
end;
$$;

grant execute on function public.send_chat_request(integer, text) to authenticated;

-- ------------------------------------------------------------
-- 3b. respond_chat_request: accetta (apre la chat, il primo
--     messaggio è quello della richiesta) o rifiuta (silenzioso).
-- ------------------------------------------------------------
create or replace function public.respond_chat_request(
  p_request uuid,
  p_accept boolean
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_me  uuid := auth.uid();
  v_req chat_requests;
  v_convo uuid;
begin
  select * into v_req from chat_requests
  where id = p_request and to_profile = v_me and status = 'pending';
  if v_req is null then
    return jsonb_build_object('status', 'not_found');
  end if;

  if not p_accept then
    update chat_requests set status = 'declined', responded_at = now()
    where id = p_request;
    return jsonb_build_object('status', 'declined');
  end if;

  update chat_requests set status = 'accepted', responded_at = now()
  where id = p_request;

  select id into v_convo from conversations
  where a = least(v_me, v_req.from_profile) and b = greatest(v_me, v_req.from_profile);
  if v_convo is null then
    insert into conversations (a, b)
    values (least(v_me, v_req.from_profile), greatest(v_me, v_req.from_profile))
    returning id into v_convo;
  end if;

  insert into messages (conversation_id, sender, body, created_at)
  values (v_convo, v_req.from_profile, v_req.message, v_req.created_at);

  return jsonb_build_object('status', 'accepted', 'conversation_id', v_convo);
end;
$$;

grant execute on function public.respond_chat_request(uuid, boolean) to authenticated;

-- ------------------------------------------------------------
-- 3c. send_message: con blocchi e flood-control (20 msg/minuto).
-- ------------------------------------------------------------
create or replace function public.send_message(
  p_conversation uuid,
  p_body text
)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_me    uuid := auth.uid();
  v_other uuid;
  v_body  text := trim(coalesce(p_body, ''));
begin
  select case when a = v_me then b else a end into v_other
  from conversations
  where id = p_conversation and v_me in (a, b);
  if v_other is null then
    return 'not_found';
  end if;
  if public._is_blocked(v_me, v_other) then
    return 'blocked';
  end if;
  if char_length(v_body) < 1 or char_length(v_body) > 1000 then
    return 'bad_message';
  end if;
  if (select count(*) from messages
      where sender = v_me and created_at > now() - interval '1 minute') >= 20 then
    return 'rate';
  end if;

  insert into messages (conversation_id, sender, body)
  values (p_conversation, v_me, v_body);
  update conversations set last_message_at = now() where id = p_conversation;
  return 'ok';
end;
$$;

grant execute on function public.send_message(uuid, text) to authenticated;

-- ------------------------------------------------------------
-- 3d. my_conversations: inbox, dalla più recente.
-- ------------------------------------------------------------
create or replace function public.my_conversations()
returns table (
  conversation_id  uuid,
  member_number    integer,
  alias            text,
  avatar_id        text,
  photo_blur_path  text,
  photo_updated_at timestamptz,
  last_message_at  timestamptz,
  last_body        text,
  last_is_mine     boolean,
  unread_count     bigint
)
language sql
security definer
set search_path = public
stable
as $$
  select
    c.id,
    p.member_number,
    p.alias,
    p.avatar_id,
    p.photo_blur_path,
    p.photo_updated_at,
    c.last_message_at,
    lm.body,
    (lm.sender = auth.uid()),
    coalesce(u.cnt, 0)
  from conversations c
  join profiles p
    on p.id = case when c.a = auth.uid() then c.b else c.a end
  left join lateral (
    select body, sender from messages m
    where m.conversation_id = c.id
    order by m.created_at desc limit 1
  ) lm on true
  left join lateral (
    select count(*) as cnt from messages m
    where m.conversation_id = c.id
      and m.sender <> auth.uid()
      and m.read_at is null
  ) u on true
  where auth.uid() in (c.a, c.b)
    and p.deleted_at is null
  order by c.last_message_at desc;
$$;

grant execute on function public.my_conversations() to authenticated;

-- ------------------------------------------------------------
-- 3e. conversation_messages + mark_conversation_read
-- ------------------------------------------------------------
create or replace function public.conversation_messages(
  p_conversation uuid,
  limit_count integer default 100
)
returns table (
  id         uuid,
  mine       boolean,
  body       text,
  created_at timestamptz,
  read_at    timestamptz
)
language sql
security definer
set search_path = public
stable
as $$
  select m.id, (m.sender = auth.uid()), m.body, m.created_at, m.read_at
  from messages m
  join conversations c on c.id = m.conversation_id
  where m.conversation_id = p_conversation
    and auth.uid() in (c.a, c.b)
  order by m.created_at desc
  limit limit_count;
$$;

grant execute on function public.conversation_messages(uuid, integer) to authenticated;

create or replace function public.mark_conversation_read(p_conversation uuid)
returns void
language sql
security definer
set search_path = public
as $$
  update messages m
  set read_at = now()
  from conversations c
  where c.id = m.conversation_id
    and m.conversation_id = p_conversation
    and auth.uid() in (c.a, c.b)
    and m.sender <> auth.uid()
    and m.read_at is null;
$$;

grant execute on function public.mark_conversation_read(uuid) to authenticated;

-- ------------------------------------------------------------
-- 3f. my_chat_requests: pendenti, in entrata e in uscita.
-- ------------------------------------------------------------
create or replace function public.my_chat_requests()
returns table (
  id               uuid,
  direction        text,
  member_number    integer,
  alias            text,
  avatar_id        text,
  photo_blur_path  text,
  photo_updated_at timestamptz,
  message          text,
  created_at       timestamptz
)
language sql
security definer
set search_path = public
stable
as $$
  select
    r.id,
    case when r.to_profile = auth.uid() then 'in' else 'out' end,
    p.member_number,
    p.alias,
    p.avatar_id,
    p.photo_blur_path,
    p.photo_updated_at,
    r.message,
    r.created_at
  from chat_requests r
  join profiles p
    on p.id = case when r.to_profile = auth.uid() then r.from_profile else r.to_profile end
  where r.status = 'pending'
    and auth.uid() in (r.from_profile, r.to_profile)
    and p.deleted_at is null
  order by r.created_at desc;
$$;

grant execute on function public.my_chat_requests() to authenticated;

-- ------------------------------------------------------------
-- 3g. inbox_badge: contatori per la campanella.
-- ------------------------------------------------------------
create or replace function public.inbox_badge()
returns jsonb
language sql
security definer
set search_path = public
stable
as $$
  select jsonb_build_object(
    'unread', (
      select count(*) from messages m
      join conversations c on c.id = m.conversation_id
      where auth.uid() in (c.a, c.b)
        and m.sender <> auth.uid()
        and m.read_at is null
    ),
    'requests', (
      select count(*) from chat_requests
      where to_profile = auth.uid() and status = 'pending'
    )
  );
$$;

grant execute on function public.inbox_badge() to authenticated;

-- ------------------------------------------------------------
-- 4. block_member / unblock_member / report_member
--    Bloccare rifiuta anche le richieste pendenti tra i due.
-- ------------------------------------------------------------
create or replace function public.block_member(p_member_number integer)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_me     uuid := auth.uid();
  v_target uuid;
begin
  select id into v_target from profiles where member_number = p_member_number;
  if v_me is null or v_target is null or v_target = v_me then
    return 'not_found';
  end if;

  insert into blocks (blocker, blocked) values (v_me, v_target)
  on conflict do nothing;

  update chat_requests set status = 'declined', responded_at = now()
  where status = 'pending'
    and ((from_profile = v_me and to_profile = v_target)
      or (from_profile = v_target and to_profile = v_me));

  return 'ok';
end;
$$;

grant execute on function public.block_member(integer) to authenticated;

create or replace function public.unblock_member(p_member_number integer)
returns text
language plpgsql
security definer
set search_path = public
as $$
begin
  delete from blocks
  where blocker = auth.uid()
    and blocked = (select id from profiles where member_number = p_member_number);
  return 'ok';
end;
$$;

grant execute on function public.unblock_member(integer) to authenticated;

create or replace function public.report_member(
  p_member_number integer,
  p_reason text
)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_me     uuid := auth.uid();
  v_target uuid;
begin
  select id into v_target from profiles where member_number = p_member_number;
  if v_me is null or v_target is null or v_target = v_me then
    return 'not_found';
  end if;
  if char_length(trim(coalesce(p_reason, ''))) < 1 then
    return 'bad_reason';
  end if;
  if (select count(*) from reports
      where reporter = v_me and created_at > now() - interval '24 hours') >= 5 then
    return 'rate';
  end if;

  insert into reports (reporter, reported, reason)
  values (v_me, v_target, trim(p_reason));
  return 'ok';
end;
$$;

grant execute on function public.report_member(integer, text) to authenticated;

-- ------------------------------------------------------------
-- 5. RPC admin per le segnalazioni
-- ------------------------------------------------------------
create or replace function public.admin_reports()
returns table (
  id              uuid,
  reporter_alias  text,
  reported_alias  text,
  reported_id     uuid,
  reported_number integer,
  reason          text,
  status          text,
  created_at      timestamptz
)
language sql
security definer
set search_path = public
stable
as $$
  select r.id, pr.alias, pd.alias, pd.id, pd.member_number,
         r.reason, r.status, r.created_at
  from reports r
  join profiles pr on pr.id = r.reporter
  join profiles pd on pd.id = r.reported
  where public.is_admin()
  order by (r.status = 'open') desc, r.created_at desc;
$$;

grant execute on function public.admin_reports() to authenticated;

create or replace function public.admin_close_report(p_report uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception 'Non autorizzato';
  end if;
  update reports set status = 'closed' where id = p_report;
end;
$$;

grant execute on function public.admin_close_report(uuid) to authenticated;

-- ------------------------------------------------------------
-- 6. Blocchi rispettati ovunque:
--    chi ti ha bloccato sparisce per te (muro, profilo, poke).
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
    and not public._is_blocked(auth.uid(), p.id)
  order by coalesce(k.cnt, 0) desc, p.member_number asc;
$$;

grant execute on function public.members_wall() to authenticated;

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
    and exists (select 1 from profiles me where me.id = auth.uid())
    and not public._is_blocked(auth.uid(), p.id);
$$;

grant execute on function public.public_profile(text) to authenticated;

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
  if public._is_blocked(v_me, v_target) then
    return 'not_found';
  end if;

  insert into pokes (from_profile, to_profile)
  values (v_me, v_target)
  on conflict (from_profile, to_profile, poked_on) do nothing;

  if not found then
    return 'already';
  end if;

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
