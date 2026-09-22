-- ============================================================
-- 18 — CHIUSURA DI DUE BUCHI  (controllo del 22 settembre 2026)
--
-- Trovati provando ad attaccare il sito da fuori, con la sola chiave
-- pubblica che chiunque può leggere nel browser.
--
--   1. `_pr_applica_credito` era chiamabile da CHIUNQUE. È la funzione
--      interna che attiva i biglietti quando arrivano i soldi. Il
--      `revoke ... from anon, authenticated` che c'era non bastava:
--      in Postgres una funzione nasce eseguibile da PUBLIC, e finché
--      non si toglie QUEL permesso il resto non conta.
--
--   2. LA PERCENTUALE DEL COUNTDOWN SI POTEVA RIBALTARE. `soglia_countdown()`
--      era pubblica e diceva "13"; sapendo che si parte da 13 e che la
--      scala è una riga dritta, da "91%" si ricavava "restano 5".
--      Esattamente quello che Luka non voleva: un PR che si calcola
--      quante prevendite mancano.
--
-- Cosa cambia per chi guarda: niente, se non che la percentuale adesso
-- si muove a scatti e ogni fascia ha il suo sfasamento, preso da un
-- seme segreto che sta nel database e non esce mai.
--
-- Da incollare nel SQL Editor. Si può rieseguire.
-- ============================================================


-- ------------------------------------------------------------
-- 1. La funzione interna torna interna
-- ------------------------------------------------------------
revoke execute on function public._pr_applica_credito(uuid, uuid, text)
  from public, anon, authenticated;


-- ------------------------------------------------------------
-- 2. Il seme segreto
--
-- Serve a sfasare la scala di ogni fascia in un modo che non si può
-- indovinare. Nasce a caso una volta sola e non esce da qui: le
-- funzioni che lo usano girano con i permessi del database, non con
-- quelli di chi chiama.
-- ------------------------------------------------------------
alter table public.prevendite_config
  add column if not exists countdown_seme text;

update public.prevendite_config
   set countdown_seme = gen_random_uuid()::text
 where id = 1 and (countdown_seme is null or countdown_seme = '');


-- Lo sfasamento di una fascia: da -3 a +3, sempre lo stesso per quella
-- fascia, diverso da fascia a fascia, impossibile da ricavare senza il seme.
create or replace function public.scarto_fascia(p_tier uuid)
returns int
language sql
security definer
set search_path = public
stable
as $$
  select (
    ('x' || substr(
       md5(coalesce((select c.countdown_seme from public.prevendite_config c where c.id = 1), 'x')
           || p_tier::text),
       1, 6)
    )::bit(24)::int % 7
  ) - 3;
$$;

revoke execute on function public.scarto_fascia(uuid) from public, anon, authenticated;


-- ------------------------------------------------------------
-- 3. La nuova scala
--
-- Prima: una riga dritta da 75 a 99, un gradino per ogni prevendita.
-- Adesso: la stessa salita, ma spostata dallo sfasamento della fascia
-- e arrotondata a scatti di 4. Due numeri vicini danno la stessa
-- percentuale, quindi anche chi indovinasse il punto di partenza
-- otterrebbe un "fra 4 e 6", mai "5".
-- ------------------------------------------------------------
drop function if exists public.percentuale_countdown(int, int);
drop function if exists public.percentuale_countdown(int, int, int);

create function public.percentuale_countdown(p_base int, p_rimaste int, p_scarto int default 0)
returns int
language sql
immutable
as $$
  select case
    when p_base is null  then null
    when p_rimaste <= 0  then 100
    when p_base <= 1     then 99
    else least(99, greatest(72,
      (round(
        (72 + ((p_base - least(p_rimaste, p_base))::numeric / (p_base - 1)) * 27 + p_scarto) / 4
      ) * 4)::int
    ))
  end;
$$;

revoke execute on function public.percentuale_countdown(int, int, int)
  from public, anon, authenticated;


-- ------------------------------------------------------------
-- 4. La soglia non si chiede più da fuori
-- ------------------------------------------------------------
revoke execute on function public.soglia_countdown() from public, anon, authenticated;


-- E `prevendite_stato` non la racconta a chi non è admin.
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
  select c.aperta, c.vendite_on, public.is_pr(), public.is_admin(),
         case when public.is_admin() then c.soglia_countdown else null::int end
  from public.prevendite_config c where c.id = 1;
$$;

grant execute on function public.prevendite_stato() to authenticated;


-- ------------------------------------------------------------
-- 5. Le due funzioni che mostrano le fasce, con lo sfasamento dentro
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
           (c.countdown_on
            or (c.rimaste is not null and c.rimaste <= v_soglia)) as attivo,
           case when c.countdown_on then c.countdown_base else v_soglia end as base
    from calc c
  )
  select s.id, s.label, s.price,
         (s.rimaste is not null and s.rimaste <= 0),
         s.attivo,
         case when s.attivo
              then public.percentuale_countdown(
                     s.base,
                     coalesce(s.rimaste, s.base),
                     public.scarto_fascia(s.id))
              else null::int end,
         case when v_admin then s.stock   else null::int end,
         case when v_admin then s.rimaste else null::int end,
         case when v_admin then s.vendute else null::int end
  from stato s
  order by s.sort, s.label;
end;
$$;

grant execute on function public.pr_fasce(uuid) to authenticated;


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
         (not c.countdown_on and c.rimaste is not null and c.rimaste <= v_soglia),
         case when c.countdown_on then c.countdown_base else v_soglia end,
         case when c.countdown_on or (c.rimaste is not null and c.rimaste <= v_soglia)
              then public.percentuale_countdown(
                     case when c.countdown_on then c.countdown_base else v_soglia end,
                     coalesce(c.rimaste, case when c.countdown_on then c.countdown_base else v_soglia end),
                     public.scarto_fascia(c.id))
              else null::int end
  from calc c
  order by c.sort, c.label;
end;
$$;

grant execute on function public.admin_pr_per_fascia(uuid) to authenticated;


-- Anche il pannello, quando accende il countdown, mostra la percentuale giusta.
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

  return query select 'ok'::text,
    public.percentuale_countdown(p_base, p_base, public.scarto_fascia(p_tier));
end;
$$;

grant execute on function public.admin_tier_countdown(uuid, int) to authenticated;


-- ============================================================
-- Controllo: la nuova scala, e quanto è diversa fra due fasce
-- ============================================================
select
  r as "ne restano",
  public.percentuale_countdown(13, r, -3) as "una fascia legge",
  public.percentuale_countdown(13, r,  2) as "un'altra legge"
from generate_series(13, 0, -1) as r;
