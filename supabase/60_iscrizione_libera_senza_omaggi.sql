-- ============================================================
-- 60 — ISCRIZIONE LIBERA: MAI SULLE SERATE CON LISTA OMAGGIO
--
-- Luka, 13 novembre 2026, dopo il 59: *"le date free entry o
-- iscrizioni shot non dovresti neanche metterle lì a scelta per i
-- PR"*.
--
-- Una serata con una lista omaggio (donna omaggio, shot omaggio:
-- `omaggio_liste`) non si apre all'iscrizione libera:
--   · nel pannello l'interruttore non compare (`omaggio = true`);
--   · se era acceso, si spegne qui sotto;
--   · i PR non la vedono fra le "serate aperte" e `pr_iscriviti`
--     risponde 'chiusa'.
-- Gli agganci fatti a mano da Luka su quelle serate NON cambiano:
-- questo tocca solo l'iscrizione libera del 59.
--
-- Da incollare nel SQL Editor dopo il 59. Si può rieseguire.
-- ============================================================


-- Se qualcuna era già aperta, si chiude.
delete from public.pr_iscrizione_libera l
 where exists (select 1 from public.omaggio_liste ol where ol.event_id = l.event_id);


-- ------------------------------------------------------------
-- Pannello: lo stato dice anche se la serata ha una lista omaggio
-- (cambia forma: si butta e si rifà)
-- ------------------------------------------------------------
drop function if exists public.admin_pr_iscrizione_libera(uuid);

create function public.admin_pr_iscrizione_libera(p_event uuid)
returns table (aperta boolean, da_soli int, omaggio boolean)
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
    select exists (select 1 from public.pr_iscrizione_libera l where l.event_id = p_event),
           (select count(*)::int from public.pr_serate s
             where s.event_id = p_event and s.created_by like 'da solo%'),
           exists (select 1 from public.omaggio_liste ol where ol.event_id = p_event);
end;
$$;

revoke execute on function public.admin_pr_iscrizione_libera(uuid) from public, anon;
grant execute on function public.admin_pr_iscrizione_libera(uuid) to authenticated;


-- Accendere su una serata con lista omaggio → 'omaggio', non fa niente.
create or replace function public.admin_set_pr_iscrizione_libera(p_event uuid, p_on boolean)
returns text
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception 'Non autorizzato';
  end if;
  if not exists (select 1 from public.events e where e.id = p_event) then
    raise exception 'Serata sconosciuta';
  end if;

  if p_on then
    if exists (select 1 from public.omaggio_liste ol where ol.event_id = p_event) then
      return 'omaggio';
    end if;
    insert into public.pr_iscrizione_libera (event_id, created_by)
    values (p_event, auth.jwt() ->> 'email')
    on conflict (event_id) do nothing;
  else
    delete from public.pr_iscrizione_libera l where l.event_id = p_event;
  end if;

  perform public.log_admin(case when p_on then 'pr_iscrizione_libera_on'
                                else 'pr_iscrizione_libera_off' end,
                           p_event::text, null);
  return 'ok';
end;
$$;

revoke execute on function public.admin_set_pr_iscrizione_libera(uuid, boolean) from public, anon;
grant execute on function public.admin_set_pr_iscrizione_libera(uuid, boolean) to authenticated;


-- ------------------------------------------------------------
-- PR: le serate aperte (come il 59, senza quelle con lista omaggio)
-- ------------------------------------------------------------
create or replace function public.pr_serate_libere()
returns table (
  event_id  uuid,
  nome      text,
  locale    text,
  starts_at timestamptz,
  quante    int
)
language plpgsql
security definer
set search_path = public
stable
as $$
#variable_conflict use_column
declare
  v_me     uuid := auth.uid();
  v_quante int;
