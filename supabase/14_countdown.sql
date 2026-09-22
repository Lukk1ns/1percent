-- ============================================================
-- 14 — IL COUNTDOWN DELLE ULTIME PREVENDITE
--
-- Chiesto da Luka il 22 settembre 2026.
--
-- Regola nuova: **il PR non deve sapere quante prevendite restano.**
-- Se sa che ne mancano 9, si organizza. Quindi le scorte residue
-- spariscono dalla sua schermata.
--
-- Quando Luka vuole mettere pressione, preme "ULTIME 13" su una fascia:
-- da quel momento, e solo da quel momento, ai PR compare un avviso con
-- una **percentuale** — "prevendite UOMO al 78%" — che sale man mano
-- che i biglietti partono. Dalla percentuale non si ricava il numero:
-- non sanno da quanti si è partiti né con che passo sale.
--
-- Come si muove: acceso il countdown con 13 pezzi, si parte dal 75% e
-- si arriva al 99% quando ne resta uno solo. Finiti, la fascia è chiusa
-- per i PR (Luka continua a vendere comunque: vedi il 10).
--
-- Da incollare nel SQL Editor. Si può rieseguire.
-- ============================================================

alter table public.event_tiers add column if not exists countdown_on   boolean not null default false;
alter table public.event_tiers add column if not exists countdown_base int;
alter table public.event_tiers add column if not exists countdown_at   timestamptz;


-- ------------------------------------------------------------
-- La percentuale: una funzione sola, così non si scrive due volte
-- ------------------------------------------------------------
create or replace function public.percentuale_countdown(p_base int, p_rimaste int)
returns int
language sql
immutable
as $$
  select case
    when p_base is null then null
    when p_rimaste <= 0 then 100
    when p_base <= 1    then 99
    else least(99, greatest(75,
      round(75 + ((p_base - least(p_rimaste, p_base))::numeric / (p_base - 1)) * 24)
    ))::int
  end;
$$;

grant execute on function public.percentuale_countdown(int, int) to authenticated;


-- ------------------------------------------------------------
-- Accendi il countdown su una fascia.
-- p_base = quante ne restano da adesso (il "13" del bottone).
-- Il tetto della fascia viene messo a: già vendute + p_base.
-- ------------------------------------------------------------
create or replace function public.admin_tier_countdown(p_tier uuid, p_base int)
returns table (esito text, percentuale int)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_vendute int;
  v_tier    record;
begin
  if not public.is_admin() then
    raise exception 'Non autorizzato';
  end if;

  select t.* into v_tier from public.event_tiers t where t.id = p_tier;
  if not found then
    return query select 'fascia_sconosciuta'::text, null::int; return;
  end if;

  if p_base is null or p_base < 1 then
    return query select 'numero_non_valido'::text, null::int; return;
  end if;

  select count(*) into v_vendute from public.presales ps
   where ps.tier_id = p_tier and ps.stato <> 'annullata';

  update public.event_tiers t
     set stock = v_vendute + p_base,
         countdown_on = true,
         countdown_base = p_base,
         countdown_at = now()
   where t.id = p_tier;

  return query select 'ok'::text, public.percentuale_countdown(p_base, p_base);
end;
$$;

grant execute on function public.admin_tier_countdown(uuid, int) to authenticated;


-- Spegni: via il countdown e via il tetto, si torna a vendere liberi.
create or replace function public.admin_tier_countdown_off(p_tier uuid)
returns text
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception 'Non autorizzato';
  end if;

  update public.event_tiers t
     set countdown_on = false,
         countdown_base = null,
         countdown_at = null,
         stock = null
   where t.id = p_tier;

  if not found then return 'non_trovato'; end if;
  return 'ok';
end;
$$;

grant execute on function public.admin_tier_countdown_off(uuid) to authenticated;


-- ------------------------------------------------------------
-- LE FASCE COME LE VEDE CHI GUARDA
--
-- Al PR arrivano nome, prezzo, se è esaurita e — solo a countdown
-- acceso — la percentuale. I numeri veri (tetto, quante restano)
-- escono **solo** se chi chiede è admin.
-- ------------------------------------------------------------
drop function if exists public.pr_fasce(uuid);

create function public.pr_fasce(p_event uuid)
returns table (
  id           uuid,
  label        text,
  price        numeric,
  esaurita     boolean,
  countdown_on boolean,
  percentuale  int,
  stock        int,
  rimaste      int,
  vendute      int
)
language plpgsql
security definer
set search_path = public
stable
as $$
declare v_admin boolean := public.is_admin();
begin
  if not public.is_pr() and not v_admin then
    raise exception 'Non autorizzato';
  end if;

  return query
    select t.id, t.label, t.price,
           -- esaurita: solo se c'è un tetto e l'ha raggiunto
           (t.stock is not null and (t.stock - coalesce(v.n, 0)) <= 0),
           t.countdown_on,
           case when t.countdown_on
                then public.percentuale_countdown(
                       t.countdown_base,
                       (coalesce(t.stock, 0) - coalesce(v.n, 0))::int)
                else null::int end,
           -- da qui in giù solo per l'admin: il PR non deve contare
           case when v_admin then t.stock else null::int end,
           case when v_admin and t.stock is not null
                then (t.stock - coalesce(v.n, 0))::int
                else null::int end,
           case when v_admin then coalesce(v.n, 0)::int else null::int end
    from public.event_tiers t
    left join lateral (
      select count(*)::int as n from public.presales ps
      where ps.tier_id = t.id and ps.stato <> 'annullata'
    ) v on true
    where t.event_id = p_event
    order by t.sort, t.label;
end;
$$;

grant execute on function public.pr_fasce(uuid) to authenticated;


-- ------------------------------------------------------------
-- Il pannello: la stessa cosa, ma con dentro anche l'id e i numeri,
-- perché da lì si accende e si spegne il countdown.
-- ------------------------------------------------------------
drop function if exists public.admin_pr_per_fascia(uuid);

create function public.admin_pr_per_fascia(p_event uuid)
returns table (
  id           uuid,
  label        text,
  prezzo       numeric,
  vendute      int,
  incasso      numeric,
  stock        int,
  rimaste      int,
  countdown_on boolean,
  countdown_base int,
  percentuale  int
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
    select t.id, t.label, t.price,
           coalesce(v.n, 0)::int,
           coalesce(v.tot, 0),
           t.stock,
           case when t.stock is null then null::int
                else (t.stock - coalesce(v.n, 0))::int end,
           t.countdown_on,
           t.countdown_base,
           case when t.countdown_on
                then public.percentuale_countdown(
                       t.countdown_base,
                       (coalesce(t.stock, 0) - coalesce(v.n, 0))::int)
                else null::int end
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
-- Controllo: come si muove la percentuale partendo da 13
-- ============================================================
select r as "ne restano", public.percentuale_countdown(13, r) as "il PR legge"
from generate_series(13, 0, -1) as r;
