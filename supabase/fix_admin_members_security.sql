-- PATCH DI SICUREZZA (2 luglio 2026)
-- Problema: admin_members() restituiva alias + email di TUTTI gli iscritti a
-- chiunque avesse la chiave anon pubblica (dentro il sito), SENZA login admin.
-- Fix: aggiunge il controllo is_admin() e toglie l'esecuzione al ruolo anon.
--
-- COME APPLICARLA: incolla tutto nel SQL Editor di Supabase e premi Run.

create or replace function public.admin_members()
returns table (
  id uuid,
  alias text,
  avatar_id text,
  member_number int,
  created_at timestamptz,
  email text
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
    select p.id, p.alias, p.avatar_id, p.member_number, p.created_at, p.email
    from public.profiles p
    where p.deleted_at is null
    order by p.created_at desc;
end;
$$;

revoke execute on function public.admin_members() from anon;
grant execute on function public.admin_members() to authenticated;
