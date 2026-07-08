-- ============================================================
-- PULIZIA DOPPIONI — per ogni email con più account,
-- tiene il PIÙ RECENTE e cancella i più vecchi.
-- Da incollare nel SQL Editor DOPO email_unica.sql.
-- Se qualcosa va storto, non cancella niente (tutto o niente).
-- ============================================================

-- 1) Individua gli account da cancellare (tutti tranne il più recente per email)
create temp table doomed as
select id, member_number, alias, lower(email) as email, created_at
from (
  select p.*,
         row_number() over (partition by lower(email) order by created_at desc) as rn
  from public.profiles p
  where email is not null
) t
where rn > 1;

-- 2) Stacca i post-it della bacheca dei doppioni (la tabella posts è stata
--    creata a mano: se non ha la colonna attesa o non esiste, ignora e prosegui)
do $$
begin
  if to_regclass('public.posts') is not null then
    begin
      execute 'delete from public.posts where profile_id in (select id from doomed)';
    exception when undefined_column then
      null;
    end;
  end if;
end $$;

-- 3) Cancella i doppioni (pass, poke, messaggi, legami, estrazioni
--    seguono a cascata; chi era stato invitato da loro resta, senza referrer)
delete from public.profiles where id in (select id from doomed);

-- 4) Riepilogo: questi sono gli account CANCELLATI (il gemello più recente è salvo)
select member_number as numero, alias, email,
       to_char(created_at, 'DD/MM HH24:MI') as creato_il
from doomed
order by email;
