-- ============================================================
-- 64 — PERSONE SEGNATE: PAGANO N € IN PIÙ, SU TUTTE LE SERATE
--
-- Luka, 20 novembre 2026, subito dopo il 63: un'ex PR va segnata,
-- *"se qualcuno prova a venderle una prevendita deve venire fuori
-- 5 euro in più"*. Diverso dai rimborsati del 63:
--   · il 63 vale per UNA serata e ha un prezzo fisso (20 €);
--   · qui vale per TUTTE le serate (o per una sola, se si sceglie) ed
--     è un SOVRAPPREZZO sul prezzo della fascia (15 → 20, 25 → 30).
--
-- 1. Tabella `persone_sovrapprezzo` (nome, cognome, serata o tutte,
--    sovrapprezzo, motivo, attivo). Nessuna policy: la legge solo il
--    controllo. Le persone si aggiungono dal SQL Editor (i nomi stanno
--    in supabase/privati/: il repository è pubblico).
--
-- 2. Il controllo `_presales_rimborsati()` (63) si rifà e guarda anche
--    questa lista. Ultima definizione = questa. Regole:
--    · prezzo di riferimento = la fascia del biglietto; se il biglietto
--      non ha fascia (prenotazione "paga in cassa", vendita segnata da
--      Luka) = la fascia più economica, visibile, della serata;
--    · paga meno di riferimento + sovrapprezzo → `sovrapprezzo:5:20`
--      (sovrapprezzo, totale) e il sito spiega;
--    · omaggio → passa (decide Luka); serata senza fasce → passa.
--    · i nomi ora si confrontano anche SENZA SPAZI ("De Luca" = "Deluca",
--      "Rossi Mario" = "Mario Rossi"): vale anche per il 63.
--
-- Da incollare nel SQL Editor. Si può rieseguire.
-- ============================================================


create table if not exists public.persone_sovrapprezzo (
  id            uuid primary key default gen_random_uuid(),
  nome          text not null,
  cognome       text not null,
  event_id      uuid references public.events (id) on delete cascade,  -- vuoto = tutte le serate
  sovrapprezzo  int not null check (sovrapprezzo between 1 and 500),
  motivo        text,
  attivo        boolean not null default true,
  created_at    timestamptz not null default now(),
  created_by    text
);

alter table public.persone_sovrapprezzo enable row level security;


-- Nome senza spazi: "De Luca" e "Deluca" diventano uguali.
create or replace function public._nome_unito(p text)
returns text
language sql
immutable
set search_path = public
as $$
  select regexp_replace(public._nome_pulito(p), '\s', '', 'g');
$$;

revoke execute on function public._nome_unito(text) from public, anon, authenticated;


create or replace function public._presales_rimborsati()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_paga   numeric;
  v_minimo int;
  v_extra  int;
  v_base   numeric;
  v_ab     text := public._nome_unito(new.nome) || public._nome_unito(new.cognome);
  v_ba     text := public._nome_unito(new.cognome) || public._nome_unito(new.nome);
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

  -- 1 · Si era fatto rimborsare (63): prezzo minimo su quella serata.
  select max(r.prezzo_minimo) into v_minimo
    from public.prevendite_rimborsate r
   where r.event_id = new.event_id
     and public._nome_unito(r.nome) || public._nome_unito(r.cognome) in (v_ab, v_ba);

  if v_minimo is not null and v_paga < v_minimo then
    raise exception 'rimborsato:%', v_minimo;
  end if;

  -- 2 · Persona segnata (64): fascia + sovrapprezzo.
  select max(s.sovrapprezzo) into v_extra
    from public.persone_sovrapprezzo s
   where s.attivo
     and (s.event_id is null or s.event_id = new.event_id)
     and public._nome_unito(s.nome) || public._nome_unito(s.cognome) in (v_ab, v_ba);

  if v_extra is not null then
    if new.tier_id is not null then
      select t.price into v_base from public.event_tiers t where t.id = new.tier_id;
    else
      select min(t.price) into v_base
        from public.event_tiers t
       where t.event_id = new.event_id
         and t.price > 0
         and not coalesce(t.nascosta, false);
    end if;

    if v_base is not null and v_paga < v_base + v_extra then
      raise exception 'sovrapprezzo:%:%', v_extra, (v_base + v_extra)::int;
    end if;
  end if;

  return new;
end;
$$;

revoke execute on function public._presales_rimborsati() from public, anon, authenticated;

-- Il trigger c'è già dal 63: si rimette per sicurezza (stessa funzione).
drop trigger if exists presales_rimborsati on public.presales;
create trigger presales_rimborsati
  before insert on public.presales
  for each row execute function public._presales_rimborsati();
