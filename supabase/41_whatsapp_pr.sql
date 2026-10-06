-- ============================================================
-- 41 · IL NUMERO WHATSAPP DEI PR (6 ottobre 2026)
-- ============================================================
-- Luka: prima un PR lo attivava lui a mano, e per farlo gli scriveva
-- su WhatsApp: con ognuno aveva una chat aperta. Da quando si candidano
-- dal sito questa chat non c'è più, e può esserci un PR che non sa come
-- chiamare o a cui non può scrivere al volo.
--
-- Da qui:
--   · chi si candida allo staff lascia il numero WhatsApp (obbligatorio);
--   · chi è già PR e non l'ha mai lasciato non vende finché non lo
--     scrive (glielo chiede il sito aprendo "Le tue prevendite");
--   · nel pannello staff c'è la lista "da scrivere su WhatsApp": il
--     tasto apre la chat col benvenuto già scritto e segna la data.
--     Non blocca nessuno: è il promemoria di Luka.
--
-- Il numero sta in profiles.phone (colonna che c'era dal primo giorno
-- e che nessuno riempiva). Si salva sempre come "+" e cifre.
-- Si può rieseguire.
-- ============================================================


-- ------------------------------------------------------------
-- 1 · Quando Luka gli ha scritto
-- ------------------------------------------------------------
alter table public.profiles
  add column if not exists whatsapp_scritto_at timestamptz;


-- ------------------------------------------------------------
-- 2 · Il numero, sempre nella stessa forma
-- ------------------------------------------------------------
-- La stessa regola sta in lib/whatsapp.ts: se si cambia una, si
-- cambia anche l'altra.
--   "347 123 4567"   → +393471234567  (cellulare italiano senza prefisso)
--   "0039 347…"      → +39347…
--   "+385 91 …"      → +38591…
--   "0434 …"         → null: comincia con 0 senza prefisso, non si indovina
create or replace function public._numero_whatsapp(p_grezzo text)
returns text
language plpgsql
immutable
set search_path = public
as $$
declare
  n     text := regexp_replace(coalesce(p_grezzo, ''), '[^0-9+]', '', 'g');
  cifre text;
begin
  if n like '+%' then
    cifre := replace(substr(n, 2), '+', '');
  elsif n like '00%' then
    cifre := substr(n, 3);
  elsif n like '3%' and length(n) in (9, 10) then
    cifre := '39' || n;
  elsif n like '0%' then
    return null;
  else
    cifre := n;
  end if;

  if cifre !~ '^[0-9]{10,15}$' then
    return null;
  end if;
  return '+' || cifre;
end;
$$;

revoke execute on function public._numero_whatsapp(text) from public, anon, authenticated;


-- ------------------------------------------------------------
-- 3 · Il PR: il suo numero, e scriverlo
-- ------------------------------------------------------------
create or replace function public.pr_mio_numero()
returns text
language sql
security definer
set search_path = public
stable
as $$
  select p.phone from public.profiles p where p.id = auth.uid();
$$;

revoke execute on function public.pr_mio_numero() from public, anon;
grant execute on function public.pr_mio_numero() to authenticated;


-- Cambiare numero azzera "gli ho scritto": la chat aperta era
-- sull'altro, quindi torna nella lista di Luka.
create or replace function public.set_mio_numero(p_numero text)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_num text := public._numero_whatsapp(p_numero);
begin
  if auth.uid() is null
     or not exists (select 1 from public.profiles where id = auth.uid() and deleted_at is null) then
    raise exception 'Non autorizzato';
  end if;
  if v_num is null then
    raise exception 'numero_non_valido';
  end if;
  if exists (select 1 from public.profiles
             where phone = v_num and id <> auth.uid() and deleted_at is null) then
    raise exception 'numero_gia_usato';
  end if;

  update public.profiles
     set whatsapp_scritto_at = case when phone is distinct from v_num then null
                                    else whatsapp_scritto_at end,
         phone = v_num
   where id = auth.uid();
  return v_num;
end;
$$;

revoke execute on function public.set_mio_numero(text) from public, anon;
grant execute on function public.set_mio_numero(text) to authenticated;


-- ------------------------------------------------------------
-- 4 · Senza numero il PR non vende
-- ------------------------------------------------------------
-- Un controllo sulla tabella, non dentro pr_vendi: così non si tocca la
-- vendita (che resta quella dello script 39) e vale per qualunque
-- strada. Scatta solo quando è il PR stesso a fare la prevendita per
-- sé: la direzione e gli omaggi non hanno un PR, passano come prima.
create or replace function public._presales_serve_numero()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.pr_id is not null
     and new.pr_id = auth.uid()
     and exists (select 1 from public.profiles
                 where id = new.pr_id and coalesce(trim(phone), '') = '') then
    raise exception 'serve_numero';
  end if;
  return new;
end;
$$;

revoke execute on function public._presales_serve_numero() from public, anon, authenticated;

drop trigger if exists presales_serve_numero on public.presales;
create trigger presales_serve_numero
  before insert on public.presales
  for each row execute function public._presales_serve_numero();


-- ------------------------------------------------------------
-- 5 · L'iscrizione: chi si candida lascia il numero
-- ------------------------------------------------------------
-- Identica a quella di RESET.sql, con p_telefono in fondo. Ha un
-- default, quindi il sito vecchio (che non lo manda) funziona ancora.
-- La firma cambia: la vecchia va tolta, se no ce ne sarebbero due.
drop function if exists
  public.join_public(text, text, text, text, text, jsonb, text, boolean, jsonb);

