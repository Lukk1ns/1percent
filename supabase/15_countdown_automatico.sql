-- ============================================================
-- 15 — IL COUNTDOWN PARTE ANCHE DA SOLO
--
-- Aggiunta chiesta da Luka il 22 settembre 2026: il tasto va bene, ma
-- "magari dormo e i PR continuano a vendere". Quindi:
--
--   · a mano   → Luka preme "ULTIME 13" quando vuole, ci sia o no un
--                tetto: da quel momento ne restano 13 e basta
--   · da solo  → se la fascia ha un tetto e si arriva alle ultime 13,
--                l'avviso parte da sé, anche alle quattro di notte
--
-- La soglia (13) è una sola per tutto e si cambia dal pannello.
--
-- Da incollare DOPO il 14. Si può rieseguire.
-- ============================================================

alter table public.prevendite_config
  add column if not exists soglia_countdown int not null default 13;


-- Quante ne devono restare perché l'avviso parta da solo.
create or replace function public.soglia_countdown()
returns int
language sql
security definer
set search_path = public
stable
as $$
  select coalesce((select c.soglia_countdown from public.prevendite_config c where c.id = 1), 13);
$$;

grant execute on function public.soglia_countdown() to authenticated;


create or replace function public.admin_set_soglia_countdown(p_soglia int)
returns text
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception 'Non autorizzato';
  end if;
  if p_soglia is null or p_soglia < 1 then
    return 'numero_non_valido';
  end if;

  update public.prevendite_config c
     set soglia_countdown = p_soglia, updated_at = now(),
         updated_by = (auth.jwt() ->> 'email')
   where c.id = 1;

  return 'ok';
end;
$$;

grant execute on function public.admin_set_soglia_countdown(int) to authenticated;


-- ------------------------------------------------------------
-- LE FASCE COME LE VEDE CHI GUARDA, versione 2
--
-- L'avviso è acceso se l'ha acceso Luka **oppure** se il tetto sta
-- per finire. Nel primo caso la scala parte dal numero che ha scelto
-- lui, nel secondo dalla soglia.
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
declare
  v_admin  boolean := public.is_admin();
  v_soglia int     := public.soglia_countdown();
begin
  if not public.is_pr() and not v_admin then
    raise exception 'Non autorizzato';
  end if;

  return query
  with calc as (
    select t.id, t.label, t.price, t.stock, t.countdown_on, t.countdown_base, t.sort,
           coalesce(v.n, 0)::int as vendute,
           case when t.stock is null then null::int
                else (t.stock - coalesce(v.n, 0))::int end as rimaste
    from public.event_tiers t
    left join lateral (
      select count(*)::int as n from public.presales ps
      where ps.tier_id = t.id and ps.stato <> 'annullata'
    ) v on true
    where t.event_id = p_event
  ),
  stato as (
    select c.*,
           -- acceso a mano, oppure il tetto è agli sgoccioli
           (c.countdown_on
            or (c.rimaste is not null and c.rimaste <= v_soglia)) as attivo,
           case when c.countdown_on then c.countdown_base else v_soglia end as base
    from calc c
  )
  select s.id, s.label, s.price,
         (s.rimaste is not null and s.rimaste <= 0),
         s.attivo,
         case when s.attivo
              then public.percentuale_countdown(s.base, coalesce(s.rimaste, s.base))
              else null::int end,
         -- i numeri veri restano all'admin: il PR non deve contare
         case when v_admin then s.stock   else null::int end,
         case when v_admin then s.rimaste else null::int end,
         case when v_admin then s.vendute else null::int end
  from stato s
  order by s.sort, s.label;
end;
$$;

grant execute on function public.pr_fasce(uuid) to authenticated;


-- ------------------------------------------------------------
-- Il pannello: come sopra, più "da solo o l'ho acceso io"
-- ------------------------------------------------------------
drop function if exists public.admin_pr_per_fascia(uuid);

create function public.admin_pr_per_fascia(p_event uuid)
returns table (
  id             uuid,
  label          text,
  prezzo         numeric,
  vendute        int,
  incasso        numeric,
  stock          int,
  rimaste        int,
  countdown_on   boolean,
  countdown_auto boolean,
  countdown_base int,
  percentuale    int
)
language plpgsql
security definer
set search_path = public
stable
as $$
declare v_soglia int := public.soglia_countdown();
begin
  if not public.is_admin() then
    raise exception 'Non autorizzato';
  end if;

  return query
  with calc as (
    select t.id, t.label, t.price, t.stock, t.countdown_on, t.countdown_base, t.sort,
           coalesce(v.n, 0)::int as vendute,
           coalesce(v.tot, 0) as incasso,
           case when t.stock is null then null::int
                else (t.stock - coalesce(v.n, 0))::int end as rimaste
    from public.event_tiers t
    left join lateral (
      select count(*)::int as n, sum(ps.prezzo) as tot
      from public.presales ps
      where ps.tier_id = t.id and ps.stato <> 'annullata'
    ) v on true
    where t.event_id = p_event
  )
  select c.id, c.label, c.price, c.vendute, c.incasso, c.stock, c.rimaste,
         c.countdown_on,
         -- partito da solo: c'è un tetto e siamo agli sgoccioli
         (not c.countdown_on and c.rimaste is not null and c.rimaste <= v_soglia),
         case when c.countdown_on then c.countdown_base else v_soglia end,
         case when c.countdown_on
                   or (c.rimaste is not null and c.rimaste <= v_soglia)
              then public.percentuale_countdown(
                     case when c.countdown_on then c.countdown_base else v_soglia end,
                     coalesce(c.rimaste, case when c.countdown_on then c.countdown_base else v_soglia end))
              else null::int end
  from calc c
  order by c.sort, c.label;
end;
$$;

grant execute on function public.admin_pr_per_fascia(uuid) to authenticated;


-- Il pannello deve poter leggere e cambiare la soglia.
drop function if exists public.prevendite_stato();

create function public.prevendite_stato()
returns table (
  aperta     boolean,
  vendite_on boolean,
  sono_pr    boolean,
  sono_admin boolean,
  soglia     int
)
language sql
security definer
set search_path = public
stable
as $$
  select c.aperta, c.vendite_on, public.is_pr(), public.is_admin(), c.soglia_countdown
  from public.prevendite_config c where c.id = 1;
$$;

grant execute on function public.prevendite_stato() to authenticated;


-- ============================================================
-- Controllo
-- ============================================================
select
  public.soglia_countdown() as "parte da solo quando ne restano";
