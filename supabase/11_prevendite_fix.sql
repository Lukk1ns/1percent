-- ============================================================
-- 11 — CORREZIONE: i nomi che si pestavano i piedi
--
-- Tre funzioni ritornavano una colonna che si chiama come una colonna
-- delle tabelle che interrogano (event_id, pr_id, vendite_on). Postgres
-- non sa a quale delle due ti riferisci e si ferma:
--   "column reference ... is ambiguous"
-- Effetto visibile: /pr diceva "nessuna serata", il pannello diceva
-- "nessuna crew approvata", e la vendita non partiva.
--
-- Qui dentro le stesse funzioni, con ogni colonna scritta per esteso
-- (tabella.colonna). Non cambia niente di come funzionano.
--
-- Va incollato DOPO il 10. Si può rieseguire.
-- ============================================================


-- ------------------------------------------------------------
-- Le serate
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
declare
  v_admin boolean := public.is_admin();
  v_me    uuid    := auth.uid();
begin
  if not public.is_pr() then
    raise exception 'Non autorizzato';
  end if;
  if not exists (select 1 from public.prevendite_config c where c.id = 1 and c.aperta)
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
      select sum(al.delta)::int as tot
      from public.pr_allocations al
      where al.event_id = e.id and al.pr_id = v_me
    ) a on true
    left join lateral (
      select count(*)::int as tot
      from public.presales ps
      where ps.event_id = e.id and ps.stato <> 'annullata'
        and (case when v_admin then ps.pr_id is null else ps.pr_id = v_me end)
    ) p on true
    where v_admin or a.tot is not null
    order by e.starts_at desc;
end;
$$;

grant execute on function public.pr_eventi() to authenticated;


-- ------------------------------------------------------------
-- Il quadro di una serata
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
  v_me       uuid    := auth.uid();
  v_admin    boolean := public.is_admin();
  v_vendite  boolean;
begin
  if not public.is_pr() then
    raise exception 'Non autorizzato';
  end if;

  select c.vendite_on into v_vendite from public.prevendite_config c where c.id = 1;

  return query
  with mie as (
    select ps.* from public.presales ps
    where ps.event_id = p_event
      and (case when v_admin then ps.pr_id is null else ps.pr_id = v_me end)
  ),
  blocchetti as (
    select coalesce(sum(al.delta), 0)::int as tot
    from public.pr_allocations al
    where al.event_id = p_event and al.pr_id = v_me
  ),
  portati as (
    select coalesce(sum(st.importo), 0) as tot
    from public.pr_settlements st
    where st.event_id = p_event and st.pr_id = v_me
  )
  select
    (select b.tot from blocchetti b),
    (select count(*) from mie m where m.stato <> 'annullata')::int,
    ((select b.tot from blocchetti b)
      - (select count(*) from mie m where m.stato <> 'annullata'))::int,
    (select count(*) from mie m where m.stato = 'in_attesa')::int,
    (select count(*) from mie m where m.stato = 'attiva')::int,
    (select count(*) from mie m where m.stato = 'usata')::int,
    coalesce((select sum(m.prezzo) from mie m where m.stato <> 'annullata'), 0),
    (select p.tot from portati p),
    case when v_admin then 0
         else coalesce((select sum(m.prezzo) from mie m where m.stato <> 'annullata'), 0)
              - (select p.tot from portati p) end,
    coalesce(v_vendite, false) or v_admin,
    v_admin;
end;
$$;

grant execute on function public.pr_riepilogo(uuid) to authenticated;


-- ------------------------------------------------------------
-- La lista dei PR nel pannello
-- ------------------------------------------------------------
drop function if exists public.admin_pr_lista(uuid);

