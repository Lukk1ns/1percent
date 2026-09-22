-- ============================================================
-- 10 — LE PREVENDITE DELLA DIREZIONE
--
-- Chiesto da Luka il 22 settembre 2026, dopo aver visto la Fase 1.
--
-- Tre regole nuove, tutte per l'admin:
--   1. l'admin entra su /pr anche senza essere della crew
--   2. l'admin vende SEMPRE: niente blocchetti da consumare, niente
--      scorta che finisce, niente vendite chiuse che lo fermano
--   3. quello che vende l'admin nasce GIÀ VALIDO — i soldi li ha in
--      mano lui, non c'è nessun incasso da aspettare
--
-- Chi toglie i clienti resta uno solo: l'admin. I PR non hanno nessun
-- modo di cancellare un biglietto, né dal sito né chiamando il database.
--
-- Va incollato DOPO 09_prevendite.sql. Si può rieseguire.
-- ============================================================


-- Le vendite della direzione non hanno un PR dietro: la colonna resta
-- vuota e "da_admin" dice che l'ha fatta Luka.
alter table public.presales alter column pr_id drop not null;
alter table public.presales add column if not exists da_admin boolean not null default false;


-- ------------------------------------------------------------
-- Chi entra nell'area /pr: la crew approvata, più l'admin.
-- ------------------------------------------------------------
create or replace function public.is_pr()
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select public.is_admin() or exists (
    select 1 from public.profiles
    where id = auth.uid() and role = 'crew' and deleted_at is null
  );
$$;

grant execute on function public.is_pr() to authenticated;


-- ------------------------------------------------------------
-- Le serate.
-- Il PR vede quelle per cui ha prevendite in mano; l'admin le vede
-- tutte, comprese quelle non ancora pubblicate.
-- ------------------------------------------------------------
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
  residue     int
)
language plpgsql
security definer
set search_path = public
stable
as $$
declare v_admin boolean := public.is_admin();
begin
  if not public.is_pr() then
    raise exception 'Non autorizzato';
  end if;
  if not exists (select 1 from public.prevendite_config where id = 1 and aperta)
     and not v_admin then
    raise exception 'Prevendite non ancora aperte';
  end if;

  return query
    select e.id, e.name, e.slug, v.name, e.starts_at, e.cover_key,
           coalesce(a.tot, 0)::int,
           coalesce(p.tot, 0)::int,
           (coalesce(a.tot, 0) - coalesce(p.tot, 0))::int
    from public.events e
    left join public.venues v on v.id = e.venue_id
    left join lateral (
      select sum(delta)::int as tot from public.pr_allocations
      where event_id = e.id and pr_id = auth.uid()
    ) a on true
    left join lateral (
      select count(*)::int as tot from public.presales
      where event_id = e.id and stato <> 'annullata'
        and (case when v_admin then pr_id is null else pr_id = auth.uid() end)
    ) p on true
    -- L'admin le vede tutte. Il PR solo quelle che gli sono state date.
    where v_admin or a.tot is not null
    order by e.starts_at desc;
end;
$$;

grant execute on function public.pr_eventi() to authenticated;


-- ------------------------------------------------------------
-- Il quadro di una serata.
-- Per l'admin i blocchetti non esistono: "senza_limite" lo dice al sito.
-- ------------------------------------------------------------
drop function if exists public.pr_riepilogo(uuid);

create function public.pr_riepilogo(p_event uuid)
returns table (
  assegnate     int,
  vendute       int,
  residue       int,
  in_attesa     int,
  attive        int,
  entrate       int,
  dovuto        numeric,
  consegnato    numeric,
  da_portare    numeric,
  vendite_on    boolean,
  senza_limite  boolean
)
language plpgsql
security definer
set search_path = public
stable
as $$
declare
  v_me    uuid    := auth.uid();
  v_admin boolean := public.is_admin();
