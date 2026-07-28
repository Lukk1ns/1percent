-- ============================================================
-- 1% — FONDAMENTA DELL'ORGANIZZAZIONE (step 1)
--
-- Cosa introduce:
--   · due livelli di utenza: crew (su invito) e pubblico (su link)
--   · QR CODE PERSONALE STATICO sul profilo, uguale per sempre
--   · inviti crew monouso generati dall'admin
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
-- 1. PROFILI — ruolo, nome, QR statico
-- ============================================================

alter table public.profiles
  add column if not exists role text not null default 'public',
  add column if not exists nome text,
  add column if not exists qr_token text,
  add column if not exists crew_invited_by uuid references public.profiles (id) on delete set null,
  add column if not exists crew_since timestamptz,
  add column if not exists crew_answers jsonb;

-- 'public' = il giro · 'crew' = l'1%. Gli admin restano nella tabella admins.
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'profiles_role_check'
  ) then
    alter table public.profiles
      add constraint profiles_role_check check (role in ('public', 'crew'));
  end if;
end $$;

-- Il QR personale: generato una volta, non cambia mai più.
-- È l'unica cosa che il membro mostra allo stand, a qualsiasi evento.
--
-- Chi ha già un pass si tiene il SUO token: così il QR già stampato o
-- salvato sul telefono continua a funzionare, e allo step 4 lo scanner
-- passa a leggere il profilo senza che nessuno rifaccia niente.
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

-- Una email = una iscrizione (regola già in vigore, la riaffermo qui)
create unique index if not exists profiles_email_lower_idx
  on public.profiles (lower(email)) where email is not null and deleted_at is null;


-- ============================================================
-- 2. INVITI CREW — nell'1% non ti candidi, ci vieni chiamato
-- ============================================================

create table if not exists public.crew_invites (
  code       text primary key default upper(substr(md5(gen_random_uuid()::text), 1, 8)),
  note       text,                      -- "per Marco, il DJ" — promemoria per l'admin
  created_by text not null,             -- email dell'admin che l'ha generato
  used_by    uuid references public.profiles (id) on delete set null,
  used_at    timestamptz,
  revoked_at timestamptz,
  expires_at timestamptz not null default now() + interval '30 days',
  created_at timestamptz not null default now()
);

-- Nessuna policy: si legge e si scrive solo dalle funzioni qui sotto.
alter table public.crew_invites enable row level security;


-- ============================================================
-- 3. CLICK SUI LINK INVITO
-- Serve a distinguere "quanti l'hanno visto" da "quanti sono
-- entrati davvero". Solo i secondi generano punti.
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
-- 4. REGISTRO AZIONI ADMIN — chi ha fatto cosa, e quando
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
-- 5. LETTURE PER IL SITO
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
    'member_number',  p.member_number,
    'alias',          p.alias,
    'nome',           p.nome,
    'avatar_id',      p.avatar_id,
    'role',           p.role,
    'qr_token',       p.qr_token,
    'referral_code',  p.referral_code,
    'crew_since',     p.crew_since,
    'created_at',     p.created_at
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
-- 6. INGRESSO NELL'1%
-- ============================================================

-- Controlla un codice invito PRIMA di mostrare il form.
-- Non rivela niente di sensibile: solo se il codice vale o no.
create or replace function public.check_crew_invite(p_code text)
returns jsonb
language plpgsql
security definer
set search_path = public
stable
as $$
declare
  v public.crew_invites;
begin
  select * into v from public.crew_invites
  where code = upper(trim(coalesce(p_code, '')));

  if v.code is null then
    return jsonb_build_object('ok', false, 'reason', 'inesistente');
  end if;
  if v.revoked_at is not null then
    return jsonb_build_object('ok', false, 'reason', 'revocato');
  end if;
  if v.used_at is not null then
    return jsonb_build_object('ok', false, 'reason', 'gia_usato');
  end if;
  if v.expires_at < now() then
    return jsonb_build_object('ok', false, 'reason', 'scaduto');
  end if;

  return jsonb_build_object('ok', true, 'note', v.note);
