-- ============================================================
-- 69 · DAY-OFF con NABI (dom 29/11): VENDITE CHIUSE
-- ------------------------------------------------------------
-- Luka, 28/11: "disattivami la vendita delle prevendite di Nabi".
--
-- Cosa fa, SOLO su quella serata:
--   1. tutte le fasce → nascoste: nessun biglietto nuovo, per nessuno
--      (PR, account manager, direzione). Il blocco è il trigger dello
--      script 45 (presales_fascia_nascosta).
--   2. iscrizione libera dei PR → spenta (nessuno si prende prevendite
--      nuove da solo).
-- Cosa NON tocca:
--   - i biglietti già fatti: restano validi e lo scanner li legge;
--   - le altre serate e l'interruttore generale "ferma le vendite".
-- Per riaprire: /admin/pr → Prezzi → "rimetti in vendita" sulla fascia.
-- Rieseguibile.
-- ============================================================

do $$
declare
  v_n int;
begin
  select count(*) into v_n
    from public.events e
   where e.name ilike '%nabi%'
     and e.starts_at >= '2026-11-29 00:00+01'
     and e.starts_at <  '2026-11-30 00:00+01';

  if v_n <> 1 then
    raise exception 'Trovate % serate di Nabi il 29/11 invece di 1: non tocco niente', v_n;
  end if;

  update public.event_tiers t
     set nascosta = true
    from public.events e
   where t.event_id = e.id
     and e.name ilike '%nabi%'
     and e.starts_at >= '2026-11-29 00:00+01'
     and e.starts_at <  '2026-11-30 00:00+01';

  delete from public.pr_iscrizione_libera l
   using public.events e
   where l.event_id = e.id
     and e.name ilike '%nabi%'
     and e.starts_at >= '2026-11-29 00:00+01'
     and e.starts_at <  '2026-11-30 00:00+01';
end $$;

-- Controllo: ogni fascia deve dire "CHIUSA"
select e.name                                   as serata,
       t.label                                  as fascia,
       t.price                                  as prezzo,
       case when t.nascosta then 'CHIUSA' else 'APERTA' end as stato,
       (select count(*) from public.presales p where p.tier_id = t.id) as gia_fatte
  from public.event_tiers t
  join public.events e on e.id = t.event_id
 where e.name ilike '%nabi%'
   and e.starts_at >= '2026-11-29 00:00+01'
   and e.starts_at <  '2026-11-30 00:00+01'
 order by t.sort, t.label;
