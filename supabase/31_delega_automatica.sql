-- ============================================================
-- 31 — LA DELEGA PARTE DA SOLA, E LA REGOLA DIVENTA PRUDENTE
--
-- Chiesto da Luka il 25 settembre 2026:
--   "quando il PR vende a uno del 2010 in su, il link della delega
--    dev'essere mandato in automatico — così non ci deve pensare lui".
--
-- Due cose, quindi.
--
-- 1. IL MODULO PER SERATA. Dentro c'è tutto lo script 22, che non era
--    mai stato incollato: senza, `events.delega_url` non esiste e nella
--    scheda Grafica il modulo under 16 e la posizione del QR non si
--    salvano. Chi ha già incollato il 22 può rieseguire tranquillo.
--
-- 2. LA REGOLA DEI 16 ANNI. Di ogni cliente il PR scrive solo l'ANNO di
--    nascita, non il giorno. Con "anno di oggi meno anno di nascita" un
--    nato nel 2010 il 25 settembre 2026 risulta di 16 anni e nessuno gli
--    dice niente — ma se compie gli anni a dicembre, alla serata del 31
--    ottobre di anni ne ha ancora 15, e senza delega in porta resta
--    fuori. Con l'anno soltanto la data esatta non si può sapere, quindi
--    si sbaglia dalla parte giusta: **la delega si nomina a tutti quelli
--    che POTREBBERO non aver compiuto 16 anni la sera della serata** —
--    cioè i nati dal 2010 in su per una serata del 2026, esattamente
--    quello che ha chiesto Luka. A chi li ha già compiuti non costa
--    niente: il messaggio dice "se hai meno di 16 anni".
--
-- `minorenne` (i 18 anni, che valgono per il documento) resta com'era:
-- il documento in porta lo chiedono comunque a tutti.
--
-- Da incollare nel SQL Editor. Si può rieseguire.
-- ============================================================


-- ------------------------------------------------------------
-- (dallo script 22) Il modulo cambia da locale a locale
-- ------------------------------------------------------------
-- I due locali sono due società diverse — PAPI ON THE BEACH è QFB SRL,
-- PR1ME CLUB è EXO SRLS — quindi hanno due moduli diversi, con due
-- informative privacy diverse. Un link solo per tutto il sito darebbe al
-- cliente il modulo sbagliato, e un'informativa che nomina la società
-- sbagliata non vale niente.
alter table public.events add column if not exists delega_url text;

-- Dove appoggiare il QR sulla grafica del biglietto: la distanza dal
-- bordo alto, in percentuale.
alter table public.events add column if not exists qr_pos int
  check (qr_pos between 0 and 100);


create or replace function public.admin_set_event_qr(p_id uuid, p_pos int)
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
     set qr_pos = greatest(0, least(100, p_pos))
   where e.id = p_id;

  if not found then return 'non_trovato'; end if;
  return 'ok';
end;
$$;

revoke execute on function public.admin_set_event_qr(uuid, int) from public, anon;
grant execute on function public.admin_set_event_qr(uuid, int) to authenticated;


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

  if not found then return 'non_trovato'; end if;
  return 'ok';
end;
$$;

revoke execute on function public.admin_set_event_delega(uuid, text) from public, anon;
grant execute on function public.admin_set_event_delega(uuid, text) to authenticated;


-- Il pannello legge grafica, modulo e posizione del QR in un colpo solo.
drop function if exists public.admin_event_ticket(uuid);

create function public.admin_event_ticket(p_event uuid)
returns table (ticket_key text, ticket_v bigint, delega_url text, qr_pos int)
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
           e.delega_url,
           e.qr_pos
    from public.events e where e.id = p_event;
end;
$$;

grant execute on function public.admin_event_ticket(uuid) to authenticated;


-- ------------------------------------------------------------
-- La regola prudente, scritta una volta sola
-- ------------------------------------------------------------
-- "Questo qui, la sera della serata, potrebbe avere meno di 16 anni?"
-- Del cliente sappiamo solo l'anno, quindi la risposta è sì per tutti
-- quelli nati nell'anno di confine e dopo.
create or replace function public.forse_under16(p_anno int, p_quando timestamptz)
returns boolean
language sql
stable
as $$
  select p_anno >= extract(year from coalesce(p_quando, now()))::int - 16;
$$;

grant execute on function public.forse_under16(int, timestamptz) to anon, authenticated;


-- ------------------------------------------------------------
-- Il biglietto porta con sé il modulo giusto
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
  ticket_v    bigint,
  delega_url  text,
  qr_pos      int
)
language sql
security definer
set search_path = public
stable
as $$
  select s.nome, s.cognome, s.tier_label, s.prezzo, s.stato,
         (extract(year from now())::int - s.anno_nascita) < 18,
         public.forse_under16(s.anno_nascita, e.starts_at),
         e.name, v.name, v.city, v.address, e.starts_at,
         e.ticket_key,
         coalesce(extract(epoch from e.ticket_updated_at)::bigint, 0),
         e.delega_url,
         e.qr_pos
  from public.presales s
  join public.events e on e.id = s.event_id
  left join public.venues v on v.id = e.venue_id
  where s.token = p_token;