end;
$$;

grant execute on function public.check_crew_invite(text) to anon, authenticated;


-- Iscrizione CREW: solo con un invito valido, che si brucia all'uso.
-- Non passa dall'interruttore iscrizioni: l'invito È il filtro.
create or replace function public.join_crew(
  p_alias        text,
  p_avatar_id    text,
  p_nome         text,
  p_email        text,
  p_gender       text,
  p_crew_answers jsonb,
  p_invite_code  text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_invite  public.crew_invites;
  v_profile public.profiles;
  v_pass    public.passes;
  v_email   text := lower(trim(coalesce(p_email, '')));
  v_code    text := upper(trim(coalesce(p_invite_code, '')));
begin
  if auth.uid() is null then
    raise exception 'Sessione non valida';
  end if;

  if exists (select 1 from public.profiles where id = auth.uid()) then
    raise exception 'Esiste già un profilo per questa sessione';
  end if;

  -- L'invito si blocca qui: se due persone usano lo stesso codice
  -- nello stesso istante, passa solo la prima.
  select * into v_invite from public.crew_invites where code = v_code for update;

  if v_invite.code is null then
    raise exception 'Invito inesistente';
  end if;
  if v_invite.revoked_at is not null then
    raise exception 'Invito revocato';
  end if;
  if v_invite.used_at is not null then
    raise exception 'Invito già usato';
  end if;
  if v_invite.expires_at < now() then
    raise exception 'Invito scaduto';
  end if;

  if v_email = '' then
    raise exception 'Serve una email';
  end if;
  if exists (select 1 from public.profiles where lower(email) = v_email and deleted_at is null) then
    raise exception 'Email già registrata';
  end if;
  if coalesce(trim(p_nome), '') = '' then
    raise exception 'Serve il tuo nome';
  end if;

  insert into public.profiles (
    id, alias, avatar_id, nome, email, gender,
    role, crew_since, crew_answers
  )
  values (
    auth.uid(), p_alias, p_avatar_id, trim(p_nome), v_email, p_gender,
    'crew', now(), p_crew_answers
  )
  returning * into v_profile;

  -- Un solo token per persona: pass e profilo condividono lo stesso QR.
  insert into public.passes (profile_id, qr_token)
  values (v_profile.id, v_profile.qr_token)
  returning * into v_pass;

  update public.crew_invites
  set used_by = v_profile.id, used_at = now()
  where code = v_code;

  return jsonb_build_object(
    'member_number', v_profile.member_number,
    'alias',         v_profile.alias,
    'avatar_id',     v_profile.avatar_id,
    'role',          v_profile.role,
    'qr_token',      v_profile.qr_token,
    'referral_code', v_profile.referral_code,
    'created_at',    v_profile.created_at
  );
end;
$$;

grant execute on function public.join_crew(text, text, text, text, text, jsonb, text) to authenticated;


-- Iscrizione PUBBLICO: tramite il link personale di un membro crew.
-- L'attribuzione a quel membro è permanente.
create or replace function public.join_public(
  p_alias         text,
  p_avatar_id     text,
  p_nome          text,
  p_email         text,
  p_gender        text,
  p_quiz_answers  jsonb,
  p_referral_code text default null
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
  v_aperte      boolean := true;
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

  if p_referral_code is not null then
    select id into v_referrer_id
    from public.profiles
    where referral_code = p_referral_code and deleted_at is null;
  end if;

  insert into public.profiles (
    id, alias, avatar_id, nome, email, gender,
    quiz_answers, role, referred_by
  )
  values (
    auth.uid(), p_alias, p_avatar_id, nullif(trim(coalesce(p_nome, '')), ''), v_email, p_gender,
    p_quiz_answers, 'public', v_referrer_id
  )
  returning * into v_profile;

  -- Un solo token per persona: pass e profilo condividono lo stesso QR.
  insert into public.passes (profile_id, qr_token)
  values (v_profile.id, v_profile.qr_token)
  returning * into v_pass;

  return jsonb_build_object(
    'member_number', v_profile.member_number,
    'alias',         v_profile.alias,
    'avatar_id',     v_profile.avatar_id,
    'role',          v_profile.role,
    'qr_token',      v_profile.qr_token,
    'referral_code', v_profile.referral_code,
    'created_at',    v_profile.created_at
  );
end;
$$;

grant execute on function public.join_public(text, text, text, text, text, jsonb, text) to authenticated;


-- ============================================================
-- 7. PANNELLO ADMIN — inviti e ruoli
-- ============================================================

create or replace function public.admin_create_crew_invite(p_note text default null)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v public.crew_invites;
begin
  if not public.is_admin() then
    raise exception 'Non autorizzato';
  end if;

  insert into public.crew_invites (note, created_by)
  values (nullif(trim(coalesce(p_note, '')), ''), coalesce(auth.jwt() ->> 'email', 'admin'))
  returning * into v;

  perform public.log_admin('crea_invito_crew', v.code, jsonb_build_object('note', v.note));

  return jsonb_build_object('code', v.code, 'expires_at', v.expires_at, 'note', v.note);
end;
$$;

revoke execute on function public.admin_create_crew_invite(text) from anon;
grant execute on function public.admin_create_crew_invite(text) to authenticated;


create or replace function public.admin_list_crew_invites()
returns table (
  code text, note text, created_by text, created_at timestamptz,
  expires_at timestamptz, used_at timestamptz, revoked_at timestamptz,
  used_by_alias text, used_by_number integer, stato text
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
  select
    i.code, i.note, i.created_by, i.created_at,
    i.expires_at, i.used_at, i.revoked_at,
    p.alias, p.member_number,
    case
      when i.revoked_at is not null then 'revocato'
      when i.used_at is not null    then 'usato'
      when i.expires_at < now()     then 'scaduto'
      else 'valido'
    end
  from public.crew_invites i
  left join public.profiles p on p.id = i.used_by
  order by i.created_at desc;
end;
$$;

revoke execute on function public.admin_list_crew_invites() from anon;
grant execute on function public.admin_list_crew_invites() to authenticated;


create or replace function public.admin_revoke_crew_invite(p_code text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception 'Non autorizzato';
  end if;

  update public.crew_invites
  set revoked_at = now()
  where code = upper(trim(p_code)) and used_at is null;

  perform public.log_admin('revoca_invito_crew', upper(trim(p_code)), null);
end;
$$;

revoke execute on function public.admin_revoke_crew_invite(text) from anon;
grant execute on function public.admin_revoke_crew_invite(text) to authenticated;


-- Promuovere o retrocedere qualcuno a mano, senza passare da un invito.
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
      crew_since = case
        when p_role = 'crew' then coalesce(crew_since, now())
        else null
      end
  where id = p_profile;

  perform public.log_admin('cambia_ruolo', p_profile::text, jsonb_build_object('role', p_role));
end;
$$;

revoke execute on function public.admin_set_role(uuid, text) from anon;
grant execute on function public.admin_set_role(uuid, text) to authenticated;


-- Le risposte al questionario crew, con il nome vero accanto.
-- Contiene dati personali: rigorosamente is_admin().
create or replace function public.admin_crew_answers()
returns table (
  member_number integer, alias text, nome text, email text,
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
  select p.member_number, p.alias, p.nome, p.email, p.crew_since, p.crew_answers
  from public.profiles p
  where p.role = 'crew' and p.deleted_at is null
  order by p.member_number;
end;
$$;

revoke execute on function public.admin_crew_answers() from anon;
grant execute on function public.admin_crew_answers() to authenticated;


-- ============================================================
-- VERIFICA — dopo l'esecuzione dovresti vedere 0 membri,
-- 0 crew, e la lista delle nuove funzioni.
-- ============================================================
select
  (select count(*) from public.profiles)      as membri,
  (select count(*) from public.profiles where role = 'crew') as crew,
  (select count(*) from public.crew_invites)  as inviti;
