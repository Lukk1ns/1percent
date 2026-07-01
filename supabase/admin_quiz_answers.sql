-- RPC per la dashboard admin: ritorna le risposte al quiz di tutti i membri.
-- Serve per il tab "Risposte" (leggere le domande aperte q3/q4).
-- Solo un admin (email in public.admins) può eseguirla.
--
-- COME APPLICARLA: incolla tutto questo nel SQL Editor di Supabase e premi Run.

create or replace function public.admin_quiz_answers()
returns table (
  id uuid,
  alias text,
  avatar_id text,
  member_number int,
  quiz_answers jsonb,
  created_at timestamptz
)
language plpgsql
security definer
set search_path = public
stable
as $$
begin
  if not public.is_admin() then
    raise exception 'not authorized';
  end if;

  return query
    select p.id, p.alias, p.avatar_id, p.member_number, p.quiz_answers, p.created_at
    from public.profiles p
    where p.deleted_at is null
    order by p.created_at desc;
end;
$$;

grant execute on function public.admin_quiz_answers() to authenticated;
