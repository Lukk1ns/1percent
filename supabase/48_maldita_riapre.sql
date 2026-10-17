-- ============================================================
-- 48 — MALDITA: LE PRENOTAZIONI RESTANO APERTE FINO ALL'ORARIO OMAGGIO
--
-- 17 ottobre 2026. Sul sito unpercento.it/maldita compariva
-- "Prenotazioni chiuse", mentre nel pannello l'interruttore diceva
-- "aperte".
--
-- PERCHÉ. Il sito apre il modulo solo se l'interruttore è acceso E non
-- è ancora passata la chiusura automatica (`chiude_at`). La chiusura
-- era fissata a venerdì 16/10 alle 23:59 (script 42): da mezzanotte il
-- sito ha chiuso da solo, l'interruttore è rimasto acceso.
--
-- COSA CAMBIA. La chiusura automatica si sposta all'ora in cui scade
-- l'omaggio (domenica 18/10 alle 00:30). Fino ad allora decide solo
-- l'interruttore del pannello. Niente altro cambia.
--
-- Da incollare nel SQL Editor. Si può rieseguire.
-- ============================================================

update public.omaggio_liste
   set chiude_at = valido_fino,
       updated_at = now()
 where slug = 'maldita';

select slug, aperta,
       to_char(chiude_at at time zone 'Europe/Rome', 'DD/MM HH24:MI') as "iscrizioni fino a"
  from public.omaggio_liste
 where slug = 'maldita';
