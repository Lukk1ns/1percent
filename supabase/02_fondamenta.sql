-- ============================================================
-- 1% — FONDAMENTA DELL'ORGANIZZAZIONE (step 1)
--
-- Cosa introduce:
--   · due livelli di utenza: crew (staff) e pubblico (il giro)
--   · candidatura staff spuntata al momento dell'iscrizione,
--     che TU approvi o rifiuti dal pannello
--   · questionario dedicato a chi si candida
--   · QR CODE PERSONALE STATICO sul profilo, uguale per sempre
--   · tracciamento dei click sui link invito
--   · registro delle azioni admin
--
-- Da eseguire DOPO 00_backup.sql e 01_reset.sql.
-- È idempotente: rilanciarlo non rompe niente.
--
-- Regola non negoziabile di questo progetto: ogni funzione che
-- fa qualcosa di amministrativo comincia con il controllo
-- is_admin(). Il gate lato pagina non conta niente.
-- ============================================================

create extension if not exists "pgcrypto";

-- ============================================================
-- 1. PROFILI — ruolo, nome, QR statico, candidatura staff
-- ============================================================

alter table public.profiles
  add column if not exists role text not null default 'public',
  add column if not exists nome text,
  add column if not exists qr_token text,
  add column if not exists crew_since timestamptz,
  add column if not exists crew_answers jsonb,
  add column if not exists crew_request_status text not null default 'nessuna',
  add column if not exists crew_request_at timestamptz,
  add column if not exists crew_decided_at timestamptz,
  add column if not exists crew_decided_by text;

-- 'public' = il giro · 'crew' = staff. Gli admin restano nella tabella admins.
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'profiles_role_check') then
    alter table public.profiles
      add constraint profiles_role_check check (role in ('public', 'crew'));
  end if;

  if not exists (select 1 from pg_constraint where conname = 'profiles_crew_request_check') then
    alter table public.profiles
      add constraint profiles_crew_request_check
      check (crew_request_status in ('nessuna', 'in_attesa', 'approvata', 'rifiutata'));
  end if;
end $$;

-- Il QR personale: generato una volta, non cambia mai più.
-- È l'unica cosa che il membro mostra allo stand, a qualsiasi evento.
--
-- Chi ha già un pass si tiene il SUO token: così il QR già salvato sul
-- telefono continua a funzionare, e allo step 4 lo scanner passa a
-- leggere il profilo senza che nessuno rifaccia niente.
update public.profiles p
set qr_token = pa.qr_token
from public.passes pa
where pa.profile_id = p.id and p.qr_token is null;

update public.profiles
set qr_token = encode(gen_random_bytes(16), 'hex')
where qr_token is null;

alter table public.profiles alter column qr_token set default encode(gen_random_bytes(16), 'hex');
alter table public.profiles alter column qr_token set not null;

create unique index if not exists profiles_qr_token_idx on public.profiles (qr_token);
create index if not exists profiles_role_idx on public.profiles (role) where deleted_at is null;

-- Le candidature in attesa: è la coda che guardi dal pannello
create index if not exists profiles_crew_request_idx
  on public.profiles (crew_request_at)
  where crew_request_status = 'in_attesa';

-- Una email = una iscrizione (regola già in vigore, la riaffermo qui)
create unique index if not exists profiles_email_lower_idx
  on public.profiles (lower(email)) where email is not null and deleted_at is null;


-- ============================================================
-- 2. CLICK SUI LINK INVITO
-- Serve a distinguere "quanti l'hanno visto" da "quanti si sono
-- iscritti" da "quanti sono entrati davvero". Solo l'ultimo conta.
-- ============================================================

create table if not exists public.referral_clicks (
  id            bigserial primary key,
  referral_code text not null,
  created_at    timestamptz not null default now()
);

create index if not exists referral_clicks_code_idx
  on public.referral_clicks (referral_code, created_at desc);

alter table public.referral_clicks enable row level security;


-- ============================================================
-- 3. REGISTRO AZIONI ADMIN — chi ha fatto cosa, e quando
-- ============================================================

create table if not exists public.admin_log (
  id         bigserial primary key,
  actor      text not null,
  action     text not null,
  target     text,
  payload    jsonb,
  created_at timestamptz not null default now()
);

create index if not exists admin_log_created_idx on public.admin_log (created_at desc);
alter table public.admin_log enable row level security;

create or replace function public.log_admin(p_action text, p_target text, p_payload jsonb default null)
returns void
language sql
security definer
set search_path = public
as $$
  insert into public.admin_log (actor, action, target, payload)
  values (coalesce(auth.jwt() ->> 'email', 'sconosciuto'), p_action, p_target, p_payload);
$$;


-- ============================================================
-- 4. LETTURE PER IL SITO
-- ============================================================

