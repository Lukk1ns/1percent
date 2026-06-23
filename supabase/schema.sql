-- ============================================================
-- "1%" — schema iniziale del database (Fase 1)
--
-- COME USARLO:
-- 1. Crea un progetto su supabase.com (piano gratuito va bene).
-- 2. Vai su Authentication > Sign In / Providers e attiva
--    "Anonymous sign-ins".
-- 3. Vai su SQL Editor, incolla tutto questo file e premi Run.
-- 4. Crea il tuo account staff in Authentication > Users
--    (email + password), poi in SQL editor esegui:
--      insert into public.admins (email) values ('tua-email@esempio.it');
-- 5. Copia Project URL e anon public key (Project Settings > API)
--    dentro il file .env.local del progetto.
-- ============================================================

create extension if not exists "pgcrypto";

-- ------------------------------------------------------------
-- Tabelle
-- ------------------------------------------------------------

-- Un profilo per ogni membro (anche con sessione anonima)
create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  member_number serial unique,
  alias text not null unique,
  avatar_id text,
  quiz_answers jsonb,
  email text,
  phone text,
  referral_code text not null unique default substr(md5(gen_random_uuid()::text), 1, 8),
  referred_by uuid references public.profiles (id) on delete set null,
  consent_privacy_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  deleted_at timestamptz
);

-- Pass d'ingresso con QR univoco
create table public.passes (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles (id) on delete cascade,
  qr_token text not null unique default encode(gen_random_bytes(16), 'hex'),
  status text not null default 'valid' check (status in ('valid', 'checked_in')),
  checked_in_at timestamptz,
  checked_in_by text,
  created_at timestamptz not null default now()
);

create index passes_profile_id_idx on public.passes (profile_id);

-- Elenco staff autorizzato a validare i pass all'ingresso.
-- Nessuna policy pubblica: si gestisce solo da SQL editor.
create table public.admins (
  email text primary key
);

-- ------------------------------------------------------------
-- Sicurezza (RLS): ogni utente vede solo i propri dati.
-- Tutte le scritture passano dalle funzioni qui sotto.
-- ------------------------------------------------------------

alter table public.profiles enable row level security;
alter table public.passes enable row level security;
alter table public.admins enable row level security;

create policy "select_own_profile"
  on public.profiles for select
  using (auth.uid() = id);

create policy "select_own_pass"
  on public.passes for select
  using (auth.uid() = profile_id);

-- ------------------------------------------------------------
-- Funzioni (chiamate dal sito tramite supabase.rpc(...))
-- ------------------------------------------------------------

-- Controlla se chi chiama è nello staff autorizzato.
create or replace function public.is_admin()
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1 from public.admins a where a.email = (auth.jwt() ->> 'email')
  );
$$;

-- Numero totale di membri attivi, per il contatore live in homepage.
create or replace function public.member_count()
returns integer
language sql
security definer
set search_path = public
stable
as $$
  select count(*)::int from public.profiles where deleted_at is null;
$$;

grant execute on function public.member_count() to anon, authenticated;

-- Quanti membri ha portato chi chiama, per la pagina referral.
create or replace function public.referral_count()
returns integer
language sql
security definer
set search_path = public
stable
as $$
  select count(*)::int from public.profiles
  where referred_by = auth.uid() and deleted_at is null;
$$;

grant execute on function public.referral_count() to authenticated;

-- Registrazione: crea profilo + pass in un solo passaggio atomico.
-- p_referral_code è il codice di chi ha invitato (opzionale).
create or replace function public.join_one_percent(
  p_alias text,
  p_avatar_id text,
  p_quiz_answers jsonb,
  p_email text default null,
  p_phone text default null,
  p_referral_code text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_referrer_id uuid;
  v_profile public.profiles;
  v_pass public.passes;
begin
  if auth.uid() is null then
    raise exception 'Sessione non valida';
  end if;

  if exists (select 1 from public.profiles where id = auth.uid()) then
    raise exception 'Esiste già un profilo per questa sessione';
  end if;

  if p_referral_code is not null then
    select id into v_referrer_id from public.profiles where referral_code = p_referral_code;
  end if;

  insert into public.profiles (id, alias, avatar_id, quiz_answers, email, phone, referred_by)
  values (auth.uid(), p_alias, p_avatar_id, p_quiz_answers, p_email, p_phone, v_referrer_id)
  returning * into v_profile;

  insert into public.passes (profile_id)
  values (v_profile.id)
  returning * into v_pass;

  return jsonb_build_object(
    'member_number', v_profile.member_number,
    'alias', v_profile.alias,
    'avatar_id', v_profile.avatar_id,
    'referral_code', v_profile.referral_code,
    'qr_token', v_pass.qr_token,
    'created_at', v_profile.created_at
  );
end;
$$;

grant execute on function public.join_one_percent(text, text, jsonb, text, text, text) to authenticated;

-- Diritto alla cancellazione (GDPR): anonimizza il profilo e
-- rimuove il pass. Mantiene il numero membro per non rompere
-- il conteggio storico e la catena dei referral.
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
      deleted_at = now()
  where id = auth.uid();

  delete from public.passes where profile_id = auth.uid();
end;
$$;

grant execute on function public.delete_my_profile() to authenticated;

-- Validazione pass all'ingresso (solo staff in public.admins).
create or replace function public.checkin(p_token text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_pass public.passes;
  v_profile public.profiles;
begin
  if not public.is_admin() then
    raise exception 'Non autorizzato';
  end if;

  select * into v_pass from public.passes where qr_token = p_token;

  if v_pass is null then
    return jsonb_build_object('ok', false, 'reason', 'not_found');
  end if;

  select * into v_profile from public.profiles where id = v_pass.profile_id;

  if v_pass.status = 'checked_in' then
    return jsonb_build_object(
      'ok', false,
      'reason', 'already_checked_in',
      'alias', v_profile.alias,
      'member_number', v_profile.member_number,
      'checked_in_at', v_pass.checked_in_at
    );
  end if;

  update public.passes
  set status = 'checked_in', checked_in_at = now(), checked_in_by = auth.jwt() ->> 'email'
  where id = v_pass.id;

  return jsonb_build_object(
    'ok', true,
    'alias', v_profile.alias,
    'avatar_id', v_profile.avatar_id,
    'member_number', v_profile.member_number
  );
end;
$$;

grant execute on function public.checkin(text) to authenticated;
