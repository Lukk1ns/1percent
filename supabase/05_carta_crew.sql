-- ============================================================
-- 1% — PRESENZE E TESSERA DELLA CREW (step 4)
--
-- Da eseguire DOPO 03_eventi.sql. Incollalo tutto e premi Run.
-- È idempotente: rilanciarlo non rompe niente.
--
-- Cosa introduce:
--   · le PRESENZE: chi si presenta davvero a una serata, evento per
--     evento. Il vecchio check-in del pass diceva solo "è entrato una
--     volta nella vita": qui conta ogni serata.
--   · la TESSERA della crew: quante persone ha portato uno, quante di
--     quelle si sono presentate davvero, quante serate ha fatto lui,
--     a che livello è e in che posizione sta questo mese.
--
-- Regola: portare gente che poi non viene non vale. Il punteggio si
-- fa con le presenze, non con le iscrizioni.
-- ============================================================

-- ============================================================
-- 1. LE PRESENZE
-- ============================================================

create table if not exists public.checkins (
  id         uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles (id) on delete cascade,
  event_id   uuid not null references public.events (id) on delete cascade,
  at         timestamptz not null default now(),
  by_email   text,
  unique (profile_id, event_id)
);

create index if not exists checkins_event_idx on public.checkins (event_id, at desc);
create index if not exists checkins_profile_idx on public.checkins (profile_id);

alter table public.checkins enable row level security;
-- Nessuna policy: si legge e si scrive solo dalle funzioni qui sotto.


-- ============================================================
-- 2. QUAL È LA SERATA DI STASERA
--
-- Lo scanner non deve chiedere niente a chi sta alla porta: la
-- serata la trova da solo. Finestra larga: si apre 5 ore prima
-- dell'inizio e si chiude 6 ore dopo la fine.
-- ============================================================

create or replace function public.evento_in_corso()
returns public.events
language sql
security definer
set search_path = public
stable
as $$
  select e.*
  from public.events e
  where e.published
    and now() >= e.starts_at - interval '5 hours'
    and now() <= coalesce(e.ends_at, e.starts_at + interval '6 hours') + interval '6 hours'
  order by e.starts_at
  limit 1;
$$;


-- ============================================================
-- 3. REGISTRA UNA PRESENZA — SOLO STAFF
--
-- Accetta sia il QR del pass sia quello statico del profilo: allo
-- step 1 sono stati resi identici apposta.
-- ============================================================

