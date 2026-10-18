-- ============================================================
-- 49 — DAY-OFF CON NABI RINVIATA A DOMENICA 29 NOVEMBRE
--
-- 18 ottobre 2026. La DAY-OFF di domenica 18/10 è stata rinviata a
-- domenica 29 novembre, sempre dalle 15:00. Cambia solo la data della
-- serata (e una riga di avviso nella descrizione): biglietti venduti dai
-- PR, fasce, soglie ingresso e delega restano attaccati alla stessa
-- serata, quindi valgono per il 29 senza fare altro.
--
-- Si può rieseguire.
-- ============================================================

update public.events
   set starts_at   = timestamptz '2026-11-29 15:00:00 Europe/Rome',
       descrizione = '⚠️ NUOVA DATA: domenica 18 ottobre ➜ domenica 29 novembre, dalle 15:00.' || chr(10) ||
                     '🎟 Tutte le prevendite acquistate restano valide.'
 where id = 'afe4b4f1-bef3-474d-88bf-2395a235827f';

-- Controllo: deve uscire una riga con 2026-11-29 15:00
select name, starts_at at time zone 'Europe/Rome' as quando, descrizione
  from public.events
 where id = 'afe4b4f1-bef3-474d-88bf-2395a235827f';