create or replace function public.join_public(
  p_alias         text,
  p_avatar_id     text,
  p_nome          text,
  p_email         text,
  p_gender        text,
  p_quiz_answers  jsonb,
  p_referral_code text    default null,
  p_crew_request  boolean default false,
  p_crew_answers  jsonb   default null,
  p_telefono      text    default null
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
  v_tel         text := null;
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

  -- Chi si candida allo staff deve metterci la faccia: nome vero,
  -- e il numero WhatsApp su cui Luka gli scrive se entra.
  if p_crew_request then
    if v_nome is null then
      raise exception 'Per candidarti serve il tuo nome';
    end if;
    v_tel := public._numero_whatsapp(p_telefono);
    if v_tel is null then
      raise exception 'numero_non_valido';
    end if;
    if exists (select 1 from public.profiles where phone = v_tel and deleted_at is null) then
      raise exception 'numero_gia_usato';
    end if;
    v_stato := 'in_attesa';
  end if;

  if p_referral_code is not null then
    select id into v_referrer_id
    from public.profiles
    where referral_code = p_referral_code and deleted_at is null;
  end if;

  insert into public.profiles (
    id, alias, avatar_id, nome, email, gender, phone,
    quiz_answers, role, referred_by,
    crew_request_status, crew_request_at, crew_answers
  )
  values (
    auth.uid(), p_alias, p_avatar_id, v_nome, v_email, p_gender, v_tel,
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

revoke execute on function
  public.join_public(text, text, text, text, text, jsonb, text, boolean, jsonb, text)
  from public, anon;
grant execute on function
  public.join_public(text, text, text, text, text, jsonb, text, boolean, jsonb, text)
  to authenticated;


-- ------------------------------------------------------------
-- 6 · Il pannello staff vede il numero
-- ------------------------------------------------------------
-- Tutte e due cambiano forma (colonne in più): si buttano e si rifanno.

drop function if exists public.admin_crew_requests();
create function public.admin_crew_requests()
returns table (
  id uuid, member_number integer, alias text, nome text, email text,
  gender text, crew_request_at timestamptz, crew_answers jsonb,
  invitato_da text, telefono text
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
         p.gender, p.crew_request_at, p.crew_answers, r.alias, p.phone
  from public.profiles p
  left join public.profiles r on r.id = p.referred_by
  where p.crew_request_status = 'in_attesa' and p.deleted_at is null
  order by p.crew_request_at;
end;
$$;

revoke execute on function public.admin_crew_requests() from public, anon;
grant execute on function public.admin_crew_requests() to authenticated;


-- La crew, con numero, quando Luka gli ha scritto e le serate
-- (non ancora passate) a cui è agganciato: servono al benvenuto.
drop function if exists public.admin_crew_answers();
create function public.admin_crew_answers()
returns table (
  id uuid, member_number integer, alias text, nome text, email text,
  crew_since timestamptz, crew_answers jsonb,
  telefono text, whatsapp_scritto_at timestamptz, serate text
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
  select p.id, p.member_number, p.alias, p.nome, p.email, p.crew_since, p.crew_answers,
         p.phone, p.whatsapp_scritto_at,
         (select string_agg(e.name, ' e ' order by e.starts_at)
            from public.pr_serate s
            join public.events e on e.id = s.event_id
           where s.pr_id = p.id
             and e.starts_at > now() - interval '12 hours')
  from public.profiles p
  where p.role = 'crew' and p.deleted_at is null
  order by p.member_number;
end;
$$;

revoke execute on function public.admin_crew_answers() from public, anon;
grant execute on function public.admin_crew_answers() to authenticated;


-- ------------------------------------------------------------
-- 7 · Luka: "gli ho scritto" e "il numero giusto è questo"
-- ------------------------------------------------------------
create or replace function public.admin_whatsapp_scritto(p_profile uuid, p_scritto boolean default true)
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
     set whatsapp_scritto_at = case when p_scritto then now() else null end
   where id = p_profile;
end;
$$;

revoke execute on function public.admin_whatsapp_scritto(uuid, boolean) from public, anon;
grant execute on function public.admin_whatsapp_scritto(uuid, boolean) to authenticated;


-- Per correggere un numero sbagliato, o metterlo a chi l'ha dato a voce.
create or replace function public.admin_set_numero(p_profile uuid, p_numero text)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_num text := public._numero_whatsapp(p_numero);
begin
  if not public.is_admin() then
    raise exception 'Non autorizzato';
  end if;
  if v_num is null then
    raise exception 'numero_non_valido';
  end if;
  if exists (select 1 from public.profiles
             where phone = v_num and id <> p_profile and deleted_at is null) then
    raise exception 'numero_gia_usato';
  end if;

  update public.profiles
     set whatsapp_scritto_at = case when phone is distinct from v_num then null
                                    else whatsapp_scritto_at end,
         phone = v_num
   where id = p_profile;
  return v_num;
end;
$$;

revoke execute on function public.admin_set_numero(uuid, text) from public, anon;
grant execute on function public.admin_set_numero(uuid, text) to authenticated;


-- ============================================================
-- Controllo: la crew, con e senza numero.
-- (Appena incollato: tutti "senza numero", è normale. Si riempie man
-- mano che i PR aprono "Le tue prevendite".)
-- ============================================================
select count(*) filter (where coalesce(trim(phone), '') <> '') as "PR col numero",
       count(*) filter (where coalesce(trim(phone), '') = '')  as "PR senza numero"
from public.profiles
where role = 'crew' and deleted_at is null;