create or replace function public.registra_presenza(p_token text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_profile public.profiles;
  v_evento  public.events;
  v_nuova   boolean := false;
begin
  if not public.is_staff() then
    raise exception 'Non autorizzato';
  end if;

  select p.* into v_profile
  from public.profiles p
  where p.qr_token = p_token
     or p.id = (select pa.profile_id from public.passes pa where pa.qr_token = p_token);

  if v_profile is null then
    return jsonb_build_object('ok', false, 'reason', 'not_found');
  end if;

  select * into v_evento from public.evento_in_corso();

  if v_evento is null then
    return jsonb_build_object(
      'ok', false,
      'reason', 'nessun_evento',
      'alias', v_profile.alias
    );
  end if;

  insert into public.checkins (profile_id, event_id, by_email)
  values (v_profile.id, v_evento.id, lower(auth.jwt() ->> 'email'))
  on conflict (profile_id, event_id) do nothing;

  v_nuova := found;

  return jsonb_build_object(
    'ok', true,
    'nuova', v_nuova,
    'alias', v_profile.alias,
    'member_number', v_profile.member_number,
    'evento', v_evento.name,
    'presenti', (select count(*) from public.checkins c where c.event_id = v_evento.id)
  );
end;
$$;

revoke execute on function public.registra_presenza(text) from anon;
grant execute on function public.registra_presenza(text) to authenticated;


-- ============================================================
-- 4. LA TESSERA
--
-- Una chiamata sola: il disegno della tessera si costruisce tutto
-- da qui. Niente dati di altri se non l'alias, che è già pubblico
-- sul Muro.
-- ============================================================

create or replace function public.my_crew_card()
returns jsonb
language plpgsql
security definer
set search_path = public
stable
as $$
declare
  v_me           public.profiles;
  v_portati      bigint;
  v_presenti     bigint;
  v_presenze     bigint;
  v_serate_mie   bigint;
  v_punti_mese   bigint;
  v_posizione    bigint;
  v_crew_totali  bigint;
  v_stelle       jsonb;
  v_evento       public.events;
  v_livello      int;
  v_inizio_mese  timestamptz := date_trunc('month', now() at time zone 'Europe/Rome');
begin
  select * into v_me from public.profiles where id = auth.uid();
  if v_me is null then
    return jsonb_build_object('ok', false, 'reason', 'no_profilo');
  end if;

  -- Le persone portate, con l'informazione che conta: si sono presentate?
  select
    count(*),
    count(*) filter (where p.presenze > 0),
    coalesce(sum(p.presenze), 0)
  into v_portati, v_presenti, v_presenze
  from (
    select
      pr.id,
      (select count(*) from public.checkins c where c.profile_id = pr.id) as presenze
    from public.profiles pr
    where pr.referred_by = v_me.id
  ) p;

  -- Le serate che ha fatto lui
  select count(distinct c.event_id) into v_serate_mie
  from public.checkins c
  where c.profile_id = v_me.id;

  -- Punti del mese: le presenze della gente che ha portato, più le sue
  select
    (select count(*)
       from public.checkins c
       join public.profiles pr on pr.id = c.profile_id
      where pr.referred_by = v_me.id
        and c.at >= v_inizio_mese)
    +
    (select count(*)
       from public.checkins c
      where c.profile_id = v_me.id
        and c.at >= v_inizio_mese)
  into v_punti_mese;

  -- Posizione fra la crew, sullo stesso metro
  select count(*) + 1 into v_posizione
  from (
    select
      cr.id,
      (select count(*)
         from public.checkins c
         join public.profiles pr on pr.id = c.profile_id
        where pr.referred_by = cr.id and c.at >= v_inizio_mese)
      +
      (select count(*)
         from public.checkins c
        where c.profile_id = cr.id and c.at >= v_inizio_mese) as punti
    from public.profiles cr
    where cr.role = 'crew' and cr.id <> v_me.id
  ) altri
  where altri.punti > v_punti_mese;

  select count(*) into v_crew_totali from public.profiles where role = 'crew';

  -- Le stelle: una per persona portata. Accesa = si è presentata.
  select coalesce(jsonb_agg(x order by x->>'quando'), '[]'::jsonb) into v_stelle
  from (
    select jsonb_build_object(
      'alias', pr.alias,
      'presente', exists (select 1 from public.checkins c where c.profile_id = pr.id),
      'quando', pr.created_at
    ) as x
    from public.profiles pr
    where pr.referred_by = v_me.id
    order by pr.created_at
    limit 300
  ) t;

  -- L'edizione: la serata in corso, o la prossima già svelata
  select * into v_evento from public.evento_in_corso();
  if v_evento is null then
    select e.* into v_evento
    from public.events e
    where e.published
      and public.evento_svelato(e.reveal_at)
      and coalesce(e.ends_at, e.starts_at) >= now()
    order by e.starts_at
    limit 1;
  end if;

  v_livello := case
    when v_portati >= 100 then 4
    when v_portati >= 30  then 3
    when v_portati >= 10  then 2
    else 1
  end;

  return jsonb_build_object(
    'ok', true,
    'alias', v_me.alias,
    'member_number', v_me.member_number,
    'avatar_id', v_me.avatar_id,
    'role', v_me.role,
    'referral_code', v_me.referral_code,
    'dal', v_me.created_at,
    'portati_totali', v_portati,
    'portati_presenti', v_presenti,
    'presenze_portati', v_presenze,
    'serate_mie', v_serate_mie,
    'punti_mese', v_punti_mese,
    'posizione', v_posizione,
    'crew_totali', v_crew_totali,
    'livello', v_livello,
    'stelle', v_stelle,
    'evento', case when v_evento is null then null else jsonb_build_object(
      'nome', case when public.evento_svelato(v_evento.reveal_at) then v_evento.name else '?????' end,
      'starts_at', v_evento.starts_at
    ) end
  );
end;
$$;

revoke execute on function public.my_crew_card() from anon;
grant execute on function public.my_crew_card() to authenticated;


-- ============================================================
-- 5. PRESENZE DI UNA SERATA — per il pannello
-- ============================================================

create or replace function public.admin_presenze()
returns table (
  evento text, quando timestamptz, presenti bigint
)
language plpgsql
security definer
set search_path = public
stable
as $$
begin
  if not public.is_admin() then raise exception 'Non autorizzato'; end if;

  return query
  select e.name, e.starts_at, count(c.id)
  from public.events e
  left join public.checkins c on c.event_id = e.id
  group by e.id, e.name, e.starts_at
  order by e.starts_at desc;
end;
$$;

revoke execute on function public.admin_presenze() from anon;
grant execute on function public.admin_presenze() to authenticated;


-- ============================================================
-- VERIFICA
-- ============================================================
select
  (select count(*) from public.checkins) as presenze_registrate,
  (select name from public.evento_in_corso()) as serata_in_corso;
