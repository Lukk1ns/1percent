-- ============================================================
-- EMAIL UNICA — una mail = una iscrizione
-- Da incollare nel SQL Editor di Supabase (sicuro, idempotente:
-- non tocca i membri esistenti, blocca solo le NUOVE doppie).
-- ============================================================

-- Indice per rendere veloce il controllo (case-insensitive)
create index if not exists profiles_email_lower_idx
  on public.profiles (lower(email));

-- join_one_percent v3: rifiuta la registrazione se l'email è già usata
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

-- CONTROLLO: mostra le email già doppie oggi (se la lista è vuota, perfetto;
-- se c'è qualcosa, sono account creati PRIMA di questo fix — decidi tu se toccarli)
select lower(email) as email, count(*) as account, array_agg(alias) as alias
from public.profiles
where email is not null
group by lower(email)
having count(*) > 1
order by count(*) desc;
