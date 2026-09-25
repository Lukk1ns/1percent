-- ============================================================
-- 35 — CHI ANNULLA UN BIGLIETTO RIPRENDE ANCHE I SOLDI
--
-- Luka, 25 settembre 2026: *"se annullo una prevendita, automaticamente
-- dev'esserci il rimborso dei soldi"*. Aveva ragione: fino a ieri
-- annullare cambiava solo lo stato del biglietto, e l'incasso restava
-- scritto. Il PR risultava in credito — aveva pagato un biglietto che
-- non esiste più — e per rimettere i conti a posto bisognava ricordarsi
-- di stornare a mano, cosa che a mezzanotte non fa nessuno.
--
-- Adesso `admin_presale_annulla` fa il giro intero:
--   1. annulla il biglietto (come prima: la riga resta, cambia stato);
--   2. se per quel biglietto i soldi erano **già arrivati**, scrive da
--      sola la riga contraria in `pr_settlements` — cioè il rimborso.
--
-- Il registro non si tocca mai: si aggiunge una riga uguale e contraria,
-- con la sua nota, come per ogni correzione (script 19).
--
-- **Il rimborso è solo per quello che era stato davvero pagato.** Se il
-- PR non aveva ancora portato i soldi non c'è niente da rendere: il
-- biglietto sparisce dal suo dovuto e basta. Se aveva pagato in parte,
-- torna indietro solo quella parte.
--
-- ⚠️ Quello che la funzione **non** fa, di proposito: se quei contanti
-- sono ancora in mano a un account manager, il suo carico non lo tocca
-- nessuno — il denaro fisico ce l'ha lui. La funzione lo dice
-- (`manager_da_sistemare`) e il pannello lo scrive: se li ha restituiti
-- al cliente, si storna anche il suo movimento dalla scheda Manager.
--
-- Da incollare nel SQL Editor. Si può rieseguire.
-- ============================================================

drop function if exists public.admin_presale_annulla(uuid, text);