$$;

grant execute on function public.biglietto(text) to anon, authenticated;


-- ------------------------------------------------------------
-- Il PR vede la stessa regola nel suo elenco
-- ------------------------------------------------------------
drop function if exists public.pr_miei_biglietti(uuid);

create function public.pr_miei_biglietti(p_event uuid)
returns table (
  id uuid, nome text, cognome text, anno_nascita int, telefono text,
  tier_label text, prezzo numeric, token text, stato text,
  minorenne boolean, under16 boolean, created_at timestamptz
)
language plpgsql
security definer
set search_path = public
stable
as $$
#variable_conflict use_column
declare v_admin boolean := public.is_admin();
begin
  if not public.is_pr() then
    raise exception 'Non autorizzato';
  end if;

  return query
    select s.id, s.nome, s.cognome, s.anno_nascita, s.telefono,
           s.tier_label, s.prezzo, s.token, s.stato,
           (extract(year from now())::int - s.anno_nascita) < 18,
           public.forse_under16(s.anno_nascita, e.starts_at),
           s.created_at
    from public.presales s
    join public.events e on e.id = s.event_id
    where s.event_id = p_event
      and (case when v_admin then s.pr_id is null else s.pr_id = auth.uid() end)
    order by s.created_at desc;
end;
$$;

grant execute on function public.pr_miei_biglietti(uuid) to authenticated;


-- ------------------------------------------------------------
-- E la pagina del PR sa quale modulo mandare
-- ------------------------------------------------------------
-- Una colonna in più in fondo: il modulo della serata. Serve a scrivere
-- il link giusto dentro il messaggio WhatsApp, senza che il PR debba
-- sapere quale sia.
drop function if exists public.pr_eventi();

create function public.pr_eventi()
returns table (
  event_id    uuid,
  nome        text,
  slug        text,
  locale      text,
  starts_at   timestamptz,
  cover_key   text,
  assegnate   int,
  vendute     int,
  residue     int,
  delega_url  text
)
language plpgsql
security definer
set search_path = public
stable
as $$
#variable_conflict use_column
begin
  if not public.is_pr() then
    raise exception 'Non autorizzato';
  end if;
  if not exists (select 1 from public.prevendite_config c where c.id = 1 and c.aperta)
     and not public.is_admin() then
    raise exception 'Prevendite non ancora aperte';
  end if;

  return query
    select e.id, e.name, e.slug, v.name, e.starts_at, e.cover_key,
           coalesce(a.tot, 0)::int,
           coalesce(p.tot, 0)::int,
           (coalesce(a.tot, 0) - coalesce(p.tot, 0))::int,
           e.delega_url
    from public.events e
    left join public.venues v on v.id = e.venue_id
    left join lateral (
      select sum(al.delta)::int as tot
      from public.pr_allocations al
      where al.event_id = e.id and al.pr_id = auth.uid()
    ) a on true
    left join lateral (
      select count(*)::int as tot
      from public.presales ps
      where ps.event_id = e.id and ps.pr_id = auth.uid()
        and ps.stato <> 'annullata'
    ) p on true
    -- le serate che devono ancora succedere si vedono sempre;
    -- quelle finite solo se ci ha lavorato
    where e.starts_at > now() or a.tot is not null
    order by e.starts_at;
end;
$$;

grant execute on function public.pr_eventi() to authenticated;


