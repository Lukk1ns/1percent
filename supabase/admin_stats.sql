-- ============================================================
-- admin_stats() — riepilogo numeri per il tab "Statistiche"
-- della dashboard admin. Solo admin (is_admin()). Nessuna PII:
-- ritorna solo conteggi aggregati.
-- Eseguire una volta nel SQL Editor di Supabase.
-- ============================================================

create or replace function public.admin_stats()
returns jsonb
language plpgsql
security definer
set search_path = public
stable
as $$
declare
  v_today date := (now() at time zone 'Europe/Rome')::date;
begin
  if not public.is_admin() then
    raise exception 'Non autorizzato';
  end if;

  return jsonb_build_object(
    -- Iscritti attivi
    'total', (select count(*) from profiles where deleted_at is null),
    'today', (
      select count(*) from profiles
      where deleted_at is null
        and (created_at at time zone 'Europe/Rome')::date = v_today
    ),
    'yesterday', (
      select count(*) from profiles
      where deleted_at is null
        and (created_at at time zone 'Europe/Rome')::date = v_today - 1
    ),
    'last7', (
      select count(*) from profiles
      where deleted_at is null
        and (created_at at time zone 'Europe/Rome')::date > v_today - 7
    ),
    -- Qualità del profilo
    'with_email', (
      select count(*) from profiles
      where deleted_at is null and email is not null and email <> ''
    ),
    'with_photo', (
      select count(*) from profiles
      where deleted_at is null and photo_blur_path is not null
    ),
    'male', (select count(*) from profiles where deleted_at is null and gender = 'M'),
    'female', (select count(*) from profiles where deleted_at is null and gender = 'F'),
    -- Ingressi validati all'evento (QR scansionati)
    'checked_in', (
      select count(*) from passes p
      join profiles pr on pr.id = p.profile_id
      where p.status = 'checked_in' and pr.deleted_at is null
    ),
    -- Quanti sono arrivati tramite un invito
    'from_referral', (
      select count(*) from profiles
      where deleted_at is null and referred_by is not null
    ),
    -- Iscritti per giorno, ultimi 14 giorni (per il grafico)
    'daily', (
      select coalesce(jsonb_agg(
               jsonb_build_object('d', to_char(g.d, 'YYYY-MM-DD'), 'n', coalesce(c.n, 0))
               order by g.d
             ), '[]'::jsonb)
      from generate_series(v_today - 13, v_today, interval '1 day') g(d)
      left join (
        select (created_at at time zone 'Europe/Rome')::date as day, count(*) as n
        from profiles
        where deleted_at is null
        group by 1
      ) c on c.day = g.d::date
    ),
    -- Chi ha portato più gente (top 5)
    'top_referrers', (
      select coalesce(jsonb_agg(t), '[]'::jsonb)
      from (
        select jsonb_build_object('alias', r.alias, 'n', count(*)) as t
        from profiles p
        join profiles r on r.id = p.referred_by
        where p.deleted_at is null and r.deleted_at is null
        group by r.alias
        order by count(*) desc
        limit 5
      ) s
    )
  );
end;
$$;

revoke execute on function public.admin_stats() from anon;
grant execute on function public.admin_stats() to authenticated;