create function public.admin_pr_lista(p_event uuid)
returns table (
  pr_id       uuid,
  alias       text,
  nome        text,
  email       text,
  assegnate   int,
  vendute     int,
  residue     int,
  in_attesa   int,
  attive      int,
  entrate     int,
  dovuto      numeric,
  consegnato  numeric,
  mancante    numeric
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
    select p.id, p.alias, p.nome, p.email,
           coalesce(a.tot, 0)::int,
           coalesce(s.vendute, 0)::int,
           (coalesce(a.tot, 0) - coalesce(s.vendute, 0))::int,
           coalesce(s.in_attesa, 0)::int,
           coalesce(s.attive, 0)::int,
           coalesce(s.entrate, 0)::int,
           coalesce(s.dovuto, 0),
           coalesce(t.raccolto, 0),
           coalesce(s.dovuto, 0) - coalesce(t.raccolto, 0)
    from public.profiles p
    left join lateral (
      select sum(al.delta)::int as tot
      from public.pr_allocations al
      where al.event_id = p_event and al.pr_id = p.id
    ) a on true
    left join lateral (
      select count(*) filter (where ps.stato <> 'annullata')    as vendute,
             count(*) filter (where ps.stato = 'in_attesa')     as in_attesa,
             count(*) filter (where ps.stato = 'attiva')        as attive,
             count(*) filter (where ps.stato = 'usata')         as entrate,
             sum(ps.prezzo) filter (where ps.stato <> 'annullata') as dovuto
      from public.presales ps
      where ps.event_id = p_event and ps.pr_id = p.id
    ) s on true
    left join lateral (
      select sum(st.importo) as raccolto
      from public.pr_settlements st
      where st.event_id = p_event and st.pr_id = p.id
    ) t on true
    where p.role = 'crew' and p.deleted_at is null
    order by coalesce(a.tot, 0) desc, p.alias;
end;
$$;

grant execute on function public.admin_pr_lista(uuid) to authenticated;


-- ------------------------------------------------------------
-- La classifica (stessa precauzione)
-- ------------------------------------------------------------
drop function if exists public.admin_pr_classifica(uuid);

create function public.admin_pr_classifica(p_event uuid)
returns table (alias text, nome text, vendute int, assegnate int, resa numeric)
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
    select p.alias, p.nome,
           coalesce(s.n, 0)::int,
           coalesce(a.tot, 0)::int,
           case when coalesce(a.tot, 0) = 0 then 0
                else round(coalesce(s.n, 0)::numeric * 100 / a.tot, 0) end
    from public.profiles p
    left join lateral (
      select count(*) as n from public.presales ps
      where ps.event_id = p_event and ps.pr_id = p.id and ps.stato <> 'annullata'
    ) s on true
    left join lateral (
      select sum(al.delta)::int as tot from public.pr_allocations al
      where al.event_id = p_event and al.pr_id = p.id
    ) a on true
    where p.role = 'crew' and p.deleted_at is null and coalesce(a.tot, 0) > 0
    order by coalesce(s.n, 0) desc, p.alias;
end;
$$;

grant execute on function public.admin_pr_classifica(uuid) to authenticated;


-- ============================================================
-- IL CRUSCOTTO DELLA SERATA
--
-- Quello che Luka guardava su Evently, rifatto qui: quante prevendite
-- ha consegnato, quante ne sono state vendute divise per fascia,
-- quanta gente entra, quanto incassa e quanto ha già in mano.
--
-- Tavoli e omaggi non ci sono ancora: sono la Fase 3.
-- ============================================================
create or replace function public.admin_pr_cruscotto(p_event uuid)
returns table (
  consegnate       int,   -- blocchetti dati ai PR
  vendute          int,   -- biglietti fatti (PR + direzione)
  da_vendere       int,   -- blocchetti in mano ai PR non ancora usati
  in_attesa        int,   -- venduti ma non ancora pagati dal PR
  valide           int,   -- pronti a entrare
  entrate          int,   -- già scansionati in porta
  persone          int,   -- quante persone porta la prevendita
  incasso          numeric,
  raccolto         numeric,
  da_incassare     numeric,
  pr_attivi        int,   -- PR con almeno una prevendita in mano
  pr_in_debito     int
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
  with biglietti as (
    select ps.* from public.presales ps
    where ps.event_id = p_event and ps.stato <> 'annullata'
  ),
  per_pr as (
    select p.id,
           coalesce((select sum(al.delta) from public.pr_allocations al
                     where al.event_id = p_event and al.pr_id = p.id), 0) as avute,
           coalesce((select sum(b.prezzo) from biglietti b where b.pr_id = p.id), 0) as deve,
           coalesce((select sum(st.importo) from public.pr_settlements st
                     where st.event_id = p_event and st.pr_id = p.id), 0) as portati
    from public.profiles p
    where p.role = 'crew' and p.deleted_at is null
  )
  select
    coalesce((select sum(al.delta) from public.pr_allocations al
              where al.event_id = p_event), 0)::int,
    (select count(*) from biglietti)::int,
    (coalesce((select sum(al.delta) from public.pr_allocations al
               where al.event_id = p_event), 0)
     - (select count(*) from biglietti b where b.pr_id is not null))::int,
    (select count(*) from biglietti b where b.stato = 'in_attesa')::int,
    (select count(*) from biglietti b where b.stato = 'attiva')::int,
    (select count(*) from biglietti b where b.stato = 'usata')::int,
    (select count(*) from biglietti)::int,
    coalesce((select sum(b.prezzo) from biglietti b), 0),
    coalesce((select sum(st.importo) from public.pr_settlements st
              where st.event_id = p_event), 0)
    + coalesce((select sum(b.prezzo) from biglietti b where b.da_admin), 0),
    coalesce((select sum(greatest(pp.deve - pp.portati, 0)) from per_pr pp), 0),
    (select count(*) from per_pr pp where pp.avute > 0)::int,
    (select count(*) from per_pr pp where pp.deve - pp.portati > 0)::int;
end;
$$;

grant execute on function public.admin_pr_cruscotto(uuid) to authenticated;


-- Le vendite divise per fascia: su Evently era "Donne / Uomini".
create or replace function public.admin_pr_per_fascia(p_event uuid)
returns table (label text, prezzo numeric, vendute int, incasso numeric, stock int, rimaste int)
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
    select t.label, t.price,
           coalesce(v.n, 0)::int,
           coalesce(v.tot, 0),
           t.stock,
           case when t.stock is null then null::int
                else (t.stock - coalesce(v.n, 0))::int end
    from public.event_tiers t
    left join lateral (
      select count(*) as n, sum(ps.prezzo) as tot
      from public.presales ps
      where ps.tier_id = t.id and ps.stato <> 'annullata'
    ) v on true
    where t.event_id = p_event
    order by t.sort, t.label;
end;
$$;

grant execute on function public.admin_pr_per_fascia(uuid) to authenticated;


-- ============================================================
-- Controllo: adesso queste devono rispondere senza errori
-- ============================================================
select count(*) as "PR che il pannello vede"
from public.admin_pr_lista((select e.id from public.events e order by e.starts_at desc limit 1));
