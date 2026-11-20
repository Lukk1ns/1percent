-- ============================================================
-- 63 — CHI SI È FATTO RIMBORSARE, SE RICOMPRA PAGA 20 €
--
-- Luka, 20 novembre 2026: una PR ha restituito i soldi a tutti i suoi
-- clienti ed è uscita dai PR. *"Quando ricapita un nome di queste persone
-- bisogna avvisarli che pagano 20 al posto di 15, perché non ha senso
-- farsi rimborsare per poi ricomprare"*.
--
--   1. La LISTA dei rimborsati (`prevendite_rimborsate`): nome, cognome,
--      serata e il prezzo minimo che pagano adesso (20 €).
--
--   2. Il BLOCCO: un controllo sulla tabella dei biglietti, come quelli
--      del 41 e del 45 (nessuna funzione esistente riscritta). Se qualcuno
--      — PR, manager o Luka — prova a fare un biglietto per la stessa
--      serata a uno di quei nomi a meno del minimo, si ferma con
--      `rimborsato:20` e il sito spiega perché.
--      · il nome si confronta senza maiuscole, spazi doppi, accenti e
--        apostrofi, anche girato ("Rossi Mario" = "Mario Rossi");
--      · una PRENOTAZIONE "paga N € in cassa" vale N: dal minimo in su passa;
--      · un OMAGGIO (zero euro) passa: è una scelta di Luka.
--
-- La parte che annulla i biglietti di quella PR, la toglie dai PR e
-- riempie la lista contiene nomi di persone: sta in supabase/privati/
-- (fuori da git, il repository è pubblico). Quello incollato da Luka è
-- il file intero, che comprende anche questo.
--
-- Da incollare nel SQL Editor. Si può rieseguire.
-- ============================================================
-- ------------------------------------------------------------
-- 1 · La lista
-- ------------------------------------------------------------
create table if not exists public.prevendite_rimborsate (
  presale_id    uuid primary key references public.presales (id) on delete cascade,
  event_id      uuid not null references public.events (id) on delete cascade,
  nome          text not null,
  cognome       text not null,
  anno_nascita  int,
  telefono      text,
  pr_id         uuid references public.profiles (id) on delete set null on update cascade,
  prezzo_era    numeric(10,2),
  prezzo_minimo int not null default 20 check (prezzo_minimo between 1 and 500),
  nota          text,
  created_at    timestamptz not null default now(),
  created_by    text
);

-- Nessuna policy: dal sito non la legge nessuno, la usa solo il controllo.
alter table public.prevendite_rimborsate enable row level security;

create index if not exists prevendite_rimborsate_event_idx
  on public.prevendite_rimborsate (event_id);


-- Il nome "pulito" per il confronto: minuscole, spazi singoli, niente
-- accenti né apostrofi.
create or replace function public._nome_pulito(p text)
returns text
language sql
immutable
set search_path = public
as $$
  select lower(regexp_replace(
           translate(trim(coalesce(p, '')),
                     'ÀÁÈÉÌÍÒÓÙÚàáèéìíòóùú''’',
                     'AAEEIIOOUUaaeeiioouu'),
           '\s+', ' ', 'g'));
$$;

revoke execute on function public._nome_pulito(text) from public, anon, authenticated;


-- ------------------------------------------------------------
-- 2 · Il blocco
-- ------------------------------------------------------------
create or replace function public._presales_rimborsati()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_paga   numeric;
  v_minimo int;
  v_n      text := public._nome_pulito(new.nome);
  v_c      text := public._nome_pulito(new.cognome);
begin
  if coalesce(new.prezzo, 0) > 0 then
    v_paga := new.prezzo;
  else
    -- A zero euro: prenotazione "paga N € in cassa" (vale N) o omaggio (passa).
    v_paga := substring(new.tier_label from '^PRENOTAZIONE · ([0-9]+) € IN CASSA$')::numeric;
    if v_paga is null then
      return new;
    end if;
  end if;

  select max(r.prezzo_minimo) into v_minimo
    from public.prevendite_rimborsate r
   where r.event_id = new.event_id
     and (   (public._nome_pulito(r.nome) = v_n and public._nome_pulito(r.cognome) = v_c)
          or (public._nome_pulito(r.nome) = v_c and public._nome_pulito(r.cognome) = v_n));

  if v_minimo is not null and v_paga < v_minimo then
    raise exception 'rimborsato:%', v_minimo;
  end if;

  return new;
end;
$$;

revoke execute on function public._presales_rimborsati() from public, anon, authenticated;

drop trigger if exists presales_rimborsati on public.presales;
create trigger presales_rimborsati
  before insert on public.presales
  for each row execute function public._presales_rimborsati();