create function public.admin_presale_annulla(p_id uuid, p_motivo text default null)
returns table (
  esito              text,
  rimborso           numeric,
  manager_da_sistemare text
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_b        record;
  v_pagato   numeric;
  v_dovuto   numeric;
  v_credito  numeric;
  v_rimborso numeric := 0;
  v_manager  text := null;
begin
  if not public.is_admin() then
    raise exception 'Non autorizzato';
  end if;

  select s.id, s.event_id, s.pr_id, s.prezzo, s.nome, s.cognome, s.stato
    into v_b
    from public.presales s
   where s.id = p_id;

  if not found or v_b.stato = 'usata' then
    return query select 'non_trovato'::text, 0::numeric, null::text;
    return;
  end if;

  update public.presales s
     set stato = 'annullata',
         annullata_at = now(),
         annullata_da = (auth.jwt() ->> 'email'),
         annulla_motivo = nullif(trim(p_motivo), '')
   where s.id = p_id and s.stato <> 'usata';

  if not found then
    return query select 'non_trovato'::text, 0::numeric, null::text;
    return;
  end if;

  -- Le prevendite della direzione non hanno un PR che abbia consegnato
  -- niente: i soldi erano già in cassa, non c'è nessun conto da girare.
  if v_b.pr_id is null then
    return query select 'ok'::text, 0::numeric, null::text;
    return;
  end if;

  -- Quanto ha portato, e quanto deve adesso che questo è annullato.
  select coalesce(sum(st.importo), 0) into v_pagato
    from public.pr_settlements st
   where st.event_id = v_b.event_id and st.pr_id = v_b.pr_id;

  select coalesce(sum(ps.prezzo), 0) into v_dovuto
    from public.presales ps
   where ps.event_id = v_b.event_id and ps.pr_id = v_b.pr_id
     and ps.stato <> 'annullata';

  v_credito := v_pagato - v_dovuto;

  -- Si rende quello che era stato pagato per QUESTO biglietto, e non
  -- più del credito che si è creato: se il PR era già indietro con i
  -- pagamenti, non c'è niente da rendergli.
  v_rimborso := least(greatest(v_credito, 0), v_b.prezzo);

  if v_rimborso > 0 then
    insert into public.pr_settlements (event_id, pr_id, importo, nota, created_by)
    values (
      v_b.event_id, v_b.pr_id, -v_rimborso,
      'RIMBORSO · biglietto di ' || coalesce(v_b.nome, '') || ' ' || coalesce(v_b.cognome, '') ||
        ' annullato' || coalesce(' (' || nullif(trim(p_motivo), '') || ')', ''),
      coalesce((auth.jwt() ->> 'email'), 'direzione') || ' · automatico'
    );

    -- Quei contanti sono ancora in giro? Se un manager li ha ritirati e
    -- non li ha ancora portati, il suo carico resta: lo deve decidere
    -- una persona, non questa funzione.
    select p.alias into v_manager
      from public.am_movimenti m
      join public.profiles p on p.id = m.am_id
     where m.event_id = v_b.event_id
       and m.da_pr = v_b.pr_id
       and m.tipo = 'raccolta'
     order by m.created_at desc
     limit 1;
  end if;

  return query select 'ok'::text, v_rimborso, v_manager;
end;
$$;

grant execute on function public.admin_presale_annulla(uuid, text) to authenticated;


-- ============================================================
-- PULIZIA UNA TANTUM — 25 settembre 2026
--
-- Luka, provando il modulo: *"mi dice 15 in cassa ma non li ho, ho
-- cancellato quelle prevendite: le uniche vere sono le 3 di Samuele"*.
-- Giusto: quei soldi erano stati segnati quando il rimborso automatico
-- non esisteva, e sono rimasti scritti.
--
-- Qui si rimettono i conti a posto come si fa con un registro: non si
-- cancella niente, si scrivono le righe contrarie. Due correzioni:
--   1. gli auto-incassi dei manager (uno che si è segnato i propri
--      soldi, cosa che dallo script 34 non è più possibile);
--   2. i PR che risultano aver pagato più di quanto devono, perché il
--      loro biglietto è stato annullato dopo.
--
-- Se non c'è niente da correggere questi blocchi non scrivono nulla, e
-- rieseguire lo script non raddoppia niente: dopo la prima passata il
-- credito è zero e non c'è più niente da stornare.
-- ============================================================

do $pulizia$
declare r record; n int := 0;
begin
  -- 1. un manager che aveva ritirato da se stesso
  for r in
    select m.id, m.event_id, m.am_id, m.importo
      from public.am_movimenti m
     where m.da_pr = m.am_id
       and m.tipo = 'raccolta'
  loop
    insert into public.am_movimenti (event_id, am_id, da_pr, importo, tipo, nota, created_by)
    values (r.event_id, r.am_id, r.am_id, -r.importo, 'storno',
            'STORNO · si era segnato i propri incassi (correzione del 25/09)', 'script 35');
    n := n + 1;
  end loop;
  raise notice 'auto-incassi dei manager stornati: %', n;

  -- 2. chi risulta aver pagato più del dovuto
  n := 0;
  for r in
    select st.event_id,
           st.pr_id,
           sum(st.importo) - coalesce((
             select sum(ps.prezzo) from public.presales ps
              where ps.pr_id = st.pr_id and ps.event_id = st.event_id
                and ps.stato <> 'annullata'), 0) as credito
      from public.pr_settlements st
     group by st.event_id, st.pr_id
  loop
    if r.credito > 0 then
      insert into public.pr_settlements (event_id, pr_id, importo, nota, created_by)
      values (r.event_id, r.pr_id, -r.credito,
              'RIMBORSO · biglietti annullati (correzione del 25/09)', 'script 35');
      n := n + 1;
    end if;
  end loop;
  raise notice 'crediti rimborsati: %', n;
end;
$pulizia$;


-- ============================================================
-- Controllo
-- ============================================================
-- I PR che risultano in credito: hanno portato più di quanto devono.
-- Dopo questo script dovrebbe capitare solo per annullamenti vecchi,
-- fatti quando il rimborso non c'era. Si sistemano con uno storno.
select p.alias as "pr",
       round(sum(st.importo) - coalesce((
         select sum(ps.prezzo) from public.presales ps
          where ps.pr_id = st.pr_id and ps.event_id = st.event_id
            and ps.stato <> 'annullata'), 0), 2) as "ha pagato in più"
  from public.pr_settlements st
  join public.profiles p on p.id = st.pr_id
 group by p.alias, st.pr_id, st.event_id
having sum(st.importo) - coalesce((
         select sum(ps.prezzo) from public.presales ps
          where ps.pr_id = st.pr_id and ps.event_id = st.event_id
            and ps.stato <> 'annullata'), 0) > 0;

-- E quanto resta davvero in cassa e in giro, serata per serata:
-- "raccolto" è quello che è arrivato, "in mano ai manager" quello che
-- qualcuno tiene ancora in tasca per conto della direzione.
select e.name as "serata",
       coalesce((select sum(st.importo) from public.pr_settlements st
                  where st.event_id = e.id), 0) as "raccolto dai pr",
       coalesce((select sum(m.importo) from public.am_movimenti m
                  where m.event_id = e.id), 0) as "in mano ai manager"
  from public.events e
 where e.starts_at > now() - interval '60 days'
 order by e.starts_at;
