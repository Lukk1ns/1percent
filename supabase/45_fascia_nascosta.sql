-- ============================================================
-- 45 · FASCIA NASCOSTA AI PR (8 ottobre 2026)
-- ============================================================
-- Caso nato con la serata di Nabi: una fascia unica "UOMO-DONNA"
-- a 15 €, con 29 biglietti già fatti. Luka vuole tornare a UOMO e
-- DONNA separati per sapere chi è chi, ma la vecchia non si può
-- togliere (i biglietti puntano lì) e il tetto non va bene: ai PR
-- comparirebbe l'avviso rosso "finite, paga in cassa".
--
-- Quindi: un interruttore sulla fascia. Nascosta = sparisce dalla
-- schermata di vendita (PR, manager e direzione) e il database
-- rifiuta ogni biglietto nuovo su di lei. I biglietti già fatti non
-- cambiano: restano validi, contati nel cruscotto, con la loro
-- etichetta. Si rimette visibile quando si vuole.
--
-- Si può rieseguire.
-- ============================================================


-- ------------------------------------------------------------
-- 1 · La colonna
-- ------------------------------------------------------------
alter table public.event_tiers
  add column if not exists nascosta boolean not null default false;


-- ------------------------------------------------------------
-- 2 · L'interruttore, solo per l'admin
-- ------------------------------------------------------------
create or replace function public.admin_tier_nascondi(p_tier uuid, p_nascosta boolean)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception 'Non autorizzato';
  end if;

  update public.event_tiers
     set nascosta = coalesce(p_nascosta, false)
   where id = p_tier;
end;
$$;

revoke execute on function public.admin_tier_nascondi(uuid, boolean) from public, anon;
grant execute on function public.admin_tier_nascondi(uuid, boolean) to authenticated;


-- ------------------------------------------------------------
-- 3 · Su una fascia nascosta non nasce nessun biglietto
-- ------------------------------------------------------------
-- Un controllo sulla tabella, come quello del numero WhatsApp (41):
-- non si tocca pr_vendi e vale anche per chi ha la pagina aperta da
-- prima, con il bottone vecchio ancora a schermo. Vale per tutti,
-- direzione compresa: la fascia è spenta e basta.
create or replace function public._presales_fascia_nascosta()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.tier_id is not null
     and exists (select 1 from public.event_tiers t
                 where t.id = new.tier_id and t.nascosta) then
    raise exception 'fascia_nascosta';
  end if;
  return new;
end;
$$;

revoke execute on function public._presales_fascia_nascosta() from public, anon, authenticated;

drop trigger if exists presales_fascia_nascosta on public.presales;
create trigger presales_fascia_nascosta
  before insert on public.presales
  for each row execute function public._presales_fascia_nascosta();


-- ------------------------------------------------------------
-- 4 · pr_fasce: identica a quella dello script 18, più "nascosta"
-- ------------------------------------------------------------
-- Ai PR (e ai manager) la fascia nascosta non arriva proprio.
-- All'admin arriva con nascosta = true: il pannello la deve vedere
-- per poterla riaccendere, la pagina di vendita la scarta.
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
  vendute      int,
  nascosta     boolean
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
           t.nascosta,
           coalesce(v.n, 0)::int as vendute,
           case when t.stock is null then null::int
                else (t.stock - coalesce(v.n, 0))::int end as rimaste
    from public.event_tiers t
    left join lateral (
      select count(*)::int as n from public.presales ps
      where ps.tier_id = t.id and ps.stato <> 'annullata'
    ) v on true
    where t.event_id = p_event
      and (v_admin or not t.nascosta)
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
         case when v_admin then s.vendute else null::int end,
         s.nascosta
  from stato s
  order by s.sort, s.label;
end;
$$;

grant execute on function public.pr_fasce(uuid) to authenticated;


-- ------------------------------------------------------------
-- Controllo (legge la tabella, non chiama funzioni protette):
-- deve uscire l'elenco delle fasce con la colonna nascosta = false.
-- ------------------------------------------------------------
select e.name as serata, t.label, t.price, t.nascosta
from public.event_tiers t
join public.events e on e.id = t.event_id
where e.starts_at > now() - interval '1 day'
order by e.starts_at, t.sort, t.label;