-- Il proprio profilo, QR compreso. Ognuno vede solo il suo.
create or replace function public.my_profile()
returns jsonb
language sql
security definer
set search_path = public
stable
as $$
  select jsonb_build_object(
    'member_number',       p.member_number,
    'alias',               p.alias,
    'nome',                p.nome,
    'avatar_id',           p.avatar_id,
    'role',                p.role,
    'qr_token',            p.qr_token,
    'referral_code',       p.referral_code,
    'crew_since',          p.crew_since,
    'crew_request_status', p.crew_request_status,
    'created_at',          p.created_at
  )
  from public.profiles p
  where p.id = auth.uid() and p.deleted_at is null;
$$;

grant execute on function public.my_profile() to authenticated;

-- Missione 150: quanti siamo.
create or replace function public.crew_count()
returns integer
language sql
security definer
set search_path = public
stable
as $$
  select count(*)::int from public.profiles
  where role = 'crew' and deleted_at is null;
$$;

grant execute on function public.crew_count() to anon, authenticated;

-- Statistiche del proprio link invito.
-- "entrati" oggi si legge dai pass validati; allo step 4 passerà
-- alle presenze per evento senza cambiare la firma della funzione.
create or replace function public.my_referral_stats()
returns jsonb
language sql
security definer
set search_path = public
stable
as $$
  select jsonb_build_object(
    'click', (
      select count(*)::int from public.referral_clicks c
      join public.profiles me on me.referral_code = c.referral_code
      where me.id = auth.uid()
    ),
    'iscritti', (
      select count(*)::int from public.profiles
      where referred_by = auth.uid() and deleted_at is null
    ),
    'entrati', (
      select count(distinct p.id)::int
      from public.profiles p
      join public.passes pa on pa.profile_id = p.id
      where p.referred_by = auth.uid()
        and p.deleted_at is null
        and pa.status = 'checked_in'
    )
  );
$$;

grant execute on function public.my_referral_stats() to authenticated;

