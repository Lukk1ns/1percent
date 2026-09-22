-- ============================================================
-- 13 — LA GRAFICA DEL BIGLIETTO
--
-- Chiesto da Luka il 22 settembre 2026: il cliente deve ricevere il
-- biglietto con sopra la grafica della serata, come su Evently, con
-- il QR appoggiato sopra (che ne copra un pezzo non è un problema).
--
-- Perché un deposito nuovo e non la locandina che c'è già: quella
-- nitida è **riservata ai membri** (policy dello storage, vedi
-- 04_locandine.sql) e prima dello svelamento va tenuta nascosta. La
-- grafica del biglietto invece finisce su WhatsApp a centinaia di
-- clienti che non sono iscritti a niente: è pubblica per forza.
-- Tenendole separate, Luka decide cosa far vedere sul biglietto senza
-- toccare la locandina segreta.
--
-- Da incollare nel SQL Editor. Si può rieseguire.
-- ============================================================


-- ------------------------------------------------------------
-- Il deposito: pubblico, chi ha il link la vede
-- ------------------------------------------------------------
insert into storage.buckets (id, name, public)
values ('biglietti', 'biglietti', true)
on conflict (id) do update set public = true;

-- La legge chiunque: è la grafica che arriva al cliente.
drop policy if exists "grafica_biglietto_pubblica" on storage.objects;
create policy "grafica_biglietto_pubblica"
on storage.objects for select to anon, authenticated
using (bucket_id = 'biglietti');

-- La carica, sostituisce e cancella solo lo staff.
drop policy if exists "grafica_biglietto_admin_carica" on storage.objects;
create policy "grafica_biglietto_admin_carica"
on storage.objects for insert to authenticated
with check (bucket_id = 'biglietti' and public.is_admin());

drop policy if exists "grafica_biglietto_admin_sostituisce" on storage.objects;
create policy "grafica_biglietto_admin_sostituisce"
on storage.objects for update to authenticated
using (bucket_id = 'biglietti' and public.is_admin())
with check (bucket_id = 'biglietti' and public.is_admin());

drop policy if exists "grafica_biglietto_admin_cancella" on storage.objects;
create policy "grafica_biglietto_admin_cancella"
on storage.objects for delete to authenticated
using (bucket_id = 'biglietti' and public.is_admin());


-- ------------------------------------------------------------
-- Dove la teniamo segnata
-- ------------------------------------------------------------
alter table public.events add column if not exists ticket_key text;
alter table public.events add column if not exists ticket_updated_at timestamptz;


create or replace function public.admin_set_event_ticket(p_id uuid, p_key text)
returns bigint
language plpgsql
security definer
set search_path = public
as $$
declare v_quando timestamptz;
begin
  if not public.is_admin() then
    raise exception 'Non autorizzato';
  end if;

  if coalesce(trim(p_key), '') = '' then
    update public.events e
       set ticket_key = null, ticket_updated_at = null
     where e.id = p_id;
    return 0;
  end if;

  v_quando := now();
  update public.events e
     set ticket_key = trim(p_key), ticket_updated_at = v_quando
   where e.id = p_id;

  if not found then
    raise exception 'Evento non trovato';
  end if;

  return extract(epoch from v_quando)::bigint;
end;
$$;

revoke execute on function public.admin_set_event_ticket(uuid, text) from anon;
grant execute on function public.admin_set_event_ticket(uuid, text) to authenticated;


-- Il pannello deve sapere se una serata ce l'ha già.
create or replace function public.admin_event_ticket(p_event uuid)
returns table (ticket_key text, ticket_v bigint)
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
    select e.ticket_key, coalesce(extract(epoch from e.ticket_updated_at)::bigint, 0)
    from public.events e where e.id = p_event;
end;
$$;

grant execute on function public.admin_event_ticket(uuid) to authenticated;


-- ------------------------------------------------------------
-- Il biglietto la porta con sé
-- ------------------------------------------------------------
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
  ticket_v    bigint
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
         coalesce(extract(epoch from e.ticket_updated_at)::bigint, 0)
  from public.presales s
  join public.events e on e.id = s.event_id
  left join public.venues v on v.id = e.venue_id
  where s.token = p_token;
$$;

grant execute on function public.biglietto(text) to anon, authenticated;


-- ============================================================
-- Controllo
-- ============================================================
select
  (select count(*) from storage.buckets where id = 'biglietti') as "deposito grafiche",
  (select count(*) from public.events where ticket_key is not null) as "serate con grafica";
