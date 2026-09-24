-- ============================================================
-- 28 — CHI DIVENTA PR PARTE CON I SUOI BLOCCHETTI
--
-- Chiesto da Luka il 24 settembre 2026: *"ogni volta che attivo un PR
-- mettigli le prime 5 prevendite di default"*.
--
-- Prima, uno approvato restava a zero finché Luka non tornava nel
-- pannello a consegnargliele: nel frattempo apriva /pr, non vedeva
-- niente e scriveva "non mi funziona" — è successo davvero oggi.
--
-- SU QUALE SERATA. Le prevendite non esistono in astratto: esistono
-- per una serata. Le cinque vanno sulla **prossima serata in
-- programma** (la più vicina fra quelle non ancora passate). Se non
-- c'è nessuna serata futura non si consegna niente e la funzione lo
-- dice, invece di far finta.
-- Se ce n'è più d'una in parallelo (venerdì e sabato), le prime cinque
-- vanno solo sulla prima: le altre le decide Luka.
--
-- QUANTE. Cinque è il valore di partenza, ma sta nel database
-- (`prevendite_config.blocchetti_iniziali`) e si cambia dal pannello
-- senza toccare il codice. A zero, l'automatismo è spento.
--
-- NON RADDOPPIA: se quel PR ha già dei movimenti su quella serata, non
-- gliene aggiunge altri. Così riapprovare qualcuno non gli regala
-- blocchetti a ogni giro.
--
-- Da incollare nel SQL Editor. Si può rieseguire.
-- ============================================================


alter table public.prevendite_config
  add column if not exists blocchetti_iniziali int not null default 5;


-- ------------------------------------------------------------
-- La consegna automatica
-- ------------------------------------------------------------
-- Interna: la chiamano le due funzioni qui sotto, nessun altro.
-- Torna il numero consegnato (0 = non c'era niente da fare).
create or replace function public._pr_dotazione_iniziale(p_profile uuid)
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  v_quante int;
  v_event  uuid;
begin
  select coalesce(c.blocchetti_iniziali, 0) into v_quante
    from public.prevendite_config c where c.id = 1;

  if coalesce(v_quante, 0) <= 0 then
    return 0;
  end if;

  -- La prossima serata: la più vicina fra quelle che devono ancora
  -- succedere. Le passate non contano, consegnare lì non serve a niente.
  select e.id into v_event
    from public.events e
   where e.starts_at > now()
   order by e.starts_at
   limit 1;

  if v_event is null then
    return 0;
  end if;

  -- Ne ha già? Allora non si tocca niente: o gliele ha date Luka, o
  -- questa funzione è già passata di qui.
  if exists (
    select 1 from public.pr_allocations a
     where a.event_id = v_event and a.pr_id = p_profile
  ) then
    return 0;
  end if;

  insert into public.pr_allocations (event_id, pr_id, delta, nota, created_by)
  values (v_event, p_profile, v_quante, 'dotazione di partenza',
          coalesce(auth.jwt() ->> 'email', 'sistema'));

  return v_quante;
end;
$$;

revoke execute on function public._pr_dotazione_iniziale(uuid) from public, anon, authenticated;


-- ------------------------------------------------------------
-- Approva una candidatura → e gli consegna i blocchetti
-- ------------------------------------------------------------
-- Cambia quello che restituisce (prima niente, ora una frase da
-- mostrare a schermo), quindi prima si butta e si rifà.
drop function if exists public.admin_approve_crew(uuid);

create function public.admin_approve_crew(p_profile uuid)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_date  int;
  v_nome  text;
begin
  if not public.is_admin() then
    raise exception 'Non autorizzato';
  end if;

  update public.profiles
  set role                = 'crew',
      crew_since          = coalesce(crew_since, now()),
      crew_request_status = 'approvata',
      crew_decided_at     = now(),
      crew_decided_by     = auth.jwt() ->> 'email'
  where id = p_profile and deleted_at is null;

  perform public.log_admin('approva_crew', p_profile::text, null);

  v_date := public._pr_dotazione_iniziale(p_profile);

  if v_date > 0 then
    select e.name into v_nome
      from public.events e
     where e.starts_at > now()
     order by e.starts_at
     limit 1;
    return format('ok:%s:%s', v_date, coalesce(v_nome, 'la prossima serata'));
  end if;

  return 'ok:0:';
end;
$$;

revoke execute on function public.admin_approve_crew(uuid) from public, anon;
grant execute on function public.admin_approve_crew(uuid) to authenticated;


-- ------------------------------------------------------------
-- E anche quando lo promuovi a mano
-- ------------------------------------------------------------
-- `admin_set_role(profilo, 'crew')` è l'altra porta per diventare PR:
-- senza questo, chi passa di lì resterebbe a zero.
drop function if exists public.admin_set_role(uuid, text);

create function public.admin_set_role(p_profile uuid, p_role text)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare v_date int := 0;
begin
  if not public.is_admin() then
    raise exception 'Non autorizzato';
  end if;
  if p_role not in ('public', 'crew') then
    raise exception 'Ruolo non valido';
  end if;

  update public.profiles
  set role = p_role,
      crew_since = case when p_role = 'crew' then coalesce(crew_since, now()) else null end
  where id = p_profile;

  perform public.log_admin('cambia_ruolo', p_profile::text, jsonb_build_object('role', p_role));

  if p_role = 'crew' then
    v_date := public._pr_dotazione_iniziale(p_profile);
  end if;

  return format('ok:%s', v_date);
end;
$$;

revoke execute on function public.admin_set_role(uuid, text) from public, anon;
grant execute on function public.admin_set_role(uuid, text) to authenticated;


-- ------------------------------------------------------------
-- Quante ne riceve un nuovo PR: si legge e si cambia dal pannello
-- ------------------------------------------------------------
create or replace function public.admin_blocchetti_iniziali()
returns int
language plpgsql
security definer
set search_path = public
stable
as $$
declare v_n int;
begin
  if not public.is_admin() then
    raise exception 'Non autorizzato';
  end if;
  select c.blocchetti_iniziali into v_n from public.prevendite_config c where c.id = 1;
  return coalesce(v_n, 0);
end;
$$;

revoke execute on function public.admin_blocchetti_iniziali() from public, anon;
grant execute on function public.admin_blocchetti_iniziali() to authenticated;


create or replace function public.admin_set_blocchetti_iniziali(p_n int)
returns int
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception 'Non autorizzato';
  end if;
  if p_n < 0 or p_n > 200 then
    raise exception 'Metti un numero fra 0 e 200';
  end if;

  update public.prevendite_config set blocchetti_iniziali = p_n where id = 1;
  return p_n;
end;
$$;

revoke execute on function public.admin_set_blocchetti_iniziali(int) from public, anon;
grant execute on function public.admin_set_blocchetti_iniziali(int) to authenticated;


-- ============================================================
-- Controllo
-- ============================================================
-- Quante ne riceverà il prossimo PR approvato, e su quale serata.
select c.blocchetti_iniziali as "blocchetti di partenza",
       coalesce((select e.name from public.events e
                  where e.starts_at > now()
                  order by e.starts_at limit 1),
                'NESSUNA SERATA IN PROGRAMMA') as "andranno su"
  from public.prevendite_config c
 where c.id = 1;
