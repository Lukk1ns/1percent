-- ============================================================
-- 39 · OGNI PR VENDE SOLO PER LE SERATE A CUI È AGGANCIATO
--
-- Luka, 4 ottobre 2026: *"per evitare di farli vendere prevendite
-- sbagliato è bene che ogni PR abbia abilitato solo un evento per cui
-- vendere... se uno vende per 2 o più eventi lo deve sapere a parte ed
-- essere sempre approvato... i PR di adesso li abiliterei tutti solo
-- per Halloween... nella sezione dove sono elencati i PR devo potergli
-- agganciare uno o più eventi"*.
--
-- Fino a oggi un PR vedeva TUTTE le serate future e poteva vendere
-- ovunque avesse dei blocchetti. Da qui:
--
--   · `pr_serate` = gli agganci PR ↔ serata. Li mette e li toglie solo
--     l'admin, dall'elenco PR del pannello.
--   · il PR vede e vende solo le serate a cui è agganciato. Quelle a cui
--     è stato sganciato restano visibili se ci ha già venduto (i suoi
--     biglietti deve poterli rimandare), ma senza poter vendere.
--   · niente blocchetti a chi non è agganciato: né dall'admin, né dai
--     manager, né con "consegna a tutti".
--   · approvando un nuovo PR si sceglie la serata: lo aggancia lì e le
--     prevendite di partenza vanno lì.
--   · GLI ACCOUNT MANAGER restano liberi su tutte le serate (deciso da
--     Luka): per loro l'aggancio non serve. L'admin vende sempre.
--
-- PARTENZA: la prima volta che lo script gira (tabella vuota) tutti i
-- PR di oggi vengono agganciati a Halloween e a nient'altro. Rieseguirlo
-- dopo NON rimette gli agganci che Luka ha tolto.
--
-- Da incollare nel SQL Editor di Supabase. Si può rieseguire.
-- ============================================================


-- ------------------------------------------------------------
-- 1 · GLI AGGANCI
-- ------------------------------------------------------------
create table if not exists public.pr_serate (
  pr_id      uuid not null references public.profiles (id) on delete cascade,
  event_id   uuid not null references public.events (id) on delete cascade,
  created_at timestamptz not null default now(),
  created_by text,
  primary key (pr_id, event_id)
);

create index if not exists pr_serate_event_idx on public.pr_serate (event_id);

-- tutto chiuso: si passa solo dalle funzioni
alter table public.pr_serate enable row level security;


-- Partenza: solo se la tabella è ancora vuota.
insert into public.pr_serate (pr_id, event_id, created_by)
select p.id, e.id, 'partenza: tutti i PR su Halloween'
  from public.profiles p
  cross join public.events e
 where p.role = 'crew'
   and p.deleted_at is null
   and e.slug = 'halloween-2026'
   and not exists (select 1 from public.pr_serate)
on conflict do nothing;