-- Registra un click sul link invito. Chiamabile da chiunque:
-- scrive solo un contatore, nessun dato personale, nessun IP.
create or replace function public.track_referral_click(p_code text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_code is null or length(p_code) > 32 then
    return;
  end if;

  -- ignoro i codici inventati, così la tabella non si riempie di spazzatura
  if not exists (select 1 from public.profiles where referral_code = p_code) then
    return;
  end if;

  insert into public.referral_clicks (referral_code) values (p_code);
end;
$$;

grant execute on function public.track_referral_click(text) to anon, authenticated;


-- ============================================================
-- 5. ISCRIZIONE
--
-- Una sola porta d'ingresso. Chi vuole entrare nello staff
-- spunta la casella e risponde a 4 domande in più: entra
-- comunque come pubblico, con la candidatura IN ATTESA.
-- Nessuno diventa crew da solo — decidi tu dal pannello.
-- ============================================================

create or replace function public.join_public(
  p_alias         text,
  p_avatar_id     text,
  p_nome          text,
  p_email         text,
  p_gender        text,
  p_quiz_answers  jsonb,
  p_referral_code text    default null,
  p_crew_request  boolean default false,
  p_crew_answers  jsonb   default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_referrer_id uuid;
  v_profile     public.profiles;
  v_pass        public.passes;
  v_email       text := lower(trim(coalesce(p_email, '')));
  v_nome        text := nullif(trim(coalesce(p_nome, '')), '');
  v_aperte      boolean := true;
  v_stato       text := 'nessuna';
begin
  if auth.uid() is null then
    raise exception 'Sessione non valida';
  end if;

  if exists (select 1 from public.profiles where id = auth.uid()) then
    raise exception 'Esiste già un profilo per questa sessione';
  end if;

  -- Interruttore iscrizioni: uso la funzione esistente se c'è,
  -- così non dipendo da come è fatta la tabella impostazioni.
  if to_regprocedure('public.signups_open()') is not null then
    execute 'select public.signups_open()' into v_aperte;
    if not coalesce(v_aperte, true) then
      raise exception 'iscrizioni_chiuse';
    end if;
  end if;

  if v_email = '' then
    raise exception 'Serve una email';
  end if;
  if exists (select 1 from public.profiles where lower(email) = v_email and deleted_at is null) then
    raise exception 'Email già registrata';
  end if;

  -- Chi si candida allo staff deve metterci la faccia: nome vero.
  if p_crew_request then
    if v_nome is null then
      raise exception 'Per candidarti serve il tuo nome';
    end if;
    v_stato := 'in_attesa';
  end if;

  if p_referral_code is not null then
    select id into v_referrer_id
    from public.profiles
    where referral_code = p_referral_code and deleted_at is null;
  end if;

  insert into public.profiles (
    id, alias, avatar_id, nome, email, gender,
    quiz_answers, role, referred_by,
    crew_request_status, crew_request_at, crew_answers
  )
  values (
    auth.uid(), p_alias, p_avatar_id, v_nome, v_email, p_gender,
    p_quiz_answers, 'public', v_referrer_id,
    v_stato,
    case when p_crew_request then now() else null end,
    case when p_crew_request then p_crew_answers else null end
  )
  returning * into v_profile;

  -- Un solo token per persona: pass e profilo condividono lo stesso QR.
  insert into public.passes (profile_id, qr_token)
  values (v_profile.id, v_profile.qr_token)
  returning * into v_pass;

  return jsonb_build_object(
    'member_number',       v_profile.member_number,
    'alias',               v_profile.alias,
    'avatar_id',           v_profile.avatar_id,
    'role',                v_profile.role,
    'qr_token',            v_profile.qr_token,
    'referral_code',       v_profile.referral_code,
    'crew_request_status', v_profile.crew_request_status,
    'created_at',          v_profile.created_at
  );
end;
$$;

grant execute on function
  public.join_public(text, text, text, text, text, jsonb, text, boolean, jsonb)
  to authenticated;

-- La vecchia firma non serve più: la tolgo per non lasciare
-- due strade aperte verso la stessa tabella.
drop function if exists public.join_one_percent(text, text, jsonb, text, text, text);


-- ============================================================
-- 6. PANNELLO ADMIN — candidature e ruoli
-- ============================================================

-- Le candidature in attesa, con le risposte e il nome vero.
create or replace function public.admin_crew_requests()
returns table (
  id uuid, member_number integer, alias text, nome text, email text,
  gender text, crew_request_at timestamptz, crew_answers jsonb,
  invitato_da text
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
  select p.id, p.member_number, p.alias, p.nome, p.email,
         p.gender, p.crew_request_at, p.crew_answers, r.alias
  from public.profiles p
  left join public.profiles r on r.id = p.referred_by
  where p.crew_request_status = 'in_attesa' and p.deleted_at is null
  order by p.crew_request_at;
end;
$$;

revoke execute on function public.admin_crew_requests() from anon;
grant execute on function public.admin_crew_requests() to authenticated;


-- Approva: la persona diventa crew. Da qui in poi ha area riservata,
-- classifica e link invito che conta.
create or replace function public.admin_approve_crew(p_profile uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception 'Non autorizzato';
  end if;

  update public.profiles
  set role                = 'crew',
      crew_since          = coalesce(crew_since, now()),
      crew_request_status = 'approvata',
      crew_decided_at     = now(),
      crew_decided_by     = auth.jwt() ->> 'email'
  where id = p_profile and deleted_at is null;

  perform public.log_admin('approva_crew', p_profile::text, null);
end;
$$;

revoke execute on function public.admin_approve_crew(uuid) from anon;
grant execute on function public.admin_approve_crew(uuid) to authenticated;


-- Rifiuta: resta pubblico e non viene avvisato di niente.
-- Le risposte le tengo: servono se ci ripensi.
create or replace function public.admin_reject_crew(p_profile uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception 'Non autorizzato';
  end if;

  update public.profiles
  set crew_request_status = 'rifiutata',
      crew_decided_at     = now(),
      crew_decided_by     = auth.jwt() ->> 'email'
  where id = p_profile and deleted_at is null;

  perform public.log_admin('rifiuta_crew', p_profile::text, null);
end;
$$;

revoke execute on function public.admin_reject_crew(uuid) from anon;
grant execute on function public.admin_reject_crew(uuid) to authenticated;


-- Promuovere o retrocedere qualcuno a mano, senza passare da una
-- candidatura: serve quando qualcuno finisce nel posto sbagliato.
create or replace function public.admin_set_role(p_profile uuid, p_role text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception 'Non autorizzato';
  end if;
  if p_role not in ('public', 'crew') then
    raise exception 'Ruolo non valido';
  end if;

  update public.profiles
  set role = p_role,
      crew_since = case when p_role = 'crew' then coalesce(crew_since, now()) else null end
  where id = p_profile;

  perform public.log_admin('cambia_ruolo', p_profile::text, jsonb_build_object('role', p_role));
end;
$$;

revoke execute on function public.admin_set_role(uuid, text) from anon;
grant execute on function public.admin_set_role(uuid, text) to authenticated;


-- La crew attuale, con le risposte di chi si era candidato.
create or replace function public.admin_crew_answers()
returns table (
  id uuid, member_number integer, alias text, nome text, email text,
  crew_since timestamptz, crew_answers jsonb
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
  select p.id, p.member_number, p.alias, p.nome, p.email, p.crew_since, p.crew_answers
  from public.profiles p
  where p.role = 'crew' and p.deleted_at is null
  order by p.member_number;
end;
$$;

revoke execute on function public.admin_crew_answers() from anon;
grant execute on function public.admin_crew_answers() to authenticated;


-- ============================================================
-- VERIFICA — dopo il reset dovresti vedere tutti zeri.
-- ============================================================
select
  (select count(*) from public.profiles) as membri,
  (select count(*) from public.profiles where role = 'crew') as crew,
  (select count(*) from public.profiles where crew_request_status = 'in_attesa') as candidature;
