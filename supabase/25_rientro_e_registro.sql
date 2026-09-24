-- ============================================================
-- 25 — IL REGISTRO RESTA CHIUSO, MA CHI RIENTRA PASSA
--
-- 24 settembre 2026, seguito di 24_rientro.sql. Leonardo (alias `ceo`,
-- crew approvata, 5 biglietti in mano) continuava a sentirsi dire "non
-- ti abbiamo riconosciuto" pur usando l'indirizzo giusto, con il
-- profilo vivo e non cancellato.
--
-- I muri erano due, in fila:
--   1. le chiavi verso profiles non seguivano il cambio di id → 24
--   2. e qui il secondo: `proteggi_consegne` e `proteggi_incassi`
--      (19_soldi_al_sicuro) rifiutano OGNI update su pr_allocations e
--      pr_settlements. Quando il rientro cambia l'id del profilo, la
--      cascata tocca quelle righe per aggiornare `pr_id` — e il
--      trigger la ferma. Risultato: chi ha biglietti o soldi a suo
--      nome non rientra MAI, e più uno lavora peggio sta.
--
-- COSA CAMBIA, ESATTAMENTE. Il registro resta quello che era: gli
-- importi non si toccano, le righe non si cancellano, le correzioni si
-- fanno con un movimento contrario. Passa una cosa sola: la riga in
-- cui **tutto** è rimasto identico — serata, importo, nota, data, chi
-- l'ha segnata — e cambia solo il riferimento alla persona. Non è una
-- modifica della contabilità: è la stessa persona che rientra da un
-- telefono nuovo. Qualunque altra modifica viene respinta come prima.
--
-- Da incollare nel SQL Editor. Si può rieseguire.
-- ============================================================

create or replace function public.blocca_modifica_registro()
returns trigger
language plpgsql
as $$
begin
  if TG_OP = 'UPDATE' then
    -- Il confronto è su tutta la riga tranne `pr_id`: se il resto
    -- combacia carattere per carattere, l'unica cosa successa è che
    -- quella persona ha cambiato accesso.
    if new.pr_id is distinct from old.pr_id
       and (to_jsonb(new) - 'pr_id') = (to_jsonb(old) - 'pr_id') then
      return new;
    end if;

    raise exception
      'I movimenti di denaro non si modificano. Per correggere, registra un movimento contrario.';
  end if;

  raise exception
    'I movimenti di denaro non si cancellano (%). Per annullarne uno, registra un movimento contrario.',
    TG_TABLE_NAME;
end;
$$;

-- I trigger restano appesi dov'erano: cambia solo cosa fanno.
drop trigger if exists proteggi_incassi on public.pr_settlements;
create trigger proteggi_incassi
  before update or delete on public.pr_settlements
  for each row execute function public.blocca_modifica_registro();

drop trigger if exists proteggi_consegne on public.pr_allocations;
create trigger proteggi_consegne
  before update or delete on public.pr_allocations
  for each row execute function public.blocca_modifica_registro();


-- ============================================================
-- Controllo
-- ============================================================
-- Il registro deve restare chiuso: questa prova tenta di cambiare un
-- importo davvero e si aspetta di essere respinta. Non lascia traccia
-- (fa e disfa dentro la stessa transazione).
do $$
declare v_id uuid; v_bloccato boolean := false;
begin
  select id into v_id from public.pr_allocations limit 1;
  if v_id is null then
    raise notice 'nessun movimento da provare: salto';
    return;
  end if;

  begin
    update public.pr_allocations set delta = delta + 1 where id = v_id;
  exception when others then
    v_bloccato := true;
  end;

  if v_bloccato then
    raise notice 'OK: cambiare un importo è ancora vietato';
  else
    raise warning 'ATTENZIONE: il registro si lascia modificare, controllare il trigger';
    raise exception 'annullo la prova';   -- non deve restare niente
  end if;
end $$;

-- E le due guardie devono essere ancora al loro posto: deve dire 2.
select count(*) as "guardie sul registro (deve essere 2)"
  from pg_trigger
 where tgname in ('proteggi_incassi', 'proteggi_consegne');
