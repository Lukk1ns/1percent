-- PATCH DI SICUREZZA (2 luglio 2026)
--
-- Problemi trovati (tutti sfruttabili con la sola chiave anon pubblica, SENZA login):
--   1. admin_members()       -> restituiva alias + email di TUTTI gli iscritti (leak GDPR)
--   2. admin_delete_member() -> permetteva di CANCELLARE qualsiasi iscritto
--   3. admin_update_alias()  -> permetteva di RINOMINARE qualsiasi iscritto
--
-- Fix: ognuna ora richiede is_admin(). admin_members perde anche l'accesso al ruolo anon.
--
-- COME APPLICARLA: incolla tutto nel SQL Editor di Supabase e premi Run.

-- 1) Lettura membri (solo admin) -------------------------------------------
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

-- 2) Cancellazione membro (solo admin) -------------------------------------
create or replace function public.admin_delete_member(p_profile_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception 'Non autorizzato';
  end if;

  -- Soft-delete coerente con delete_my_profile (GDPR): anonimizza, libera
  -- l'alias e revoca il pass. Sparisce dalla lista (admin_members filtra
  -- deleted_at is null) senza rompere numeri membro / catena referral.
  update public.profiles
  set alias = 'cancellato_' || member_number,
      avatar_id = null,
      email = null,
      phone = null,
      quiz_answers = null,
      deleted_at = now()
  where id = p_profile_id;

  delete from public.passes where profile_id = p_profile_id;
end;
$$;

revoke execute on function public.admin_delete_member(uuid) from anon;
grant execute on function public.admin_delete_member(uuid) to authenticated;

-- 3) Modifica alias (solo admin) -------------------------------------------
create or replace function public.admin_update_alias(p_profile_id uuid, p_new_alias text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception 'Non autorizzato';
  end if;

  update public.profiles
  set alias = p_new_alias
  where id = p_profile_id;
end;
$$;

revoke execute on function public.admin_update_alias(uuid, text) from anon;
grant execute on function public.admin_update_alias(uuid, text) to authenticated;