begin
  if not public.is_pr() or public.is_admin()
     or exists (select 1 from public.account_managers m
                 where m.profile_id = v_me and m.attivo) then
    return;
  end if;
  if not exists (select 1 from public.prevendite_config c where c.id = 1 and c.aperta) then
    return;
  end if;

  select greatest(coalesce(c.blocchetti_iniziali, 0), 0) into v_quante
    from public.prevendite_config c where c.id = 1;

  return query
    select e.id, e.name, v.name, e.starts_at,
           case when exists (select 1 from public.pr_allocations a
                              where a.event_id = e.id and a.pr_id = v_me)
                then 0 else coalesce(v_quante, 0) end
      from public.pr_iscrizione_libera l
      join public.events e on e.id = l.event_id
      left join public.venues v on v.id = e.venue_id
     where e.starts_at > now()
       and not exists (select 1 from public.omaggio_liste ol where ol.event_id = e.id)
       and not public._pr_agganciato(v_me, e.id)
       and not exists (select 1 from public.pr_serate s
                        where s.pr_id = v_me and s.event_id = e.id)
       and not exists (select 1 from public.admin_log g
                        where g.action = 'pr_sgancia'
                          and g.target = v_me::text
                          and g.payload ->> 'event' = e.id::text)
     order by e.starts_at;
end;
$$;

revoke execute on function public.pr_serate_libere() from public, anon;
grant execute on function public.pr_serate_libere() to authenticated;


-- ------------------------------------------------------------
-- PR: "Iscriviti" (come il 59, con la serata omaggio = 'chiusa')
-- ------------------------------------------------------------
create or replace function public.pr_iscriviti(p_event uuid)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_me     uuid := auth.uid();
  v_email  text := auth.jwt() ->> 'email';
  v_quante int  := 0;
  v_nuovo  uuid;
begin
  if not public.is_pr() then
    raise exception 'Non autorizzato';
  end if;

  if not exists (select 1 from public.prevendite_config c where c.id = 1 and c.aperta) then
    return 'chiusa';
  end if;

  if not exists (select 1 from public.pr_iscrizione_libera l
                   join public.events e on e.id = l.event_id
                  where l.event_id = p_event and e.starts_at > now())
     or exists (select 1 from public.omaggio_liste ol where ol.event_id = p_event) then
    return 'chiusa';
  end if;

  if public._pr_agganciato(v_me, p_event)
     or exists (select 1 from public.pr_serate s
                 where s.pr_id = v_me and s.event_id = p_event) then
    return 'gia';
  end if;

  if exists (select 1 from public.admin_log g
              where g.action = 'pr_sgancia'
                and g.target = v_me::text
                and g.payload ->> 'event' = p_event::text) then
    return 'tolto';
  end if;

  insert into public.pr_serate (pr_id, event_id, created_by)
  values (v_me, p_event, 'da solo: ' || coalesce(v_email, 'pr'))
  on conflict do nothing
  returning pr_id into v_nuovo;

  if v_nuovo is null then
    return 'gia';
  end if;

  if not public._pr_agganciato(v_me, p_event) then
    delete from public.pr_serate s where s.pr_id = v_me and s.event_id = p_event;
    return 'chiusa';
  end if;

  select greatest(coalesce(c.blocchetti_iniziali, 0), 0) into v_quante
    from public.prevendite_config c where c.id = 1;

  if coalesce(v_quante, 0) > 0
     and not exists (select 1 from public.pr_allocations a
                      where a.event_id = p_event and a.pr_id = v_me) then
    insert into public.pr_allocations (event_id, pr_id, delta, nota, created_by)
    values (p_event, v_me, v_quante, 'dotazione di partenza · iscritto da solo',
            coalesce(v_email, 'pr'));
  else
    v_quante := 0;
  end if;

  perform public.log_admin('pr_iscritto_da_solo', v_me::text,
                           jsonb_build_object('event', p_event, 'prevendite', v_quante));

  return format('ok:%s', v_quante);
end;
$$;

revoke execute on function public.pr_iscriviti(uuid) from public, anon;
grant execute on function public.pr_iscriviti(uuid) to authenticated;


-- ------------------------------------------------------------
-- Controllo: le serate future e se sono aperte
-- ------------------------------------------------------------
select e.name as "serata",
       to_char(e.starts_at at time zone 'Europe/Rome', 'DD/MM HH24:MI') as "quando",
       case when exists (select 1 from public.omaggio_liste ol where ol.event_id = e.id)
              then 'mai (free entry / shot)'
            when l.event_id is null then 'spenta'
            else 'ACCESA' end as "iscrizione libera"
  from public.events e
  left join public.pr_iscrizione_libera l on l.event_id = e.id
 where e.starts_at > now()
 order by e.starts_at;
