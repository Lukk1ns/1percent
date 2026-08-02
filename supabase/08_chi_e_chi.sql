-- ============================================================
-- 08 — NELLA DASHBOARD SI VEDE CHI È CLIENTE E CHI STAFF
--
-- Finora la lista dei membri mandava solo alias, numero, email e data:
-- non c'era modo di sapere, guardando l'elenco, chi si era iscritto per
-- venire alle serate e chi per lavorarci.
--
-- Qui aggiungiamo tre informazioni che nel database ci sono già:
--   · role                → 'crew' se approvato, altrimenti 'public'
--   · crew_request_status → 'nessuna' / 'in_attesa' / 'approvata' / 'rifiutata'
--   · nome                → il nome vero, che lasciano solo i candidati
-- e chi l'ha portato, che era comodo averlo lì.
--
-- La funzione cambia forma (colonne in più), quindi va prima eliminata:
-- Postgres non sa cambiare il risultato di una funzione già esistente.
-- Il resto è identico, controllo di sicurezza compreso.
--
-- Da incollare nel SQL Editor di Supabase. Si può rieseguire.
-- ============================================================

drop function if exists public.admin_members();

create function public.admin_members()
returns table (
  id                  uuid,
  alias               text,
  avatar_id           text,
  member_number       int,
  created_at          timestamptz,
  email               text,
  role                text,
  crew_request_status text,
  nome                text,
  invitato_da         text
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
    select p.id, p.alias, p.avatar_id, p.member_number, p.created_at, p.email,
           p.role, p.crew_request_status, p.nome, r.alias
    from public.profiles p
    left join public.profiles r on r.id = p.referred_by
    where p.deleted_at is null
    order by p.created_at desc;
end;
$$;

revoke execute on function public.admin_members() from anon;
grant execute on function public.admin_members() to authenticated;


-- ============================================================
-- Controllo: quanti sono, divisi per come sono entrati
-- ============================================================

select
  case
    when role = 'crew'                        then '1 · staff approvato'
    when crew_request_status = 'in_attesa'    then '2 · si è candidato, da decidere'
    when crew_request_status = 'rifiutata'    then '3 · candidatura rifiutata'
    else                                           '4 · cliente'
  end as tipo,
  count(*)
from public.profiles
where deleted_at is null
group by 1
order by 1;
