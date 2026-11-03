-- ============================================================
-- 54 — MALDITA 7/11: lo shot anche ai minorenni (analcolico)
--
-- Luka, 3 novembre 2026: *"togli il 18+ per gli shottini... lo diamo
-- anche ai minorenni ma analcolico... non specificare niente"*.
-- La lista maldita7 (53) era dai 18 anni: ora dai 16, come la serata.
-- Sulle pagine non c'è scritto niente; al bar, se il QR è di un
-- minorenne, lo scanner dice ANALCOLICO (schermo viola). Il conto è
-- quello di sempre in porta: anno di oggi meno anno di nascita < 18.
--
-- Da incollare dopo il 53. Si può rieseguire.
-- ============================================================

update public.omaggio_liste
   set eta_min = 16, updated_at = now(), updated_by = 'script 54'
 where slug = 'maldita7';

-- Controllo: deve uscire una riga con età minima 16.
select slug as "pagina", eta_min as "età minima",
       to_char(valido_fino at time zone 'Europe/Rome', 'DD/MM HH24:MI') as "shot fino a"
  from public.omaggio_liste
 where slug = 'maldita7';