begin
  if not public.is_pr() then
    raise exception 'Non autorizzato';
  end if;

  return query
  with mie as (
    select * from public.presales
    where event_id = p_event
      and (case when v_admin then pr_id is null else pr_id = v_me end)
  ),
  blocchetti as (
    select coalesce(sum(delta), 0)::int as tot from public.pr_allocations
    where event_id = p_event and pr_id = v_me
  ),
  portati as (
    select coalesce(sum(importo), 0) as tot from public.pr_settlements
    where event_id = p_event and pr_id = v_me
  )
  select
    (select tot from blocchetti),
    (select count(*) from mie where stato <> 'annullata')::int,
    ((select tot from blocchetti)
      - (select count(*) from mie where stato <> 'annullata'))::int,
    (select count(*) from mie where stato = 'in_attesa')::int,
    (select count(*) from mie where stato = 'attiva')::int,
    (select count(*) from mie where stato = 'usata')::int,
    coalesce((select sum(prezzo) from mie where stato <> 'annullata'), 0),
    (select tot from portati),
    case when v_admin then 0
         else coalesce((select sum(prezzo) from mie where stato <> 'annullata'), 0)
              - (select tot from portati) end,
    (select vendite_on from public.prevendite_config where id = 1) or v_admin,
    v_admin;
end;
$$;

grant execute on function public.pr_riepilogo(uuid) to authenticated;


-- ------------------------------------------------------------
-- I biglietti fatti da chi guarda.
-- ------------------------------------------------------------
drop function if exists public.pr_miei_biglietti(uuid);

create function public.pr_miei_biglietti(p_event uuid)
returns table (
  id uuid, nome text, cognome text, anno_nascita int, telefono text,
  tier_label text, prezzo numeric, token text, stato text,
  minorenne boolean, created_at timestamptz
)
language plpgsql
security definer
set search_path = public
stable
as $$
declare v_admin boolean := public.is_admin();
begin
  if not public.is_pr() then
    raise exception 'Non autorizzato';
  end if;

  return query
    select s.id, s.nome, s.cognome, s.anno_nascita, s.telefono,
           s.tier_label, s.prezzo, s.token, s.stato,
           (extract(year from now())::int - s.anno_nascita) < 18,
           s.created_at
    from public.presales s
    where s.event_id = p_event
      and (case when v_admin then s.pr_id is null else s.pr_id = auth.uid() end)
    order by s.created_at desc;
end;
$$;

grant execute on function public.pr_miei_biglietti(uuid) to authenticated;


-- ------------------------------------------------------------
-- LA VENDITA, versione 2.
--
-- Per il PR non cambia niente: consuma un blocchetto, rispetta le
-- scorte, e il biglietto resta in attesa finché non consegna i soldi.
--
-- Per l'admin cade tutto: vende anche a vendite chiuse, anche a fascia
-- esaurita, senza blocchetti — e il biglietto è valido dal primo istante.
-- ------------------------------------------------------------
drop function if exists public.pr_vendi(uuid, uuid, text, text, int, text);

create function public.pr_vendi(
  p_event    uuid,
  p_tier     uuid,
  p_nome     text,
  p_cognome  text,
  p_anno     int,
  p_telefono text
)
returns table (esito text, token text, prezzo numeric, minorenne boolean)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_me       uuid    := auth.uid();
  v_admin    boolean := public.is_admin();
  v_tier     record;
  v_residue  int;
  v_rimaste  int;
  v_token    text;
begin
  if not public.is_pr() then
    raise exception 'Non autorizzato';
  end if;

  if not v_admin then
    if not exists (select 1 from public.prevendite_config where id = 1 and aperta) then
      return query select 'chiuso'::text, null::text, null::numeric, null::boolean; return;
    end if;
    if not exists (select 1 from public.prevendite_config where id = 1 and vendite_on) then
      return query select 'vendite_ferme'::text, null::text, null::numeric, null::boolean; return;
    end if;
  end if;

  select * into v_tier from public.event_tiers where id = p_tier and event_id = p_event;
  if not found then
    return query select 'fascia_sconosciuta'::text, null::text, null::numeric, null::boolean; return;
  end if;

  if coalesce(trim(p_nome), '') = '' or coalesce(trim(p_cognome), '') = '' then
    return query select 'dati_mancanti'::text, null::text, null::numeric, null::boolean; return;
  end if;

  -- I limiti valgono solo per i PR.
  if not v_admin then
    select coalesce((select sum(delta) from public.pr_allocations
                     where event_id = p_event and pr_id = v_me), 0)
         - (select count(*) from public.presales
            where event_id = p_event and pr_id = v_me and stato <> 'annullata')
    into v_residue;

    if v_residue <= 0 then
      return query select 'finite'::text, null::text, null::numeric, null::boolean; return;
    end if;

    if v_tier.stock is not null then
      select v_tier.stock - count(*) into v_rimaste from public.presales
        where tier_id = v_tier.id and stato <> 'annullata';
      if v_rimaste <= 0 then
        return query select 'fascia_esaurita'::text, null::text, null::numeric, null::boolean; return;
      end if;
    end if;
  end if;

  v_token := substr(md5(gen_random_uuid()::text || clock_timestamp()::text), 1, 20);

  insert into public.presales
    (event_id, pr_id, da_admin, nome, cognome, anno_nascita, telefono,
     tier_id, tier_label, prezzo, token, stato, attivata_at, attivata_da)
  values
    (p_event,
     case when v_admin then null else v_me end,
     v_admin,
     trim(p_nome), trim(p_cognome), p_anno, nullif(trim(p_telefono), ''),
     v_tier.id, v_tier.label, v_tier.price, v_token,
     -- Quella della direzione è già pagata: nasce valida.
     case when v_admin then 'attiva' else 'in_attesa' end,
     case when v_admin then now() else null end,
     case when v_admin then 'direzione' else null end);

  if not v_admin then
    -- Se il PR aveva già consegnato soldi in anticipo, si attiva da sé.
    perform public._pr_applica_credito(p_event, v_me, 'automatico');
  end if;

  return query select 'ok'::text, v_token, v_tier.price,
                      ((extract(year from now())::int - p_anno) < 18);
