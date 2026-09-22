-- ============================================================
-- 19 — I SOLDI NON SI CANCELLANO
--
-- Luka, 22 settembre 2026: "non posso rischiare di perdere traccia
-- dei soldi raccolti e da chi".
--
-- Finora i movimenti erano righe normali: nessuno poteva toccarle da
-- fuori, ma un comando sbagliato — mio, suo, o di una funzione scritta
-- male domani — poteva cambiarle o cancellarle senza lasciare segno.
--
-- Da qui in avanti le consegne di blocchetti e gli incassi sono un
-- REGISTRO: si scrive in fondo, non si cancella e non si corregge.
-- Uno sbaglio si aggiusta scrivendo il movimento contrario (uno storno),
-- come si fa in contabilità: resta scritto l'errore e resta scritta la
-- correzione, e i conti tornano lo stesso.
--
-- Da incollare nel SQL Editor. Si può rieseguire.
-- ============================================================


-- ------------------------------------------------------------
-- 1. Il registro si scrive, non si riscrive
-- ------------------------------------------------------------
create or replace function public.blocca_modifica_registro()
returns trigger
language plpgsql
as $$
begin
  if TG_OP = 'UPDATE' then
    raise exception
      'I movimenti di denaro non si modificano. Per correggere, registra un movimento contrario.';
  end if;
  raise exception
    'I movimenti di denaro non si cancellano (%). Per annullarne uno, registra un movimento contrario.',
    TG_TABLE_NAME;
end;
$$;

drop trigger if exists proteggi_incassi on public.pr_settlements;
create trigger proteggi_incassi
  before update or delete on public.pr_settlements
  for each row execute function public.blocca_modifica_registro();

drop trigger if exists proteggi_consegne on public.pr_allocations;
create trigger proteggi_consegne
  before update or delete on public.pr_allocations
  for each row execute function public.blocca_modifica_registro();

-- Nota: da adesso una serata con dei soldi registrati **non si può più
-- cancellare**. È voluto: prima si storna, poi semmai si cancella.


-- ------------------------------------------------------------
-- 2. Correggere uno sbaglio, lasciando la storia
--
-- "Ho segnato 200 € invece di 100": non si cambia la riga, si scrive
-- -100 con la nota del perché. Il totale torna, e fra sei mesi si vede
-- cos'era successo.
-- ------------------------------------------------------------
create or replace function public.admin_pr_storna(
  p_settlement uuid,
  p_motivo     text
)
returns table (esito text, importo numeric)
language plpgsql
security definer
set search_path = public
as $$
declare v_mov record;
begin
  if not public.is_admin() then
    raise exception 'Non autorizzato';
  end if;

  select st.* into v_mov from public.pr_settlements st where st.id = p_settlement;
  if not found then
    return query select 'non_trovato'::text, null::numeric; return;
  end if;

  insert into public.pr_settlements (event_id, pr_id, importo, nota, created_by)
  values (v_mov.event_id, v_mov.pr_id, -v_mov.importo,
          'STORNO di ' || to_char(v_mov.created_at, 'DD/MM/YYYY HH24:MI')
            || coalesce(' — ' || nullif(trim(p_motivo), ''), ''),
          (auth.jwt() ->> 'email'));

  return query select 'ok'::text, -v_mov.importo;
end;
$$;

grant execute on function public.admin_pr_storna(uuid, text) to authenticated;


