-- ============================================================
-- 68 — AFRO-MERICA, venerdì 27 novembre: LADIES FREE · donna omaggio
--
-- Chiesto da Luka il 23 novembre 2026: "attivare le prenotazioni del
-- venerdì" — donna omaggio con prenotazione entro l'1, uomo 10 € entro
-- l'1 e 15 € dopo (si paga in cassa). "Non scrivere niente dell'età".
--
-- Stessa macchina di CULTURE · SLINGS (56), lista nuova:
--   · ci si prenota su unpercento.it/afromerica (nome, cognome, anno,
--     WhatsApp): solo ragazze. Pagine in inglese con l'ingresso anche in
--     italiano (in sala ci sono americani). L'età non è scritta da
--     nessuna parte: il menu degli anni si ferma da solo (eta_min 16, come
--     le altre liste); il documento lo controlla la sicurezza in porta;
--   · 100 posti, approvazione AUTOMATICA: le prime 100 hanno subito il QR,
--     dalla 101ª lista d'attesa. Si cambia dal pannello /admin/afromerica;
--   · il QR è l'ingresso omaggio, lo scansiona la cassa entro l'1 (28/11
--     01:00). Dopo l'1 la porta dice SCADUTO e si paga. Prenotazioni
--     aperte fino all'ultimo, come il QR (lezione del 48).
--
-- Il venerdì i ragazzi pagano: la lista non stacca la serata dai PR
-- (punto 1, come per SLINGS nel 56).
--
-- Da incollare dopo il 42, il 43, il 53 e il 56. Si può rieseguire: se la
-- lista c'è già non la tocca (le scelte fatte dal pannello restano).
-- ============================================================

do $$
begin
  if to_regclass('public.omaggio_liste') is null then
    raise exception 'Manca lo script 42: incolla prima il 42 e il 43, poi questo.';
  end if;
end $$;


-- ------------------------------------------------------------
-- 1 · Copiata dal 56: neanche la lista di AFRO-MERICA stacca i PR
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
                        and ol.slug not in ('slings', 'afromerica'))
     and (
          exists (select 1 from public.pr_serate s
                   where s.pr_id = p_pr and s.event_id = p_event)
       or exists (select 1 from public.account_managers m
                   where m.profile_id = p_pr and m.attivo)
     );
$$;

revoke execute on function public._pr_agganciato(uuid, uuid) from public, anon, authenticated;


-- ------------------------------------------------------------
-- 2 · La serata di venerdì 27 e la sua lista
--
-- Se c'è già una serata del PAPI-ON il 27, si usa quella: in porta la
-- notte deve essere una sola. Altrimenti si crea, NON pubblicata.
-- ------------------------------------------------------------
do $$
declare
  v_ev    uuid;
  v_venue uuid;
begin
  if exists (select 1 from public.omaggio_liste where slug = 'afromerica') then
    return;
  end if;

  select v.id into v_venue
    from public.venues v
   where upper(regexp_replace(v.name, '[^A-Za-z]', '', 'g')) = 'PAPION'
   limit 1;

  select e.id into v_ev
    from public.events e
   where (e.starts_at at time zone 'Europe/Rome')::date = date '2026-11-27'
     and e.venue_id = v_venue
   order by e.starts_at
   limit 1;

  if v_ev is null then
    insert into public.events (venue_id, name, slug, starts_at, descrizione, published)
    values (v_venue,
            'AFRO-MERICA',
            'afro-merica-27-novembre',
            timestamptz '2026-11-27 23:30:00 Europe/Rome',
            'First night · American hip hop × Afrobeats · DJ SAMB X DJ KING · ladies free con prenotazione entro l''1',
            false)
    on conflict (slug) do nothing
    returning id into v_ev;

    if v_ev is null then
      select e.id into v_ev from public.events e
       where e.slug = 'afro-merica-27-novembre';
    end if;
  end if;

  insert into public.omaggio_liste
    (slug, event_id, titolo, modo, posti, chiude_at, valido_fino, eta_min, tier_label,
     sorpresa_on, msg_conferma)
  values
    ('afromerica', v_ev, 'AFRO-MERICA',
     'auto', 100,
     timestamptz '2026-11-28 01:00:00 Europe/Rome',
     timestamptz '2026-11-28 01:00:00 Europe/Rome',
     16,
     'OMAGGIO DONNA',
     false,
     E'Hi {nome}! 🔥 You''re on the list: LADIES FREE at AFRO-MERICA, Friday 27 November at PAPI-ON.\nYour QR: {link}\nGet it scanned at the box office before 1 AM and bring your real ID.\n\nCiao {nome}! Sei in lista: ingresso omaggio ad AFRO-MERICA venerdì 27 novembre al PAPI-ON. Fai scansionare il QR in cassa entro l''1 e porta il documento vero. See you Friday!');
end $$;


-- ============================================================
-- Controllo. Deve uscire una riga: afromerica · la serata del 27 al
-- PAPI-ON · prenotazioni e QR fino al 28/11 01:00 · auto · 100 posti.
-- ============================================================
select l.slug as "pagina",
       e.name as "serata",
       v.name as "locale",
       e.published as "pubblicata sull'1%",
       to_char(l.chiude_at at time zone 'Europe/Rome', 'DD/MM HH24:MI') as "prenotazioni fino a",
       to_char(l.valido_fino at time zone 'Europe/Rome', 'DD/MM HH24:MI') as "QR valido fino a",
       l.modo as "approvazione",
       coalesce(l.posti::text, 'da decidere') as "posti",
       (select count(*) from public.pr_serate s where s.event_id = l.event_id) as "PR agganciati (vendono lo stesso)"
  from public.omaggio_liste l
  join public.events e on e.id = l.event_id
  left join public.venues v on v.id = e.venue_id
 where l.slug = 'afromerica';
