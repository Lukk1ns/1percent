-- ============================================================
-- 65 — IL PR VENDE LUI, AL PREZZO GIUSTO
--
-- Luka, 20 novembre 2026, vista la schermata di una PR che provava a
-- rifare il biglietto a una rimborsata: *"non deve venire fuori di
-- chiamare me, di non incassare i soldi. Lei deve incassare i soldi,
-- ma 20 euro"*.
--
-- Prima (63/64) il biglietto si fermava e basta. Adesso:
--   1. il PR preme "Fai il biglietto" → si ferma come prima
--      (`rimborsato:20` / `sovrapprezzo:5:20`) e la pagina gli dice
--      "per lei costa 20 €, fatti dare 20 € e conferma";
--   2. il PR preme "Ho incassato 20 € · fai il biglietto" →
--      `pr_prezzo_conferma()` scrive una conferma (sua, per quella
--      serata e quel nome, vale 15 minuti) e la pagina rifà la vendita;
--   3. il controllo trova la conferma, **alza il prezzo del biglietto**
--      a 20 e la cancella (una conferma = un biglietto).
--
-- Il biglietto resta del PR, con la sua fascia: dovuto, consegna dei
-- soldi, punti, porta funzionano come sempre, solo che vale 20.
-- `pr_vendi` non si tocca (risponde ancora il prezzo della fascia:
-- la pagina mostra quello confermato).
--
-- Prenotazioni "paga in cassa" e vendite segnate da Luka non passano
-- dalla conferma: lì il prezzo lo scrive lui (sotto il minimo → fermo).
--
-- Rifà `_presales_rimborsati()`: ultima definizione = questa.
-- Da incollare nel SQL Editor. Si può rieseguire.
-- ============================================================


-- ------------------------------------------------------------
-- 1 · Quanto deve pagare questa persona (null = prezzo normale)
-- ------------------------------------------------------------
create or replace function public._prezzo_richiesto(
  p_event   uuid,
  p_tier    uuid,
  p_nome    text,
  p_cognome text
)
returns table (minimo int, extra int)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_ab   text := public._nome_unito(p_nome) || public._nome_unito(p_cognome);
  v_ba   text := public._nome_unito(p_cognome) || public._nome_unito(p_nome);
  v_rimb int;
  v_ex   int;
  v_base numeric;
begin
  -- Si era fatto rimborsare (63): prezzo fisso su quella serata.
  select max(r.prezzo_minimo) into v_rimb
    from public.prevendite_rimborsate r
   where r.event_id = p_event
     and public._nome_unito(r.nome) || public._nome_unito(r.cognome) in (v_ab, v_ba);

  -- Persona segnata (64): fascia + sovrapprezzo.
  select max(s.sovrapprezzo) into v_ex
    from public.persone_sovrapprezzo s
   where s.attivo
     and (s.event_id is null or s.event_id = p_event)
     and public._nome_unito(s.nome) || public._nome_unito(s.cognome) in (v_ab, v_ba);

  if v_ex is not null then
    if p_tier is not null then
      select t.price into v_base from public.event_tiers t where t.id = p_tier;
    else
      select min(t.price) into v_base
        from public.event_tiers t
       where t.event_id = p_event
         and t.price > 0
         and not coalesce(t.nascosta, false);
    end if;
  end if;

  if v_base is not null and (v_rimb is null or v_base + v_ex > v_rimb) then
    return query select (v_base + v_ex)::int, v_ex;
  elsif v_rimb is not null then
    return query select v_rimb, null::int;
  end if;
end;
$$;

revoke execute on function public._prezzo_richiesto(uuid, uuid, text, text) from public, anon, authenticated;


-- ------------------------------------------------------------
-- 2 · La conferma del PR: "ho incassato 20 €"
-- ------------------------------------------------------------
create table if not exists public.prezzo_speciale_ok (
  id          uuid primary key default gen_random_uuid(),
  chi         uuid not null,
  event_id    uuid not null references public.events (id) on delete cascade,
  chiave      text not null,
  prezzo      int  not null,
  created_at  timestamptz not null default now()
);

alter table public.prezzo_speciale_ok enable row level security;

create or replace function public.pr_prezzo_conferma(
  p_event   uuid,
  p_nome    text,
  p_cognome text,
  p_tier    uuid
)
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  v_me     uuid := auth.uid();
  v_minimo int;
begin
  if v_me is null then
    raise exception 'Non autorizzato';
  end if;

  select pr.minimo into v_minimo
    from public._prezzo_richiesto(p_event, p_tier, p_nome, p_cognome) pr;

  if v_minimo is null then
    return null;  -- prezzo normale: niente da confermare
  end if;

  -- Pulizia: le sue conferme vecchie o per lo stesso nome.
  delete from public.prezzo_speciale_ok o
   where o.created_at < now() - interval '1 day'
      or (o.chi = v_me and o.event_id = p_event
          and o.chiave = public._nome_unito(p_nome) || public._nome_unito(p_cognome));

  insert into public.prezzo_speciale_ok (chi, event_id, chiave, prezzo)
  values (v_me, p_event, public._nome_unito(p_nome) || public._nome_unito(p_cognome), v_minimo);

  return v_minimo;
end;
$$;

revoke execute on function public.pr_prezzo_conferma(uuid, text, text, uuid) from public, anon;
grant execute on function public.pr_prezzo_conferma(uuid, text, text, uuid) to authenticated;


-- ------------------------------------------------------------
-- 3 · Il controllo sui biglietti nuovi
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
  v_extra  int;
  v_ok     uuid;
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

  select pr.minimo, pr.extra into v_minimo, v_extra
    from public._prezzo_richiesto(new.event_id, new.tier_id, new.nome, new.cognome) pr;

  if v_minimo is null or v_paga >= v_minimo then
    return new;
  end if;

  -- Il PR ha confermato di aver incassato il prezzo giusto (vendita vera,
  -- non prenotazione): il biglietto nasce a quel prezzo.
  if coalesce(new.prezzo, 0) > 0 and auth.uid() is not null then
    select o.id into v_ok
      from public.prezzo_speciale_ok o
     where o.chi = auth.uid()
       and o.event_id = new.event_id
       and o.chiave = public._nome_unito(new.nome) || public._nome_unito(new.cognome)
       and o.prezzo = v_minimo
       and o.created_at > now() - interval '15 minutes'
     order by o.created_at desc
     limit 1;

    if v_ok is not null then
      delete from public.prezzo_speciale_ok o where o.id = v_ok;
      new.prezzo := v_minimo;
      return new;
    end if;
  end if;

  if v_extra is not null then
    raise exception 'sovrapprezzo:%:%', v_extra, v_minimo;
  end if;
  raise exception 'rimborsato:%', v_minimo;
end;
$$;

revoke execute on function public._presales_rimborsati() from public, anon, authenticated;

drop trigger if exists presales_rimborsati on public.presales;
create trigger presales_rimborsati
  before insert on public.presales
  for each row execute function public._presales_rimborsati();
