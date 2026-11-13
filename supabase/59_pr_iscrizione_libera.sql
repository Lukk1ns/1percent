-- ============================================================
-- 59 — I PR SI ISCRIVONO DA SOLI A UNA SERATA
--
-- Luka, 13 novembre 2026: *"adesso che ho creato un nuovo evento,
-- dovrei attivare ogni PR che me lo richiede. È possibile fare che
-- ogni PR approvato iscritto alla pagina abbia la possibilità di
-- auto-iscriversi all'evento e auto-aggiungersi le prime 5
-- prevendite... basta che sia una cosa facile e che non faccia
-- casini su altre funzioni"*.
--
-- COME FUNZIONA
--   · In /admin/pr, scheda PR, ogni serata ha l'interruttore
--     "iscrizione libera". Spento di serie: le serate di oggi non
--     cambiano finché Luka non lo accende.
--   · Acceso: ogni PR approvato (crew) trova la serata in "Le tue
--     prevendite" con il tasto "Iscriviti". Un tocco = agganciato a
--     quella serata (come se l'avesse fatto Luka dal pannello) + le
--     prevendite di partenza (`blocchetti_iniziali`, oggi 5).
--   · Chi Luka ha TOLTO da quella serata non rientra da solo: deve
--     parlarne con lui (si guarda il registro admin, `pr_sgancia`).
--   · Non raddoppia: se ha già avuto prevendite su quella serata,
--     non ne riceve altre. Doppio tocco = una sola consegna.
--   · Le feste staccate dai PR (liste omaggio, regola del 43/53/56)
--     restano staccate anche con l'interruttore acceso.
--
-- COSA NON TOCCA: nessuna funzione esistente viene riscritta. Una
-- tabella nuova + quattro funzioni nuove. Agganci, blocchetti, soldi,
-- porta, punti e manager lavorano come prima: l'iscrizione scrive le
-- stesse righe (`pr_serate`, `pr_allocations`) che scrive Luka.
--
-- Da incollare nel SQL Editor di Supabase. Si può rieseguire.
-- ============================================================


-- ------------------------------------------------------------
-- 1 · Le serate aperte all'iscrizione libera
-- ------------------------------------------------------------
-- Una riga = serata aperta. Niente riga = chiusa (di serie).
create table if not exists public.pr_iscrizione_libera (
  event_id   uuid primary key references public.events (id) on delete cascade on update cascade,
  created_at timestamptz not null default now(),
  created_by text
);

-- tutto chiuso: si passa solo dalle funzioni
alter table public.pr_iscrizione_libera enable row level security;


-- ------------------------------------------------------------
-- 2 · IL PANNELLO: vedere e cambiare l'interruttore
-- ------------------------------------------------------------
-- Torna se è aperta e quanti PR si sono iscritti da soli.
create or replace function public.admin_pr_iscrizione_libera(p_event uuid)
returns table (aperta boolean, da_soli int)
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
             where s.event_id = p_event and s.created_by like 'da solo%');
end;
$$;

revoke execute on function public.admin_pr_iscrizione_libera(uuid) from public, anon;
grant execute on function public.admin_pr_iscrizione_libera(uuid) to authenticated;


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
-- 3 · IL PR: le serate a cui può iscriversi
-- ------------------------------------------------------------
-- Aperte, ancora da fare, a cui non è già agganciato e da cui Luka
-- non l'ha tolto. `quante` = le prevendite che riceve iscrivendosi
-- (0 se su quella serata ne ha già avute).
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
  -- L'admin e gli account manager vendono già ovunque: per loro non
  -- c'è niente da iscrivere.
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
-- 4 · IL PR: "Iscriviti"
-- ------------------------------------------------------------
-- Torna:
--   'ok:<prevendite ricevute>'
--   'gia'      già agganciato (o account manager): niente da fare
--   'chiusa'   serata non aperta, passata, area PR chiusa, o festa
--              senza PR
--   'tolto'    Luka l'ha tolto da questa serata: deve sentire lui
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
                  where l.event_id = p_event and e.starts_at > now()) then
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

  -- L'aggancio. Con due tocchi di fila solo il primo inserisce la riga,
  -- e solo chi la inserisce consegna le prevendite.
  insert into public.pr_serate (pr_id, event_id, created_by)
  values (v_me, p_event, 'da solo: ' || coalesce(v_email, 'pr'))
  on conflict do nothing
  returning pr_id into v_nuovo;

  if v_nuovo is null then
    return 'gia';
  end if;

  -- Festa staccata dai PR (lista omaggio): l'aggancio non vale, si toglie.
  if not public._pr_agganciato(v_me, p_event) then
    delete from public.pr_serate s where s.pr_id = v_me and s.event_id = p_event;
    return 'chiusa';
  end if;

  -- Le prevendite di partenza, con le stesse regole dello script 28/39:
  -- quante dice il pannello, e mai se su questa serata ne ha già avute.
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
       case when l.event_id is null then 'spenta' else 'ACCESA' end as "iscrizione libera",
       (select c.blocchetti_iniziali from public.prevendite_config c where c.id = 1)
         as "prevendite a chi si iscrive"
  from public.events e
  left join public.pr_iscrizione_libera l on l.event_id = e.id
 where e.starts_at > now()
 order by e.starts_at;
