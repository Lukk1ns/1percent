-- ============================================================
-- 57 — CULTURE · SLINGS 13/11: la serata è 16+
--
-- Luka, 5 novembre 2026, dopo aver incollato il 56: *"metti 16+ la
-- serata"*. Il 56 aveva messo 18 (il venerdì di solito è 18+). Si
-- abbassa solo l'età minima della lista; il resto resta com'è.
-- Si può rieseguire.
-- ============================================================

update public.omaggio_liste
   set eta_min = 16, updated_at = now(), updated_by = 'script 57'
 where slug = 'slings';

select slug as "pagina", eta_min as "età minima", modo as "approvazione",
       coalesce(posti::text, 'da decidere') as "posti",
       to_char(valido_fino at time zone 'Europe/Rome', 'DD/MM HH24:MI') as "omaggio fino a"
  from public.omaggio_liste
 where slug = 'slings';
