-- ============================================================
-- 51 — BACK TO 2010: lo shot omaggio di venerdì 30 ottobre
--
-- Chiesto da Luka il 27 ottobre 2026: *"una registrazione online con
-- la quale hanno uno shottino in omaggio se entrano fino all'1...
-- come avevamo fatto con gli omaggi l'altra volta, stessa modalità,
-- mi serve un link nuovo"*.
--
-- È la stessa macchina di MALDITA (42), con una lista nuova:
--   · ci si registra su unpercento.it/backto2010 (nome, cognome, anno,
--     WhatsApp): per tutti, ragazzi e ragazze, dai 18 anni;
--   · l'ingresso fino all'1 è gratis per tutti comunque: il QR serve a
--     dire "è entrato entro l'1". Dopo l'1 la porta dice SCADUTO;
--   · chi è entrato col QR, al bar fa vedere la sua pagina e il
--     barista conferma lo shot (uno a testa, `omaggio_shot` del 42);
--   · approvazione come MALDITA: a mano, posti da decidere. Si cambia
--     dal pannello /admin/backto2010 (automatica appena scrive i posti).
--
-- Nessuna funzione nuova: solo la serata e la riga della lista.
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
-- La serata di venerdì 30 e la sua lista
--
-- Se una serata del 30 c'è già, si usa quella: in porta la notte
-- deve essere una sola. Se si chiamava ancora CUBAN FLOW prende il
-- nome nuovo. Altrimenti si crea, NON pubblicata, come MALDITA.
-- ------------------------------------------------------------
do $$
declare
  v_ev    uuid;
  v_venue uuid;
begin
  if exists (select 1 from public.omaggio_liste where slug = 'backto2010') then
    return;
  end if;

  select e.id into v_ev
    from public.events e
   where (e.starts_at at time zone 'Europe/Rome')::date = date '2026-10-30'
   order by e.starts_at
   limit 1;

  if v_ev is not null then
    update public.events e
       set name = 'BACK TO 2010 · REGGAETON & HIP HOP'
     where e.id = v_ev and e.name ilike '%cuban%';
  else
    select v.id into v_venue
      from public.venues v
     where upper(regexp_replace(v.name, '[^A-Za-z]', '', 'g')) = 'PAPION'
     limit 1;

    insert into public.events (venue_id, name, slug, starts_at, descrizione, published)
    values (v_venue,
            'BACK TO 2010 · REGGAETON & HIP HOP',
            'back-to-2010-30-ottobre',
            timestamptz '2026-10-30 23:00:00 Europe/Rome',
            'Deejlord · Darian · ingresso gratis per tutti fino all''1',
            false)
    on conflict (slug) do nothing
    returning id into v_ev;

    if v_ev is null then
      select e.id into v_ev from public.events e
       where e.slug = 'back-to-2010-30-ottobre';
    end if;
  end if;

  -- Le iscrizioni restano aperte fino all'1, come il QR: con MALDITA
  -- Luka le ha volute aperte fino all'ultimo (script 48).
  insert into public.omaggio_liste
    (slug, event_id, titolo, chiude_at, valido_fino, eta_min, tier_label,
     sorpresa_on, sorpresa_testo, msg_conferma, msg_sorpresa)
  values
    ('backto2010', v_ev, 'BACK TO 2010',
     timestamptz '2026-10-31 01:00:00 Europe/Rome',
     timestamptz '2026-10-31 01:00:00 Europe/Rome',
     18,
     'SHOT OMAGGIO',
     true,
     'Entra entro l''1 e fai scansionare il QR in cassa. Dentro, al bar, fai vedere questa pagina: lo shot te lo offriamo noi. Uno a testa.',
     E'Ciao {nome}! 🥃 Ci sei per BACK TO 2010, venerdì 30 ottobre al PAPI-ON.\n\nIl tuo QR è qui: {link}\n\nEntra entro l''1 e fallo scansionare in cassa: dentro, al bar, hai uno shot offerto. Porta il documento vero, in mano. Ci vediamo venerdì!',
     E'Ciao {nome}! 🥃 Venerdì a BACK TO 2010 ti aspetta uno shot offerto.\n\nIngresso gratis per tutti fino all''1: se entri entro l''1 facendo scansionare il tuo QR, al bar lo shot è tuo.\n\nIl tuo QR è qui: {link}');
end $$;


-- ============================================================
-- Controllo. Deve uscire una riga: backto2010 · la serata del 30 ·
-- iscrizioni e QR fino al 31/10 01:00 · approvazione mano.
-- L'ultima colonna dice quanti PR erano agganciati alla serata: con
-- una lista omaggio non la vedono più (regola del 43). Deve essere 0.
-- ============================================================
select l.slug as "pagina",
       e.name as "serata",
       e.published as "pubblicata sull'1% (deve essere false)",
       to_char(l.chiude_at at time zone 'Europe/Rome', 'DD/MM HH24:MI') as "iscrizioni fino a",
       to_char(l.valido_fino at time zone 'Europe/Rome', 'DD/MM HH24:MI') as "QR valido fino a",
       l.eta_min as "età minima",
       l.modo as "approvazione",
       coalesce(l.posti::text, 'da decidere') as "posti",
       (select count(*) from public.pr_serate s where s.event_id = l.event_id) as "PR agganciati (deve essere 0)"
  from public.omaggio_liste l
  join public.events e on e.id = l.event_id
 where l.slug = 'backto2010';
