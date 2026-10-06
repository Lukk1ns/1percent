-- ============================================================
-- MALDITA · CANCELLA LE PROVE (da usare UNA volta, prima di pubblicare)
--
-- Toglie tutte le iscrizioni fatte finora sulla pagina /maldita e i loro
-- QR, così si parte da zero coi numeri giusti.
--
-- SICUREZZA: se le iscritte sono più di 10 si ferma e non cancella
-- niente — vuol dire che il link è già girato e quelle sono vere.
-- ============================================================

do $$
declare
  v_n int;
  v_ev uuid;
begin
  select count(*) into v_n from public.omaggio_richieste where lista = 'maldita';
  if v_n > 10 then
    raise exception 'Ci sono % iscritte: non sono prove. Non cancello niente.', v_n;
  end if;

  select event_id into v_ev from public.omaggio_liste where slug = 'maldita';

  -- prima le richieste (puntano ai QR), poi i QR della serata
  delete from public.omaggio_richieste where lista = 'maldita';
  delete from public.presales
   where event_id = v_ev and prezzo = 0 and pr_id is null and tier_label = 'OMAGGIO DONNA';

  raise notice 'Cancellate % prove.', v_n;
end $$;

select
  (select count(*) from public.omaggio_richieste where lista = 'maldita') as "iscritte rimaste (deve essere 0)";
