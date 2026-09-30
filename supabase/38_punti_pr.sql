-- ============================================================
-- 38 · I PUNTI DEI PR
--
-- Luka, 30 settembre 2026: *"volevo lavorare sul profilo personale
-- dei pr... assegnargli 10 punti per ogni vendita fatta... e che ci
-- sia un ranking con stelline"*. Poi, scelta la grafica: *"le prime 3
-- stelle valgono 10 prev ciascuna e poi 25 e 35 la quarta e quinta"*.
--
-- Qui dentro non c'è nessun saldo da tenere aggiornato: i punti si
-- CONTANO ogni volta dai biglietti. Una vendita vale punti se:
--   · l'ha fatta un PR (`pr_id` pieno: la direzione e gli omaggi
--     non hanno un PR dietro, quindi restano fuori da soli);
--   · non è annullata (annullare un biglietto toglie i suoi punti);
--   · costa qualcosa (`prezzo > 0`: a zero euro è un omaggio).
--
-- Quanti punti vale una vendita e dove cadono le stelle lo decide il
-- sito (`lib/punti.ts`): per cambiare un gradino non si torna qui.
--
-- Chi vede cosa (deciso da Luka): il PR vede SOLO i suoi numeri, niente
-- classifica e niente posizione. La classifica la vede solo l'admin.
--
-- Da incollare nel SQL Editor di Supabase. Si può rieseguire.
-- ============================================================


-- ------------------------------------------------------------
-- IL PROFILO DEL PR: le sue vendite, in tutto e serata per serata.
-- Solo le sue: la funzione legge auth.uid() e nient'altro.
-- ------------------------------------------------------------
create or replace function public.pr_punti()
returns table (
  alias       text,
  numero      int,
  vendite     int,    -- da sempre, tutte le serate
  per_serata  jsonb   -- { "<event_id>": vendite }
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
    select p.alias, p.member_number,
           coalesce(s.tot, 0)::int,
           coalesce(s.per_serata, '{}'::jsonb)
    from public.profiles p
    left join lateral (
      select sum(x.n)::int as tot,
             jsonb_object_agg(x.event_id::text, x.n) as per_serata
      from (
        select ps.event_id, count(*)::int as n
        from public.presales ps
        where ps.pr_id = p.id
          and ps.stato <> 'annullata'
          and ps.prezzo > 0
        group by ps.event_id
      ) x
    ) s on true
    where p.id = auth.uid();
end;
$$;

grant execute on function public.pr_punti() to authenticated;


-- ------------------------------------------------------------
-- LA CLASSIFICA, solo per l'admin: tutta la crew, con le vendite da
-- sempre (le stelle) e quelle della serata scelta nel pannello.
-- ------------------------------------------------------------
create or replace function public.admin_pr_punti(p_event uuid default null)
returns table (
  pr_id           uuid,
  alias           text,
  nome            text,
  numero          int,
  vendite         int,  -- da sempre
  vendite_serata  int   -- solo p_event
)
language plpgsql
security definer
set search_path = public
stable
as $$
#variable_conflict use_column
begin
  if not public.is_admin() then
    raise exception 'Non autorizzato';
  end if;

  return query
    select p.id, p.alias, p.nome, p.member_number,
           coalesce(s.tot, 0)::int,
           coalesce(s.serata, 0)::int
    from public.profiles p
    left join lateral (
      select count(*)::int as tot,
             (count(*) filter (where ps.event_id = p_event))::int as serata
      from public.presales ps
      where ps.pr_id = p.id
        and ps.stato <> 'annullata'
        and ps.prezzo > 0
    ) s on true
    where p.role = 'crew' and p.deleted_at is null
    order by coalesce(s.tot, 0) desc, p.alias;
end;
$$;

grant execute on function public.admin_pr_punti(uuid) to authenticated;


-- ============================================================
-- Controllo: i dieci PR con più punti adesso (10 a vendita).
-- Se esce l'elenco, lo script è dentro.
-- ============================================================
select p.alias          as "pr",
       count(*) * 10    as "punti",
       count(*)         as "vendite valide"
from public.presales ps
join public.profiles p on p.id = ps.pr_id
where ps.stato <> 'annullata'
  and ps.prezzo > 0
group by p.alias
order by count(*) desc, p.alias
limit 10;
