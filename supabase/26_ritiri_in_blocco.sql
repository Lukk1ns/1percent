-- ============================================================
-- 26 — RITIRARE I BLOCCHETTI, A UNO O A TUTTI
--
-- Chiesto da Luka il 24 settembre 2026: *"sul ritira prevendite anche
-- un tasto «ritira tutte», e poi un tasto generale che ritira
-- automaticamente tutte le prevendite ai PR — potrei usare quello
-- invece di disattivarle, nel caso decidessi di ritirare tutte e
-- lasciare solo qualche PR acceso"*.
--
-- Fino a ieri si ritirava a mano, cinque per volta. Con quindici PR a
-- fine serata sono trenta click e un errore garantito.
--
-- COSA NON CAMBIA: si ritira solo quello che il PR ha ancora **in
-- mano**, cioè i blocchetti non venduti. Le prevendite già fatte non
-- si toccano — né qui né altrove: quelle sono di chi le ha comprate.
-- E resta tutto scritto: ogni ritiro è una riga nel registro
-- (`pr_allocations`), col nome di chi l'ha fatto e quando, come ogni
-- altra consegna.
--
-- Da incollare nel SQL Editor. Si può rieseguire.
-- ============================================================


-- ------------------------------------------------------------
-- Ritira tutto a UN pr
-- ------------------------------------------------------------
-- Il conto di quante gliene restano lo fa il server, adesso: se nel
-- frattempo il PR ne ha venduta un'altra dal telefono, si ritira il
-- numero giusto invece di quello che era scritto sullo schermo.
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

  select coalesce((select sum(delta) from public.pr_allocations
                   where event_id = p_event and pr_id = p_pr), 0)
       - (select count(*) from public.presales
          where event_id = p_event and pr_id = p_pr and stato <> 'annullata')
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


-- ------------------------------------------------------------
-- Ritira tutto a TUTTI, tranne a chi dici tu
-- ------------------------------------------------------------
-- `p_tranne` è la lista di chi resta acceso: si ritira a tutti gli
-- altri in un colpo solo. È il modo di "chiudere le vendite" lasciando
-- lavorare due o tre persone, senza spegnere l'interruttore generale
-- (che fermerebbe anche loro).
--
-- Torna una riga per PR toccato, così il pannello può dire chi e
-- quanto invece di un "fatto" muto.
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
  r      record;
  v_chi  text := (auth.jwt() ->> 'email');
begin
  if not public.is_admin() then
    raise exception 'Non autorizzato';
  end if;

  for r in
    select p.id   as id_pr,
           p.alias as alias_pr,
           (coalesce((select sum(a.delta) from public.pr_allocations a
                      where a.event_id = p_event and a.pr_id = p.id), 0)
            - (select count(*) from public.presales s
               where s.event_id = p_event and s.pr_id = p.id
                 and s.stato <> 'annullata'))::int as residue
      from public.profiles p
     where p.role = 'crew'
       and p.deleted_at is null
       and not (p.id = any(coalesce(p_tranne, '{}'::uuid[])))
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
-- La lista dei PR, col numero di tessera
-- ------------------------------------------------------------
-- Serve per cercarli: *"dovrei avere anche un modo per cercare pr per
-- nome o numero al volo"*. Il numero è quello della tessera (#0055),
-- l'unica cosa che non cambia mai e che loro si ricordano.
-- Cambia la forma di quello che torna, quindi prima si butta e si rifà
-- — il resto è identico a 09_prevendite.
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


-- ============================================================
-- Controllo
-- ============================================================
-- Devono esserci tutte e tre. `admin_pr_lista` deve avere la colonna
-- `numero`: è quella che fa funzionare la ricerca nel pannello.
select p.proname as "funzione",
       pg_get_function_identity_arguments(p.oid) as "argomenti"
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
 where n.nspname = 'public'
   and p.proname in ('admin_pr_ritira_tutto', 'admin_pr_ritira_tutti', 'admin_pr_lista')
 order by 1;