-- ------------------------------------------------------------
-- E la porta chiede la delega alle stesse persone
-- ------------------------------------------------------------
-- Identica allo script 30, cambiata in due punti: la serata entra nella
-- riga letta (serve il suo anno) e i 16 anni si contano con la regola
-- prudente. Se al cliente abbiamo detto "porta la delega", l'operatore
-- in porta deve vedere la stessa cosa.
create or replace function public.porta_checkin(p_token text, p_event uuid default null)
returns table (
  esito       text,
  nome        text,
  cognome     text,
  tier_label  text,
  prezzo      numeric,
  minorenne   boolean,
  under16     boolean,
  pr_alias    text,
  evento      text,
  entrata_at  timestamptz,
  presale_id  uuid
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_b      record;
  v_pr     text;
  v_ev     text;
  v_i      record;
  v_soglia int;
  v_vend   int;
begin
  if not public.is_staff() then
    raise exception 'Non autorizzato';
  end if;

  select s.*, e.name as nome_evento, e.starts_at as quando_evento,
           p.alias as alias_pr
    into v_b
    from public.presales s
    join public.events e on e.id = s.event_id
    left join public.profiles p on p.id = s.pr_id
   where s.token = p_token;

  if not found then
    -- Non è un biglietto: può essere il pass di un PR.
    select i.*, e.name as nome_evento, pf.alias as alias_pr
      into v_i
      from public.pr_ingressi i
      join public.events e on e.id = i.event_id
      join public.profiles pf on pf.id = i.pr_id
     where i.token = p_token;

    if not found then
      return query select 'sconosciuto'::text, null::text, null::text, null::text,
                          null::numeric, null::boolean, null::boolean,
                          null::text, null::text, null::timestamptz, null::uuid;
      return;
    end if;

    if p_event is not null and v_i.event_id <> p_event then
      return query select 'altra_serata'::text, v_i.alias_pr, null::text, 'PASS PR'::text,
                          null::numeric, null::boolean, null::boolean,
                          v_i.alias_pr, v_i.nome_evento, null::timestamptz, null::uuid;
      return;
    end if;

    if v_i.usato_at is not null then
      return query select 'gia_usato'::text, v_i.alias_pr, null::text, 'PASS PR'::text,
                          null::numeric, null::boolean, null::boolean,
                          v_i.alias_pr, v_i.nome_evento, v_i.usato_at, null::uuid;
      return;
    end if;

    select coalesce(c.ingresso_soglia, 10) into v_soglia
      from public.prevendite_config c where c.id = 1;

    select count(*)::int into v_vend
      from public.presales ps
     where ps.event_id = v_i.event_id and ps.pr_id = v_i.pr_id
       and ps.stato <> 'annullata';

    if not (v_vend >= v_soglia or v_i.forzato) then
      return query select 'pr_non_attivo'::text, v_i.alias_pr, null::text,
                          format('%s su %s', v_vend, v_soglia)::text,
                          null::numeric, null::boolean, null::boolean,
                          v_i.alias_pr, v_i.nome_evento, null::timestamptz, null::uuid;
      return;
    end if;

    update public.pr_ingressi i
       set usato_at = now(), usato_da = (auth.jwt() ->> 'email')
     where i.event_id = v_i.event_id and i.pr_id = v_i.pr_id and i.usato_at is null;

    if not found then
      return query select 'gia_usato'::text, v_i.alias_pr, null::text, 'PASS PR'::text,
                          null::numeric, null::boolean, null::boolean,
                          v_i.alias_pr, v_i.nome_evento, now(), null::uuid;
      return;
    end if;

    return query select 'pr_ok'::text, v_i.alias_pr, null::text, 'PASS PR'::text,
                        null::numeric, null::boolean, null::boolean,
                        v_i.alias_pr, v_i.nome_evento, now(), null::uuid;
    return;
  end if;

  v_pr := coalesce(v_b.alias_pr, 'DIREZIONE');
  v_ev := v_b.nome_evento;

  if p_event is not null and v_b.event_id <> p_event then
    return query select 'altra_serata'::text, v_b.nome, v_b.cognome, v_b.tier_label,
                        v_b.prezzo, null::boolean, null::boolean, v_pr, v_ev,
                        null::timestamptz, v_b.id;
    return;
  end if;

  if v_b.stato = 'annullata' then
    return query select 'annullato'::text, v_b.nome, v_b.cognome, v_b.tier_label,
                        v_b.prezzo, null::boolean, null::boolean, v_pr, v_ev,
                        null::timestamptz, v_b.id;
    return;
  end if;

  if v_b.stato = 'usata' then
    return query select 'gia_usato'::text, v_b.nome, v_b.cognome, v_b.tier_label,
                        v_b.prezzo, null::boolean, null::boolean, v_pr, v_ev,
                        v_b.usata_at, v_b.id;
    return;
  end if;

  if v_b.stato = 'in_attesa' then
    return query select 'non_pagato'::text, v_b.nome, v_b.cognome, v_b.tier_label,
                        v_b.prezzo, null::boolean, null::boolean, v_pr, v_ev,
                        null::timestamptz, v_b.id;
    return;
  end if;

  update public.presales s
     set stato = 'usata',
         usata_at = now(),
         usata_da = (auth.jwt() ->> 'email'),
         entrata_da = (auth.jwt() ->> 'email')
   where s.id = v_b.id and s.stato = 'attiva';

  if not found then
    return query select 'gia_usato'::text, v_b.nome, v_b.cognome, v_b.tier_label,
                        v_b.prezzo, null::boolean, null::boolean, v_pr, v_ev,
                        now(), v_b.id;
    return;
  end if;

  return query select 'ok'::text, v_b.nome, v_b.cognome, v_b.tier_label, v_b.prezzo,
                      (extract(year from now())::int - v_b.anno_nascita) < 18,
                      public.forse_under16(v_b.anno_nascita, v_b.quando_evento),
                      v_pr, v_ev, now(), v_b.id;
end;
$$;

grant execute on function public.porta_checkin(text, uuid) to authenticated;


-- ============================================================
-- Controllo
-- ============================================================
-- La prima riga dice quante serate hanno il modulo scelto.
-- La seconda prova la regola: per una serata del 2026, un nato nel 2010
-- deve risultare "sì, potrebbe avere meno di 16 anni".
select
  (select count(*) from public.events where delega_url is not null) as "serate col modulo",
  public.forse_under16(2010, '2026-10-31'::timestamptz) as "un 2010 va avvisato (deve dire true)",
  public.forse_under16(2009, '2026-10-31'::timestamptz) as "un 2009 no (deve dire false)";