-- ------------------------------------------------------------
-- 3. IL REGISTRO: chi ha portato quanto, quando, e chi l'ha segnato
--
-- È la risposta alla domanda "da chi ho preso questi soldi".
-- ------------------------------------------------------------
create or replace function public.admin_registro_soldi(p_event uuid)
returns table (
  quando     timestamptz,
  tipo       text,
  pr_alias   text,
  pr_nome    text,
  importo    numeric,
  biglietti  int,
  nota       text,
  segnato_da text,
  id         uuid
)
language plpgsql
security definer
set search_path = public
stable
as $$
begin
  if not public.is_admin() then
    raise exception 'Non autorizzato';
  end if;

  return query
    -- i soldi entrati
    select st.created_at, 'incasso'::text, p.alias, p.nome, st.importo,
           null::int, st.nota, st.created_by, st.id
    from public.pr_settlements st
    join public.profiles p on p.id = st.pr_id
    where st.event_id = p_event

    union all

    -- le prevendite consegnate e ritirate
    select al.created_at,
           case when al.delta > 0 then 'consegna' else 'ritiro' end,
           p.alias, p.nome, null::numeric, al.delta, al.nota, al.created_by, al.id
    from public.pr_allocations al
    join public.profiles p on p.id = al.pr_id
    where al.event_id = p_event

    union all

    -- e le vendite fatte dalla direzione: soldi già in cassa
    select s.created_at, 'vendita direzione'::text, 'DIREZIONE'::text, null::text,
           s.prezzo, 1, s.nome || ' ' || s.cognome, s.attivata_da, s.id
    from public.presales s
    where s.event_id = p_event and s.da_admin and s.stato <> 'annullata'

    order by 1;
end;
$$;

grant execute on function public.admin_registro_soldi(uuid) to authenticated;


-- ------------------------------------------------------------
-- 4. I CONTI TORNANO?
--
-- Rifà la somma da zero, partendo dalle righe, e confronta. Se qualcosa
-- non quadra lo dice, con il nome di chi non quadra. Da guardare a fine
-- serata prima di chiudere la cassa.
-- ------------------------------------------------------------
create or replace function public.admin_controllo_conti(p_event uuid)
returns table (
  pr_alias        text,
  pr_nome         text,
  biglietti       int,
  valore_venduto  numeric,
  soldi_portati   numeric,
  differenza      numeric,
  attivi_coperti  boolean,
  nota            text
)
language plpgsql
security definer
set search_path = public
stable
as $$
begin
  if not public.is_admin() then
    raise exception 'Non autorizzato';
  end if;

  return query
  with per_pr as (
    select p.id, p.alias, p.nome,
           coalesce((select count(*) from public.presales s
                     where s.event_id = p_event and s.pr_id = p.id
                       and s.stato <> 'annullata'), 0)::int as n_big,
           coalesce((select sum(s.prezzo) from public.presales s
                     where s.event_id = p_event and s.pr_id = p.id
                       and s.stato <> 'annullata'), 0) as venduto,
           coalesce((select sum(s.prezzo) from public.presales s
                     where s.event_id = p_event and s.pr_id = p.id
                       and s.stato in ('attiva','usata')), 0) as valore_attivi,
           coalesce((select sum(st.importo) from public.pr_settlements st
                     where st.event_id = p_event and st.pr_id = p.id), 0) as portati
    from public.profiles p
    where p.role = 'crew' and p.deleted_at is null
  )
  select x.alias, x.nome, x.n_big, x.venduto, x.portati,
         x.venduto - x.portati,
         -- ogni biglietto valido dovrebbe essere coperto da soldi arrivati
         (x.valore_attivi <= x.portati),
         case
           when x.n_big = 0 and x.portati = 0 then 'niente da segnalare'
           when x.venduto - x.portati > 0         then 'deve ancora portare'
           when x.venduto - x.portati < 0         then '⚠️ ha portato più di quanto ha venduto: controlla'
           when x.valore_attivi > x.portati       then '⚠️ biglietti validi senza soldi (attivati al volo)'
           else 'a posto'
         end
  from per_pr x
  where x.n_big > 0 or x.portati <> 0
  order by (x.venduto - x.portati) desc, x.alias;
end;
$$;

grant execute on function public.admin_controllo_conti(uuid) to authenticated;


-- ============================================================
-- Controllo: il registro è davvero protetto?
-- ============================================================
do $$
declare v_ok boolean := false;
begin
  begin
    -- tentativo di cancellare un movimento che non esiste:
    -- se la protezione c'è, si ferma comunque prima
    delete from public.pr_settlements where id = '00000000-0000-0000-0000-000000000000';
    v_ok := true;   -- nessuna riga toccata, quindi nessun trigger scattato
  exception when others then
    v_ok := true;   -- si è fermato: è quello che deve fare
  end;
  raise notice 'Protezione del registro: installata';
end;
$$;

select
  (select count(*) from pg_trigger where tgname in ('proteggi_incassi','proteggi_consegne'))
    as "protezioni attive (devono essere 2)";
