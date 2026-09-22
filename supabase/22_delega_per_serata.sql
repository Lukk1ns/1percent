-- ============================================================
-- 22 — OGNI SERATA HA IL SUO MODULO DI DELEGA
--
-- I due locali sono due società diverse — PAPI ON THE BEACH è QFB SRL,
-- PR1ME CLUB è EXO SRLS — quindi hanno due moduli diversi, con due
-- informative privacy diverse. Un link solo per tutto il sito darebbe
-- al cliente il modulo sbagliato, e un'informativa che nomina la
-- società sbagliata non vale niente.
--
-- Quindi il modulo si sceglie **per serata**, come la grafica e i prezzi.
--
-- Da incollare nel SQL Editor. Si può rieseguire.
-- ============================================================

alter table public.events add column if not exists delega_url text;


create or replace function public.admin_set_event_delega(p_id uuid, p_url text)
returns text
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception 'Non autorizzato';
  end if;

  update public.events e
     set delega_url = nullif(trim(p_url), '')
   where e.id = p_id;

  if not found then
    return 'non_trovato';
  end if;
  return 'ok';
end;
$$;

grant execute on function public.admin_set_event_delega(uuid, text) to authenticated;


-- Il pannello deve sapere quale modulo è impostato
drop function if exists public.admin_event_ticket(uuid);

create function public.admin_event_ticket(p_event uuid)
returns table (ticket_key text, ticket_v bigint, delega_url text)
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
    select e.ticket_key,
           coalesce(extract(epoch from e.ticket_updated_at)::bigint, 0),
           e.delega_url
    from public.events e where e.id = p_event;
end;
$$;

grant execute on function public.admin_event_ticket(uuid) to authenticated;


-- E il biglietto se lo porta dietro: chi ha meno di 16 anni scarica
-- il modulo giusto per il locale dove sta andando.
drop function if exists public.biglietto(text);

create function public.biglietto(p_token text)
returns table (
  nome        text,
  cognome     text,
  tier_label  text,
  prezzo      numeric,
  stato       text,
  minorenne   boolean,
  under16     boolean,
  evento      text,
  locale      text,
  citta       text,
  indirizzo   text,
  starts_at   timestamptz,
  ticket_key  text,
  ticket_v    bigint,
  delega_url  text
)
language sql
security definer
set search_path = public
stable
as $$
  select s.nome, s.cognome, s.tier_label, s.prezzo, s.stato,
         (extract(year from now())::int - s.anno_nascita) < 18,
         (extract(year from now())::int - s.anno_nascita) < 16,
         e.name, v.name, v.city, v.address, e.starts_at,
         e.ticket_key,
         coalesce(extract(epoch from e.ticket_updated_at)::bigint, 0),
         e.delega_url
  from public.presales s
  join public.events e on e.id = s.event_id
  left join public.venues v on v.id = e.venue_id
  where s.token = p_token;
$$;

grant execute on function public.biglietto(text) to anon, authenticated;


-- ============================================================
-- Controllo
-- ============================================================
select count(*) as "serate con il modulo impostato"
from public.events where delega_url is not null;
