-- ============================================================
-- 1% — BACKUP PRIMA DEL RESET
--
-- ESEGUI QUESTO PER PRIMO, PRIMA DI QUALSIASI CANCELLAZIONE.
--
-- COME SI USA:
-- 1. Apri il SQL Editor di Supabase
-- 2. Incolla ed esegui UNA query alla volta (sono 4, separate qui sotto)
-- 3. Dopo ogni query premi "Download CSV" sotto ai risultati
-- 4. Salva i 4 file in:
--    ~/Desktop/ClaudeLukkins/1percent/_backup_pre_reset/
--
-- ATTENZIONE: questo backup è per te, come rete di sicurezza.
-- Le email erano raccolte per il vecchio evento: NON vanno usate
-- per mandare comunicazioni sul nuovo senza un nuovo consenso.
-- ============================================================


-- ------------------------------------------------------------
-- 1 di 4 — MEMBRI (salva come: membri.csv)
-- ------------------------------------------------------------
select
  p.member_number,
  p.alias,
  p.email,
  p.gender,
  p.referral_code,
  r.alias        as invitato_da,
  p.created_at,
  p.deleted_at
from public.profiles p
left join public.profiles r on r.id = p.referred_by
order by p.member_number;


-- ------------------------------------------------------------
-- 2 di 4 — INGRESSI VALIDATI (salva come: ingressi.csv)
-- ------------------------------------------------------------
select
  p.member_number,
  p.alias,
  pa.status,
  pa.checked_in_at,
  pa.checked_in_by
from public.passes pa
join public.profiles p on p.id = pa.profile_id
order by pa.checked_in_at nulls last;


-- ------------------------------------------------------------
-- 3 di 4 — RISPOSTE AL QUIZ (salva come: quiz.csv)
-- ------------------------------------------------------------
select
  p.member_number,
  p.alias,
  p.quiz_answers
from public.profiles p
where p.quiz_answers is not null
order by p.member_number;


-- ------------------------------------------------------------
-- 4 di 4 — REGALI ESTRATTI (salva come: regali.csv)
-- Salta questa query se la tabella non esiste.
-- ------------------------------------------------------------
select
  p.member_number,
  p.alias,
  d.prize_code,
  d.created_at
from public.prize_draws d
join public.profiles p on p.id = d.profile_id
order by d.created_at;


-- ------------------------------------------------------------
-- CONTROLLO FINALE — quante righe stai per perdere
-- ------------------------------------------------------------
select
  (select count(*) from public.profiles)  as membri,
  (select count(*) from public.passes)    as pass,
  (select count(*) from public.profiles where email is not null) as con_email;
