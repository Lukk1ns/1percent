-- ============================================================
-- 53 — MALDITA sabato 7 novembre: lo shot omaggio
--
-- Chiesto da Luka il 3 novembre 2026: *"servirebbe il link nuovo per
-- shottini di questo sabato con iscrizione solita"*.
--
-- Stessa macchina di BACK TO 2010 (51), lista nuova:
--   · ci si registra su unpercento.it/maldita7 (nome, cognome, anno,
--     WhatsApp): per tutti, ragazzi e ragazze, dai 18 anni;
--   · il QR si fa scansionare direttamente al bar entro le 00:30 (l'ora
--     della locandina): la scansione del barista è lo shot. Dopo le
--     00:30 lo scanner dice SCADUTO;
--   · approvazione come BACK TO 2010: a mano, posti da decidere. Si
--     cambia dal pannello /admin/maldita7.
--
-- Una differenza dal 51: sabato i ragazzi pagano, quindi i PR devono
-- poter vendere. La regola del 43 staccava dai PR OGNI serata con una
-- lista omaggio; ora la stacca solo una lista che regala l'ingresso
-- (OMAGGIO DONNA). Una lista SHOT OMAGGIO lascia la serata ai PR.
--
-- Da incollare dopo il 42 e il 43. Si può rieseguire: se la lista
-- c'è già non la tocca (le scelte fatte dal pannello restano).
-- ============================================================

do $$
begin
  if to_regclass('public.omaggio_liste') is null then
    raise exception 'Manca lo script 42: incolla prima il 42 e il 43, poi questo.';
  end if;
end $$;


-- ------------------------------------------------------------
-- 1 · Copiata dal 43: la lista shot non stacca la serata dai PR
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
                        and ol.tier_label is distinct from 'SHOT OMAGGIO')
     and (
          exists (select 1 from public.pr_serate s
                   where s.pr_id = p_pr and s.event_id = p_event)
       or exists (select 1 from public.account_managers m
                   where m.profile_id = p_pr and m.attivo)
     );
$$;

revoke execute on function public._pr_agganciato(uuid, uuid) from public, anon, authenticated;


-- ------------------------------------------------------------
-- 2 · La serata di sabato 7 e la sua lista
--
-- Se c'è già una serata del PAPI-ON il 7, si usa quella: in porta la
-- notte deve essere una sola. Il PR1ME il sabato lavora anche lui,
-- per questo si guarda il locale e non solo il giorno. Altrimenti si
-- crea, NON pubblicata, come MALDITA del 17.
-- ------------------------------------------------------------
do $$
declare
  v_ev    uuid;
  v_venue uuid;
begin
  if exists (select 1 from public.omaggio_liste where slug = 'maldita7') then
    return;
  end if;

  select v.id into v_venue
    from public.venues v
   where upper(regexp_replace(v.name, '[^A-Za-z]', '', 'g')) = 'PAPION'
   limit 1;

  select e.id into v_ev
    from public.events e
   where (e.starts_at at time zone 'Europe/Rome')::date = date '2026-11-07'
     and e.venue_id = v_venue
   order by e.starts_at
   limit 1;

  if v_ev is null then
    insert into public.events (venue_id, name, slug, starts_at, descrizione, published)
    values (v_venue,
            'MALDITA · DEMBOW DANCEHALL REGGAETON',
            'maldita-7-novembre',
            timestamptz '2026-11-07 23:00:00 Europe/Rome',
            'Deejlord · DJ Gringo · DJ El Menor · free entry donna entro le 00:30',
            false)
    on conflict (slug) do nothing
    returning id into v_ev;

    if v_ev is null then
      select e.id into v_ev from public.events e
       where e.slug = 'maldita-7-novembre';
    end if;
  end if;

  -- Iscrizioni aperte fino all'ultimo, come il QR (lezione del 48).
  insert into public.omaggio_liste
    (slug, event_id, titolo, chiude_at, valido_fino, eta_min, tier_label,
     sorpresa_on, sorpresa_testo, msg_conferma, msg_sorpresa)
  values
    ('maldita7', v_ev, 'MALDITA',
     timestamptz '2026-11-08 00:30:00 Europe/Rome',
     timestamptz '2026-11-08 00:30:00 Europe/Rome',
     18,
     'SHOT OMAGGIO',
     true,
     'Vai dritto al bar entro le 00:30 e fai scansionare il QR al barista: lo shot te lo offriamo noi. Uno a testa.',
     E'Ciao {nome}! 🥃 Ci sei per MALDITA, sabato 7 novembre al PAPI-ON.\n\nIl tuo QR è qui: {link}\n\nVai dritto al bar entro le 00:30 e fallo scansionare al barista: lo shot è offerto. Porta il documento vero, in mano. Ci vediamo sabato!',
     E'Ciao {nome}! 🥃 Sabato a MALDITA ti aspetta uno shot offerto.\n\nVai dritto al bar entro le 00:30 e fai scansionare il tuo QR: lo shot è tuo.\n\nIl tuo QR è qui: {link}');
end $$;


-- ============================================================
-- Controllo. Deve uscire una riga: maldita7 · la serata del 7 al
-- PAPI-ON · iscrizioni e QR fino all'08/11 00:30 · approvazione mano.
-- I PR agganciati possono essere più di zero: con lo shot vendono lo
-- stesso (punto 1).
-- ============================================================
select l.slug as "pagina",
       e.name as "serata",
       v.name as "locale",
       e.published as "pubblicata sull'1%",
       to_char(l.chiude_at at time zone 'Europe/Rome', 'DD/MM HH24:MI') as "iscrizioni fino a",
       to_char(l.valido_fino at time zone 'Europe/Rome', 'DD/MM HH24:MI') as "QR valido fino a",
       l.eta_min as "età minima",
       l.modo as "approvazione",
       coalesce(l.posti::text, 'da decidere') as "posti",
       (select count(*) from public.pr_serate s where s.event_id = l.event_id) as "PR agganciati (vendono lo stesso)"
  from public.omaggio_liste l
  join public.events e on e.id = l.event_id
  left join public.venues v on v.id = e.venue_id
 where l.slug = 'maldita7';