end;
$$;

grant execute on function public.pr_vendi(uuid, uuid, text, text, int, text) to authenticated;


-- ------------------------------------------------------------
-- L'elenco dei biglietti nel pannello: adesso ci sono anche quelli
-- della direzione, che non hanno un PR dietro.
-- ------------------------------------------------------------
drop function if exists public.admin_presales(uuid);

create function public.admin_presales(p_event uuid)
returns table (
  id uuid, nome text, cognome text, anno_nascita int, telefono text,
  tier_label text, prezzo numeric, token text, stato text,
  minorenne boolean, pr_alias text, pr_nome text, created_at timestamptz
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
    select s.id, s.nome, s.cognome, s.anno_nascita, s.telefono,
           s.tier_label, s.prezzo, s.token, s.stato,
           (extract(year from now())::int - s.anno_nascita) < 18,
           coalesce(p.alias, 'DIREZIONE'), p.nome, s.created_at
    from public.presales s
    left join public.profiles p on p.id = s.pr_id
    where s.event_id = p_event
    order by s.created_at desc;
end;
$$;

grant execute on function public.admin_presales(uuid) to authenticated;


-- ------------------------------------------------------------
-- I totali della serata: i soldi delle vendite fatte dalla direzione
-- sono già in cassa, quindi entrano fra i raccolti.
-- ------------------------------------------------------------
drop function if exists public.admin_pr_eventi();

create function public.admin_pr_eventi()
returns table (
  event_id   uuid,
  nome       text,
  locale     text,
  starts_at  timestamptz,
  passato    boolean,
  fasce      int,
  assegnate  int,
  vendute    int,
  attive     int,
  entrate    int,
  incasso    numeric,
  raccolto   numeric
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
    select e.id, e.name, v.name, e.starts_at,
           coalesce(e.ends_at, e.starts_at) < now(),
           (select count(*) from public.event_tiers t where t.event_id = e.id)::int,
           coalesce((select sum(delta) from public.pr_allocations a where a.event_id = e.id), 0)::int,
           (select count(*) from public.presales s
             where s.event_id = e.id and s.stato <> 'annullata')::int,
           (select count(*) from public.presales s
             where s.event_id = e.id and s.stato = 'attiva')::int,
           (select count(*) from public.presales s
             where s.event_id = e.id and s.stato = 'usata')::int,
           coalesce((select sum(prezzo) from public.presales s
                     where s.event_id = e.id and s.stato <> 'annullata'), 0),
           coalesce((select sum(importo) from public.pr_settlements t
                     where t.event_id = e.id), 0)
           + coalesce((select sum(prezzo) from public.presales s
                       where s.event_id = e.id and s.da_admin
                         and s.stato <> 'annullata'), 0)
    from public.events e
    left join public.venues v on v.id = e.venue_id
    order by e.starts_at desc;
end;
$$;

grant execute on function public.admin_pr_eventi() to authenticated;


-- ============================================================
-- Controllo
-- ============================================================
select
  (select count(*) from public.presales where da_admin)      as "biglietti della direzione",
  (select count(*) from public.presales where not da_admin)  as "biglietti dei PR";
