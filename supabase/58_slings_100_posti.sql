-- ============================================================
-- 58 — CULTURE · SLINGS 13/11: 100 posti e serata 16+
--
-- Luka, 10 novembre 2026: *"abbiamo allargato il limite a 100"*.
-- Contiene anche il 57 (età minima 16), che non era stato incollato:
-- basta questo. Si può rieseguire.
-- ============================================================

update public.omaggio_liste
   set posti = 100, eta_min = 16, updated_at = now(), updated_by = 'script 58'
 where slug = 'slings';

select slug as "pagina", eta_min as "età minima", modo as "approvazione",
       coalesce(posti::text, 'da decidere') as "posti",
       to_char(valido_fino at time zone 'Europe/Rome', 'DD/MM HH24:MI') as "omaggio fino a"
  from public.omaggio_liste
 where slug = 'slings';