-- Può lavorare su questa serata? Agganciato, oppure account manager.
-- Interna: la usano solo le funzioni qui sotto.
create or replace function public._pr_agganciato(p_pr uuid, p_event uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (select 1 from public.pr_serate s
                  where s.pr_id = p_pr and s.event_id = p_event)
      or exists (select 1 from public.account_managers m
                  where m.profile_id = p_pr and m.attivo);
$$;

revoke execute on function public._pr_agganciato(uuid, uuid) from public, anon, authenticated;


-- ------------------------------------------------------------
-- 2 · IL PANNELLO: vedere, mettere e togliere gli agganci
-- ------------------------------------------------------------
create or replace function public.admin_pr_serate()
returns table (pr_id uuid, event_id uuid)
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
  return query select s.pr_id, s.event_id from public.pr_serate s;
end;
$$;

revoke execute on function public.admin_pr_serate() from public, anon;
grant execute on function public.admin_pr_serate() to authenticated;


-- Aggancia (p_on = true) o sgancia un PR da una serata.
-- Torna 'ok:<prevendite che ha ancora in mano su quella serata>', così
-- sganciandolo il pannello avvisa se c'è da ritirargliele.
create or replace function public.admin_pr_aggancia(p_pr uuid, p_event uuid, p_on boolean)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare v_in_mano int;
begin
  if not public.is_admin() then
    raise exception 'Non autorizzato';
  end if;
  if not exists (select 1 from public.profiles p
                  where p.id = p_pr and p.role = 'crew' and p.deleted_at is null) then
    raise exception 'Questo non è un PR';
  end if;
  if not exists (select 1 from public.events e where e.id = p_event) then
    raise exception 'Serata sconosciuta';
  end if;

  if p_on then
    insert into public.pr_serate (pr_id, event_id, created_by)
    values (p_pr, p_event, auth.jwt() ->> 'email')
    on conflict do nothing;
  else
    delete from public.pr_serate s where s.pr_id = p_pr and s.event_id = p_event;
  end if;

  perform public.log_admin(case when p_on then 'pr_aggancia' else 'pr_sgancia' end,
                           p_pr::text, jsonb_build_object('event', p_event));

  select coalesce((select sum(al.delta) from public.pr_allocations al
                    where al.event_id = p_event and al.pr_id = p_pr), 0)
       - (select count(*) from public.presales ps
           where ps.event_id = p_event and ps.pr_id = p_pr and ps.stato <> 'annullata')
    into v_in_mano;

  return format('ok:%s', greatest(v_in_mano, 0));
end;
$$;

revoke execute on function public.admin_pr_aggancia(uuid, uuid, boolean) from public, anon;
grant execute on function public.admin_pr_aggancia(uuid, uuid, boolean) to authenticated;


-- ------------------------------------------------------------
-- 3 · IL PR VEDE SOLO LE SUE SERATE
-- ------------------------------------------------------------
-- Come nello script 31, più la colonna `puo_vendere`: una serata a cui
-- non è più agganciato resta in elenco se ci ha venduto, ma a sola
-- lettura.
drop function if exists public.pr_eventi();

create function public.pr_eventi()
returns table (
  event_id    uuid,
  nome        text,
  slug        text,
  locale      text,
  starts_at   timestamptz,
  cover_key   text,
  assegnate   int,
  vendute     int,
  residue     int,
  delega_url  text,
  puo_vendere boolean
)
language plpgsql
security definer
set search_path = public
stable
as $$
#variable_conflict use_column
declare
  v_admin boolean := public.is_admin();
begin
  if not public.is_pr() then
    raise exception 'Non autorizzato';
  end if;
  if not exists (select 1 from public.prevendite_config c where c.id = 1 and c.aperta)
     and not v_admin then
    raise exception 'Prevendite non ancora aperte';
  end if;

  return query
    select e.id, e.name, e.slug, v.name, e.starts_at, e.cover_key,
           coalesce(a.tot, 0)::int,
           coalesce(p.tot, 0)::int,
           (coalesce(a.tot, 0) - coalesce(p.tot, 0))::int,
           e.delega_url,
           (v_admin or public._pr_agganciato(auth.uid(), e.id))
    from public.events e
    left join public.venues v on v.id = e.venue_id
    left join lateral (
      select sum(al.delta)::int as tot
      from public.pr_allocations al
      where al.event_id = e.id and al.pr_id = auth.uid()
    ) a on true
    left join lateral (
      select count(*)::int as tot
      from public.presales ps
      where ps.event_id = e.id and ps.pr_id = auth.uid()
        and ps.stato <> 'annullata'
    ) p on true
    -- future: solo quelle a cui è agganciato (l'admin le vede tutte);
    -- qualsiasi serata dove ha già venduto o lavorato resta in elenco
    where (e.starts_at > now() and (v_admin or public._pr_agganciato(auth.uid(), e.id)))
       or coalesce(p.tot, 0) > 0
       or (e.starts_at <= now() and a.tot is not null)
    order by e.starts_at;
end;
$$;

grant execute on function public.pr_eventi() to authenticated;


-- ------------------------------------------------------------
-- 4 · LA VENDITA: senza aggancio non si vende
-- ------------------------------------------------------------
-- Identica allo script 16 (stessa firma, stesse risposte), con un
-- controllo in più: 'non_agganciato'.
create or replace function public.pr_vendi(
  p_event    uuid,
  p_tier     uuid,
  p_nome     text,
  p_cognome  text,
  p_anno     int,
  p_telefono text,
  p_forza    boolean default false
)
returns table (esito text, token text, prezzo numeric, minorenne boolean, under16 boolean)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_me       uuid    := auth.uid();
  v_admin    boolean := public.is_admin();
  v_tier     record;
  v_residue  int;
  v_rimaste  int;
  v_token    text;
begin
  if not public.is_pr() then
    raise exception 'Non autorizzato';
  end if;

  if not v_admin then
    if not exists (select 1 from public.prevendite_config c where c.id = 1 and c.aperta) then
      return query select 'chiuso'::text, null::text, null::numeric, null::boolean, null::boolean; return;
    end if;
    if not exists (select 1 from public.prevendite_config c where c.id = 1 and c.vendite_on) then
      return query select 'vendite_ferme'::text, null::text, null::numeric, null::boolean, null::boolean; return;
    end if;
    -- NUOVO: solo sulle serate a cui la direzione l'ha agganciato
    if not public._pr_agganciato(v_me, p_event) then
      return query select 'non_agganciato'::text, null::text, null::numeric, null::boolean, null::boolean; return;
    end if;
  end if;

  select t.* into v_tier from public.event_tiers t
   where t.id = p_tier and t.event_id = p_event;
  if not found then
    return query select 'fascia_sconosciuta'::text, null::text, null::numeric, null::boolean, null::boolean; return;
  end if;

  if coalesce(trim(p_nome), '') = '' or coalesce(trim(p_cognome), '') = '' then
    return query select 'dati_mancanti'::text, null::text, null::numeric, null::boolean, null::boolean; return;
  end if;

  -- Stessa persona, stessa serata: si ferma qui.
  -- L'admin può insistere (omonimi), il PR no.
  if not (v_admin and p_forza) then
    if exists (
      select 1 from public.presales ps
      where ps.event_id = p_event
        and ps.stato <> 'annullata'
        and lower(regexp_replace(ps.nome, '\s+', ' ', 'g'))
            = lower(regexp_replace(trim(p_nome), '\s+', ' ', 'g'))
        and lower(regexp_replace(ps.cognome, '\s+', ' ', 'g'))
            = lower(regexp_replace(trim(p_cognome), '\s+', ' ', 'g'))
    ) then
      return query select 'gia_presente'::text, null::text, null::numeric, null::boolean, null::boolean; return;
    end if;
  end if;

  if not v_admin then
    select coalesce((select sum(al.delta) from public.pr_allocations al
                     where al.event_id = p_event and al.pr_id = v_me), 0)
         - (select count(*) from public.presales ps
            where ps.event_id = p_event and ps.pr_id = v_me and ps.stato <> 'annullata')
    into v_residue;

    if v_residue <= 0 then
      return query select 'finite'::text, null::text, null::numeric, null::boolean, null::boolean; return;
    end if;

    if v_tier.stock is not null then
      select v_tier.stock - count(*) into v_rimaste from public.presales ps
        where ps.tier_id = v_tier.id and ps.stato <> 'annullata';
      if v_rimaste <= 0 then
        return query select 'fascia_esaurita'::text, null::text, null::numeric, null::boolean, null::boolean; return;
      end if;
    end if;
  end if;

  v_token := substr(md5(gen_random_uuid()::text || clock_timestamp()::text), 1, 20);

  insert into public.presales
    (event_id, pr_id, da_admin, nome, cognome, anno_nascita, telefono,
     tier_id, tier_label, prezzo, token, stato, attivata_at, attivata_da)
  values
    (p_event,
     case when v_admin then null else v_me end,
     v_admin,
     -- doppi spazi via: il confronto dei doppioni deve reggere nel tempo
     regexp_replace(trim(p_nome), '\s+', ' ', 'g'),
     regexp_replace(trim(p_cognome), '\s+', ' ', 'g'),
     p_anno, nullif(trim(p_telefono), ''),
     v_tier.id, v_tier.label, v_tier.price, v_token,
     case when v_admin then 'attiva' else 'in_attesa' end,
     case when v_admin then now() else null end,
     case when v_admin then 'direzione' else null end);

  if not v_admin then
    perform public._pr_applica_credito(p_event, v_me, 'automatico');
  end if;

  return query select 'ok'::text, v_token, v_tier.price,
                      ((extract(year from now())::int - p_anno) < 18),
                      ((extract(year from now())::int - p_anno) < 16);
end;
$$;

grant execute on function public.pr_vendi(uuid, uuid, text, text, int, text, boolean) to authenticated;


-- ------------------------------------------------------------
-- 5 · I BLOCCHETTI vanno solo a chi è agganciato
-- ------------------------------------------------------------
-- Admin, una persona (script 09): consegnare a chi non è agganciato
-- torna 'non_agganciato'. Ritirare si può sempre.
create or replace function public.admin_pr_assegna(
  p_event uuid,
  p_pr    uuid,
  p_delta int,
  p_nota  text default null
)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare v_residue int;
begin
  if not public.is_admin() then
    raise exception 'Non autorizzato';
  end if;
  if p_delta = 0 then
    return 'niente';
  end if;

  if p_delta > 0 and not public._pr_agganciato(p_pr, p_event) then
    return 'non_agganciato';
  end if;

  -- Non si ritira più di quello che ha ancora in mano.
  if p_delta < 0 then
    select coalesce((select sum(delta) from public.pr_allocations
                     where event_id = p_event and pr_id = p_pr), 0)
         - (select count(*) from public.presales
            where event_id = p_event and pr_id = p_pr and stato <> 'annullata')
    into v_residue;
    if v_residue + p_delta < 0 then
      return 'troppe';
    end if;
  end if;

  insert into public.pr_allocations (event_id, pr_id, delta, nota, created_by)
  values (p_event, p_pr, p_delta, nullif(trim(p_nota), ''), (auth.jwt() ->> 'email'));

  return 'ok';
end;
$$;

grant execute on function public.admin_pr_assegna(uuid, uuid, int, text) to authenticated;


-- Admin, "consegna a tutti" (script 29): tutti quelli agganciati alla serata.
create or replace function public.admin_pr_consegna_tutti(
  p_event       uuid,
  p_quante      int,
  p_solo_a_zero boolean default true
)
returns table (pr_id uuid, alias text, consegnate int)
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
  if p_quante is null or p_quante <= 0 then
    raise exception 'Quante gliene dai? Serve un numero maggiore di zero';
  end if;

  for r in
    select pf.id    as id_pr,
           pf.alias as alias_pr,
           coalesce((select sum(al.delta)::int from public.pr_allocations al
                     where al.event_id = p_event and al.pr_id = pf.id), 0) as gia_date
      from public.profiles pf
     where pf.role = 'crew'
       and pf.deleted_at is null
       and public._pr_agganciato(pf.id, p_event)
     order by pf.alias
  loop
    if (not p_solo_a_zero) or r.gia_date = 0 then
      insert into public.pr_allocations (event_id, pr_id, delta, nota, created_by)
      values (p_event, r.id_pr, p_quante, 'consegna a tutti', v_chi);

      pr_id      := r.id_pr;
      alias      := r.alias_pr;
      consegnate := p_quante;
      return next;
    end if;
  end loop;
end;
$$;

revoke execute on function public.admin_pr_consegna_tutti(uuid, int, boolean) from public, anon;
grant execute on function public.admin_pr_consegna_tutti(uuid, int, boolean) to authenticated;


-- Manager (script 32): consegna solo a PR agganciati. I manager stessi
-- lo sono sempre, quindi "anche a sé" continua a funzionare.
create or replace function public.am_consegna(
  p_event  uuid,
  p_pr     uuid,
  p_quante int,
  p_nota   text default null
)
returns int
language plpgsql
security definer
set search_path = public
as $$
declare v_io text := (auth.jwt() ->> 'email');
begin
  if not public.is_account_manager() then
    raise exception 'Non autorizzato';
  end if;
  if p_quante is null or p_quante <= 0 then
    raise exception 'Quante prevendite?';
  end if;
  if not exists (select 1 from public.profiles p
                  where p.id = p_pr and p.role = 'crew' and p.deleted_at is null) then
    raise exception 'Questo non è un PR';
  end if;
  if not public._pr_agganciato(p_pr, p_event) then
    raise exception 'Questo PR non lavora su questa serata: lo aggancia solo la direzione';
  end if;

  insert into public.pr_allocations (event_id, pr_id, delta, nota, created_by)
  values (p_event, p_pr, p_quante,
          coalesce(nullif(trim(p_nota), ''), 'consegna del manager'),
          coalesce(v_io, 'manager') || ' · manager');

  return coalesce((select sum(al.delta)::int from public.pr_allocations al
                    where al.event_id = p_event and al.pr_id = p_pr), 0);
end;
$$;

revoke execute on function public.am_consegna(uuid, uuid, int, text) from public, anon;
grant execute on function public.am_consegna(uuid, uuid, int, text) to authenticated;


-- ------------------------------------------------------------
-- 6 · LE LISTE DEI PR dicono chi è agganciato
-- ------------------------------------------------------------
-- Pannello (script 27) + colonna `agganciato`; gli agganciati in cima.
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
  mancante    numeric,
  agganciato  boolean
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
           coalesce(s.dovuto, 0) - coalesce(t.raccolto, 0),
           public._pr_agganciato(p.id, p_event)
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
    order by public._pr_agganciato(p.id, p_event) desc, coalesce(a.tot, 0) desc, p.alias;
end;
$$;

grant execute on function public.admin_pr_lista(uuid) to authenticated;


-- Manager (script 34) + colonna `agganciato`; gli agganciati in cima.
drop function if exists public.am_pr_lista(uuid);

create function public.am_pr_lista(p_event uuid)
returns table (
  pr_id      uuid,
  alias      text,
  nome       text,
  numero     int,
  telefono   text,
  vendute    int,
  in_mano    int,
  dovuto     numeric,
  raccolto   numeric,
  da_ritirare numeric,
  manager    boolean,
  sono_io    boolean,
  agganciato boolean
)
language plpgsql
security definer
set search_path = public
stable
as $$
#variable_conflict use_column
begin
  if not (public.is_account_manager() or public.is_admin()) then
    raise exception 'Non autorizzato';
  end if;

  return query
    select p.id, p.alias, p.nome, p.member_number, p.phone,
           coalesce(s.vendute, 0)::int,
           greatest(coalesce(a.tot, 0) - coalesce(s.vendute, 0), 0)::int,
           coalesce(s.dovuto, 0),
           coalesce(t.raccolto, 0),
           coalesce(s.dovuto, 0) - coalesce(t.raccolto, 0),
           exists (select 1 from public.account_managers m
                    where m.profile_id = p.id and m.attivo),
           p.id = auth.uid(),
           public._pr_agganciato(p.id, p_event)
    from public.profiles p
    left join lateral (
      select sum(al.delta)::int as tot
      from public.pr_allocations al
      where al.event_id = p_event and al.pr_id = p.id
    ) a on true
    left join lateral (
      select count(*) filter (where ps.stato <> 'annullata') as vendute,
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
    order by public._pr_agganciato(p.id, p_event) desc,
             (coalesce(s.dovuto, 0) - coalesce(t.raccolto, 0)) desc,
             coalesce(s.vendute, 0) desc, p.alias;
end;
$$;

revoke execute on function public.am_pr_lista(uuid) from public, anon;
grant execute on function public.am_pr_lista(uuid) to authenticated;


-- ------------------------------------------------------------
-- 7 · APPROVARE UN PR = SCEGLIERE LA SUA SERATA
-- ------------------------------------------------------------
-- Prevendite di partenza (script 28) ora su una serata precisa.
drop function if exists public._pr_dotazione_iniziale(uuid);

create or replace function public._pr_dotazione_iniziale(p_profile uuid, p_event uuid)
returns int
language plpgsql
security definer
set search_path = public
as $$
declare v_quante int;
begin
  select coalesce(c.blocchetti_iniziali, 0) into v_quante
    from public.prevendite_config c where c.id = 1;

  if coalesce(v_quante, 0) <= 0 or p_event is null then
    return 0;
  end if;

  -- Ne ha già su quella serata? Non si tocca niente.
  if exists (select 1 from public.pr_allocations a
              where a.event_id = p_event and a.pr_id = p_profile) then
    return 0;
  end if;

  insert into public.pr_allocations (event_id, pr_id, delta, nota, created_by)
  values (p_event, p_profile, v_quante, 'dotazione di partenza',
          coalesce(auth.jwt() ->> 'email', 'sistema'));

  return v_quante;
end;
$$;

revoke execute on function public._pr_dotazione_iniziale(uuid, uuid) from public, anon, authenticated;


-- La prossima serata in programma (se all'approvazione non ne arriva una).
create or replace function public._prossima_serata()
returns uuid
language sql
security definer
set search_path = public
stable
as $$
  select e.id from public.events e where e.starts_at > now() order by e.starts_at limit 1;
$$;

revoke execute on function public._prossima_serata() from public, anon, authenticated;


-- Approva una candidatura: diventa PR, si aggancia alla serata scelta e
-- riceve lì le prevendite di partenza. Torna 'ok:<quante>:<serata>'.
-- Senza serata (pannello vecchio ancora aperto) usa la prossima.
drop function if exists public.admin_approve_crew(uuid);

create or replace function public.admin_approve_crew(p_profile uuid, p_event uuid default null)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_event uuid := coalesce(p_event, public._prossima_serata());
  v_date  int  := 0;
  v_nome  text;
begin
  if not public.is_admin() then
    raise exception 'Non autorizzato';
  end if;
  if p_event is not null and not exists (select 1 from public.events e where e.id = p_event) then
    raise exception 'Serata sconosciuta';
  end if;

  update public.profiles
  set role                = 'crew',
      crew_since          = coalesce(crew_since, now()),
      crew_request_status = 'approvata',
      crew_decided_at     = now(),
      crew_decided_by     = auth.jwt() ->> 'email'
  where id = p_profile and deleted_at is null;

  perform public.log_admin('approva_crew', p_profile::text,
                           jsonb_build_object('event', v_event));

  if v_event is null then
    return 'ok:0:';
  end if;

  insert into public.pr_serate (pr_id, event_id, created_by)
  values (p_profile, v_event, auth.jwt() ->> 'email')
  on conflict do nothing;

  v_date := public._pr_dotazione_iniziale(p_profile, v_event);
  select e.name into v_nome from public.events e where e.id = v_event;
  return format('ok:%s:%s', v_date, coalesce(v_nome, 'la serata scelta'));
end;
$$;

revoke execute on function public.admin_approve_crew(uuid, uuid) from public, anon;
grant execute on function public.admin_approve_crew(uuid, uuid) to authenticated;


-- Promuovere o togliere a mano (script 28). Tolto dalla crew, perde
-- anche gli agganci: se torna, si riparte da zero.
drop function if exists public.admin_set_role(uuid, text);

create or replace function public.admin_set_role(p_profile uuid, p_role text, p_event uuid default null)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_date  int := 0;
  v_event uuid := coalesce(p_event, public._prossima_serata());
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
    if v_event is not null then
      insert into public.pr_serate (pr_id, event_id, created_by)
      values (p_profile, v_event, auth.jwt() ->> 'email')
      on conflict do nothing;
      v_date := public._pr_dotazione_iniziale(p_profile, v_event);
    end if;
  else
    delete from public.pr_serate s where s.pr_id = p_profile;
  end if;

  return format('ok:%s', v_date);
end;
$$;

revoke execute on function public.admin_set_role(uuid, text, uuid) from public, anon;
grant execute on function public.admin_set_role(uuid, text, uuid) to authenticated;


-- ============================================================
-- Controllo: quanti PR sono agganciati a ogni serata futura
-- ============================================================
select e.name as serata,
       e.starts_at::date as data,
       (select count(*) from public.pr_serate s where s.event_id = e.id) as "PR agganciati",
       (select count(*) from public.profiles p
         where p.role = 'crew' and p.deleted_at is null) as "PR in tutto"
  from public.events e
 where e.starts_at > now()
 order by e.starts_at;
