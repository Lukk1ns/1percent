-- ============================================================
-- 56 — CULTURE con gli SLINGS, venerdì 13 novembre: donna omaggio
--
-- Chiesto da Luka il 5 novembre 2026: *"serve anche fare la
-- prenotazione per le donne gratis e mettere 50 posti"*. Didascalia:
-- "PRIME 50 DONNE: INGRESSO OMAGGIO CON PRENOTAZIONE".
--
-- Stessa macchina di MALDITA del 17 (42), lista nuova:
--   · ci si prenota su unpercento.it/slings (nome, cognome, anno,
--     WhatsApp): solo ragazze, dai 18 anni (il venerdì è 18+);
--   · 50 posti, approvazione AUTOMATICA: le prime 50 hanno subito il QR,
--     dalla 51ª lista d'attesa. Si cambia dal pannello /admin/slings;
--   · il QR è l'ingresso omaggio, lo scansiona la cassa entro le 00:30.
--     Dopo le 00:30 la porta dice SCADUTO e si paga (didascalia: dopo le
--     00:30 donna 10 € + 1 drink).
--
-- Differenza dal 17: il venerdì i ragazzi pagano, quindi i PR devono
-- poter vendere. La regola del 53 staccava dai PR ogni serata con una
-- lista che non fosse SHOT OMAGGIO: questa lista è un OMAGGIO DONNA ma
-- la serata resta ai PR (punto 1).
--
-- Da incollare dopo il 42, il 43 e il 53. Si può rieseguire: se la
-- lista c'è già non la tocca (le scelte fatte dal pannello restano).
-- ============================================================

do $$
begin
  if to_regclass('public.omaggio_liste') is null then
    raise exception 'Manca lo script 42: incolla prima il 42 e il 43, poi questo.';
  end if;
end $$;


-- ------------------------------------------------------------
-- 1 · Copiata dal 53: neanche la lista di CULTURE stacca i PR
-- ------------------------------------------------------------
create or replace function public._pr_agganciato(p_pr uuid, p_event uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select not exists (select 1 from public.omaggio_liste ol
                      where ol.event_id = p_event
                        and ol.tier_label is distinct from 'SHOT OMAGGIO'
                        and ol.slug <> 'slings')
     and (
          exists (select 1 from public.pr_serate s
                   where s.pr_id = p_pr and s.event_id = p_event)
       or exists (select 1 from public.account_managers m
                   where m.profile_id = p_pr and m.attivo)
     );
$$;

revoke execute on function public._pr_agganciato(uuid, uuid) from public, anon, authenticated;


-- ------------------------------------------------------------
-- 2 · La serata di venerdì 13 e la sua lista
--
-- Se c'è già una serata del PAPI-ON il 13, si usa quella: in porta la
-- notte deve essere una sola. Altrimenti si crea, NON pubblicata.
-- ------------------------------------------------------------
do $$
declare
  v_ev    uuid;
  v_venue uuid;
begin
  if exists (select 1 from public.omaggio_liste where slug = 'slings') then
    return;
  end if;

  select v.id into v_venue
    from public.venues v
   where upper(regexp_replace(v.name, '[^A-Za-z]', '', 'g')) = 'PAPION'
   limit 1;

  select e.id into v_ev
    from public.events e
   where (e.starts_at at time zone 'Europe/Rome')::date = date '2026-11-13'
     and e.venue_id = v_venue
   order by e.starts_at
   limit 1;

  if v_ev is null then
    insert into public.events (venue_id, name, slug, starts_at, descrizione, published)
    values (v_venue,
            'CULTURE · SLINGS',
            'culture-slings-13-novembre',
            timestamptz '2026-11-13 23:30:00 Europe/Rome',
            'Hip-hop Friday · special guest SLINGS · DJ thatsmrb · prime 50 donne omaggio con prenotazione',
            false)
    on conflict (slug) do nothing
    returning id into v_ev;

    if v_ev is null then
      select e.id into v_ev from public.events e
       where e.slug = 'culture-slings-13-novembre';
    end if;
  end if;

  -- Prenotazioni aperte fino all'ultimo, come il QR (lezione del 48).
  insert into public.omaggio_liste
    (slug, event_id, titolo, modo, posti, chiude_at, valido_fino, eta_min, tier_label,
     sorpresa_on, msg_conferma)
  values
    ('slings', v_ev, 'CULTURE · SLINGS',
     'auto', 50,
     timestamptz '2026-11-14 00:30:00 Europe/Rome',
     timestamptz '2026-11-14 00:30:00 Europe/Rome',
     18,
     'OMAGGIO DONNA',
     false,
     E'Ciao {nome}! 🔥 Sei tra le prime 50: ingresso omaggio a CULTURE con gli SLINGS, venerdì 13 novembre al PAPI-ON.\n\nIl tuo QR è qui: {link}\n\nFallo scansionare in cassa entro le 00:30 e porta il documento vero, in mano. Ci vediamo venerdì!');
end $$;


-- ============================================================
-- Controllo. Deve uscire una riga: slings · la serata del 13 al
-- PAPI-ON · prenotazioni e QR fino al 14/11 00:30 · auto · 50 posti.
-- ============================================================
select l.slug as "pagina",
       e.name as "serata",
       v.name as "locale",
       e.published as "pubblicata sull'1%",
       to_char(l.chiude_at at time zone 'Europe/Rome', 'DD/MM HH24:MI') as "prenotazioni fino a",
       to_char(l.valido_fino at time zone 'Europe/Rome', 'DD/MM HH24:MI') as "QR valido fino a",
       l.eta_min as "età minima",
       l.modo as "approvazione",
       coalesce(l.posti::text, 'da decidere') as "posti",
       (select count(*) from public.pr_serate s where s.event_id = l.event_id) as "PR agganciati (vendono lo stesso)"
  from public.omaggio_liste l
  join public.events e on e.id = l.event_id
  left join public.venues v on v.id = e.venue_id
 where l.slug = 'slings';
