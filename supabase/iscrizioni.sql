-- ============================================================
-- ISCRIZIONI APERTE/CHIUSE — interruttore dal pannello admin
-- Da incollare nel SQL Editor di Supabase e premere Run.
-- Sicuro e idempotente: non tocca membri, premi o estrazioni.
--
-- Cosa fa:
--  · tabella app_settings con l'interruttore "signups_open"
--  · signups_open()            → il sito chiede se le iscrizioni sono aperte
--  · admin_set_signups(bool)   → SOLO admin apre/chiude
--  · join_one_percent v4       → rifiuta le iscrizioni quando è chiuso
--    (blocco vero lato server: nessuno si iscrive nemmeno col link diretto)
-- ============================================================

-- 1) Tabella impostazioni (chiave/valore). RLS attiva senza policy:
--    nessuno la legge o scrive direttamente, solo tramite le funzioni qui sotto.
create table if not exists public.app_settings (
  key   text primary key,
  value text not null
);
alter table public.app_settings enable row level security;

-- Stato iniziale: iscrizioni APERTE (non sovrascrive se esiste già)
insert into public.app_settings (key, value)
values ('signups_open', 'true')
on conflict (key) do nothing;

-- 2) Il sito chiede: iscrizioni aperte? (pubblica, sola lettura)
create or replace function public.signups_open()
returns boolean
language sql
security definer
set search_path = public
as $$
  select coalesce(
    (select value = 'true' from public.app_settings where key = 'signups_open'),
    true
  );
$$;
grant execute on function public.signups_open() to anon, authenticated;

-- 3) Apri/chiudi (SOLO admin)
create or replace function public.admin_set_signups(p_open boolean)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception 'Non autorizzato';
  end if;

  insert into public.app_settings (key, value)
  values ('signups_open', case when p_open then 'true' else 'false' end)
  on conflict (key) do update set value = excluded.value;

  return p_open;
end;
$$;
grant execute on function public.admin_set_signups(boolean) to authenticated;

-- 4) join_one_percent v4: come la v3 (email unica) + rifiuta se chiuso
create or replace function public.join_one_percent(
  p_alias text,
  p_avatar_id text,
  p_quiz_answers jsonb,
  p_email text default null,
  p_gender text default null,
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
  v_email text;
begin
  -- Iscrizioni chiuse? Porta sbarrata anche lato server.
  if not public.signups_open() then
    raise exception 'iscrizioni_chiuse';
  end if;

  if auth.uid() is null then
    raise exception 'Sessione non valida';
  end if;

  if exists (select 1 from public.profiles where id = auth.uid()) then
    raise exception 'Esiste già un profilo per questa sessione';
  end if;

  -- Email normalizzata (minuscola, senza spazi) e UNICA
  v_email := nullif(lower(trim(p_email)), '');
  if v_email is not null and exists (
    select 1 from public.profiles where lower(email) = v_email
  ) then
    raise exception 'Email già registrata: ogni email vale una sola iscrizione';
  end if;

  if p_referral_code is not null then
    select id into v_referrer_id from public.profiles where referral_code = p_referral_code;
  end if;

  insert into public.profiles (id, alias, avatar_id, quiz_answers, email, gender, referred_by)
  values (auth.uid(), p_alias, p_avatar_id, p_quiz_answers, v_email, p_gender, v_referrer_id)
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

-- Verifica: deve dire "true" (aperte). Dopo il toggle dal pannello, "false".
-- select public.signups_open();
