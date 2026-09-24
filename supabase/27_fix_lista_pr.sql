-- ============================================================
-- 27 — RIPARA LA LISTA DEI PR ("column reference pr_id is ambiguous")
--
-- Colpa mia, 24 settembre 2026. Per aggiungere il numero di tessera
-- alla lista dei PR (26) ho riscritto `admin_pr_lista` copiandola da
-- `09_prevendite.sql` — cioè dalla versione **vecchia**, quella che a
-- settembre era già stata corretta in `11_prevendite_fix.sql`. Così è
-- tornato il difetto che il 22 avevamo già pagato:
--
--   in una funzione `returns table (pr_id uuid, ...)` ogni colonna
--   dichiarata è anche una VARIABILE. Se dentro il corpo si scrive
--   `where pr_id = p.id` senza dire di quale tabella, Postgres non sa
--   se intendi la colonna o la variabile, e si ferma.
--
-- Effetto: il pannello `/admin/pr` si apriva sull'errore e non si
-- vedeva più nessun PR.
--
-- Qui la funzione torna com'era in `11_prevendite_fix.sql` — ogni
-- colonna scritta `tabella.colonna` — più la colonna `numero`.
-- E per lo stesso motivo viene rifatta anche `admin_pr_ritira_tutti`,
-- che ha `pr_id` e `alias` fra le colonne di ritorno: con
-- `#variable_conflict use_column` dentro le query vince sempre la
-- colonna, e l'ambiguità non si può più ripresentare.
--
-- Da incollare nel SQL Editor. Si può rieseguire.
-- ============================================================


-- ------------------------------------------------------------
-- La lista dei PR, col numero di tessera — scritta per esteso
-- ------------------------------------------------------------
drop function if exists public.admin_pr_lista(uuid);

create function public.admin_pr_lista(p_event uuid)
returns table (
  pr_id       uuid,
  alias       text,
  nome        text,
  email       text,
  numero      int,
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
#variable_conflict use_column
begin
  if not public.is_admin() then
    raise exception 'Non autorizzato';
  end if;

  return query
    select p.id, p.alias, p.nome, p.email, p.member_number,
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
-- Il ritiro generale, riscritto con la stessa prudenza
-- ------------------------------------------------------------
create or replace function public.admin_pr_ritira_tutti(
  p_event  uuid,
  p_tranne uuid[] default '{}'
)
returns table (pr_id uuid, alias text, ritirate int)
language plpgsql
security definer
set search_path = public
as $$
#variable_conflict use_column
declare
  r     record;
  v_chi text := (auth.jwt() ->> 'email');
begin
  if not public.is_admin() then
    raise exception 'Non autorizzato';
  end if;

  for r in
    select pf.id    as id_pr,
           pf.alias as alias_pr,
           (coalesce((select sum(al.delta) from public.pr_allocations al
                      where al.event_id = p_event and al.pr_id = pf.id), 0)
            - (select count(*) from public.presales ps
               where ps.event_id = p_event and ps.pr_id = pf.id
                 and ps.stato <> 'annullata'))::int as residue
      from public.profiles pf
     where pf.role = 'crew'
       and pf.deleted_at is null
       and not (pf.id = any(coalesce(p_tranne, '{}'::uuid[])))
     order by 3 desc
  loop
    if r.residue > 0 then
      insert into public.pr_allocations (event_id, pr_id, delta, nota, created_by)
      values (p_event, r.id_pr, -r.residue, 'ritiro generale', v_chi);

      pr_id    := r.id_pr;
      alias    := r.alias_pr;
      ritirate := r.residue;
      return next;
    end if;
  end loop;
end;
$$;

revoke execute on function public.admin_pr_ritira_tutti(uuid, uuid[]) from public, anon;
grant execute on function public.admin_pr_ritira_tutti(uuid, uuid[]) to authenticated;


-- ------------------------------------------------------------
-- E il ritiro singolo, con ogni colonna qualificata
-- ------------------------------------------------------------
create or replace function public.admin_pr_ritira_tutto(p_event uuid, p_pr uuid)
returns int
language plpgsql
security definer
set search_path = public
as $$
declare v_residue int;
begin
  if not public.is_admin() then
    raise exception 'Non autorizzato';
  end if;

  select coalesce((select sum(al.delta) from public.pr_allocations al
                   where al.event_id = p_event and al.pr_id = p_pr), 0)
       - (select count(*) from public.presales ps
          where ps.event_id = p_event and ps.pr_id = p_pr
            and ps.stato <> 'annullata')
  into v_residue;

  if v_residue <= 0 then
    return 0;
  end if;

  insert into public.pr_allocations (event_id, pr_id, delta, nota, created_by)
  values (p_event, p_pr, -v_residue, 'ritiro di tutti i blocchetti', (auth.jwt() ->> 'email'));

  return v_residue;
end;
$$;

revoke execute on function public.admin_pr_ritira_tutto(uuid, uuid) from public, anon;
grant execute on function public.admin_pr_ritira_tutto(uuid, uuid) to authenticated;


-- ============================================================
-- Controllo
-- ============================================================
-- Le tre funzioni devono esserci. La prova vera è aprire /admin/pr:
-- le RPC protette da is_admin() qui non si possono chiamare, perché il
-- SQL Editor esegue come padrone del database e non come utente del
-- sito (gotcha già scritto nel CLAUDE.md).
select p.proname as "funzione",
       pg_get_function_identity_arguments(p.oid) as "argomenti"
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
 where n.nspname = 'public'
   and p.proname in ('admin_pr_lista', 'admin_pr_ritira_tutto', 'admin_pr_ritira_tutti')
 order by 1;
