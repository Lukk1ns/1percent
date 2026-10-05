-- ============================================================
-- 40 — L'INGRESSO DEL PR: UN NUMERO PER OGNI SERATA
--
-- Chiesto da Luka il 5 ottobre 2026: l'ingresso omaggio al PR che ha
-- venduto UNA prevendita "va bene per la domenica, ma per Halloween
-- sono 10 mentre per LIL NAAY 5".
--
-- Fino a ieri il numero era uno solo per tutte le serate
-- (`prevendite_config.ingresso_soglia`, script 30): cambiarlo per la
-- domenica lo cambiava anche per Halloween.
--
-- COME FUNZIONA ADESSO
--   · Ogni serata ha il suo numero (tabella `pr_ingresso_soglie`).
--   · Una serata senza numero suo usa quello di serie, che resta in
--     `prevendite_config.ingresso_soglia` e qui viene rimesso a 10
--     (la regola di partenza): così una serata nuova non regala
--     l'ingresso a una prevendita sola senza che nessuno l'abbia deciso.
--   · Il resto non cambia: si conta il venduto, l'eccezione a mano
--     resta, il pass vale una volta sola.
--
-- Valori di partenza (solo se la serata non ne ha già uno):
--   DAY-OFF (domenica 18/10) → 1 · LIL NAAY (24/10) → 5 · Halloween → 10
--
-- Da incollare nel SQL Editor. Si può rieseguire: non tocca i numeri
-- già cambiati dal pannello.
-- ============================================================


-- ------------------------------------------------------------
-- 1 · Il numero di ogni serata
-- ------------------------------------------------------------
create table if not exists public.pr_ingresso_soglie (
  event_id    uuid primary key references public.events (id) on delete cascade,
  soglia      int  not null check (soglia between 0 and 500),
  cambiato_da text,
  cambiato_at timestamptz not null default now()
);

alter table public.pr_ingresso_soglie enable row level security;
-- Nessuna policy: si passa solo dalle funzioni qui sotto.


-- Quante ne servono per questa serata. Interna.
create or replace function public._ingresso_soglia(p_event uuid)
returns int
language sql
security definer
set search_path = public
stable
as $$
  select coalesce(
    (select s.soglia from public.pr_ingresso_soglie s where s.event_id = p_event),
    (select c.ingresso_soglia from public.prevendite_config c where c.id = 1),
    10
  );
$$;

revoke execute on function public._ingresso_soglia(uuid) from public, anon, authenticated;


-- ------------------------------------------------------------
-- 2 · Il pannello: leggere e cambiare il numero della serata
-- ------------------------------------------------------------
create or replace function public.admin_ingresso_soglia_serata(p_event uuid)
returns int
language plpgsql
security definer
set search_path = public
stable
as $$
begin
  if not public.is_admin() then
    raise exception 'Non autorizzato';
  end if;
  return public._ingresso_soglia(p_event);
end;
$$;

revoke execute on function public.admin_ingresso_soglia_serata(uuid) from public, anon;
grant execute on function public.admin_ingresso_soglia_serata(uuid) to authenticated;


create or replace function public.admin_set_ingresso_soglia_serata(p_event uuid, p_n int)
returns int
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception 'Non autorizzato';
  end if;
  if p_n is null or p_n < 0 or p_n > 500 then
    raise exception 'Metti un numero fra 0 e 500';
  end if;
  if not exists (select 1 from public.events e where e.id = p_event) then
    raise exception 'Serata non trovata';
  end if;

  insert into public.pr_ingresso_soglie (event_id, soglia, cambiato_da, cambiato_at)
  values (p_event, p_n, auth.jwt() ->> 'email', now())
  on conflict (event_id) do update
    set soglia      = excluded.soglia,
        cambiato_da = excluded.cambiato_da,
        cambiato_at = excluded.cambiato_at;

  return p_n;
end;
$$;

revoke execute on function public.admin_set_ingresso_soglia_serata(uuid, int) from public, anon;
grant execute on function public.admin_set_ingresso_soglia_serata(uuid, int) to authenticated;


-- ------------------------------------------------------------
-- 3 · Il PR guarda il suo pass (come nel 30, col numero della serata)
-- ------------------------------------------------------------
create or replace function public.pr_ingresso(p_event uuid)
returns table (
  token     text,
  attivo    boolean,
  vendute   int,
  soglia    int,
  mancano   int,
  forzato   boolean,
  usato_at  timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
#variable_conflict use_column
declare
  v_me      uuid := auth.uid();
  v_soglia  int;
  v_vendute int;
  v_riga    record;
begin
  if not public.is_pr() then
    raise exception 'Non autorizzato';
  end if;

  v_soglia := public._ingresso_soglia(p_event);

  -- ⬇️ LA RIGA DA CAMBIARE se un giorno il pass dovrà dipendere dai
  -- soldi consegnati invece che dalle prevendite fatte: basta
  -- aggiungere `and ps.stato in ('attiva','usata')`.
  select count(*)::int into v_vendute
    from public.presales ps
   where ps.event_id = p_event and ps.pr_id = v_me
     and ps.stato <> 'annullata';

  insert into public.pr_ingressi (event_id, pr_id)
  values (p_event, v_me)
  on conflict (event_id, pr_id) do nothing;

  select i.* into v_riga
    from public.pr_ingressi i
   where i.event_id = p_event and i.pr_id = v_me;

  return query
    select v_riga.token,
           (v_vendute >= v_soglia or v_riga.forzato),
           v_vendute,
           v_soglia,
           greatest(v_soglia - v_vendute, 0),
           v_riga.forzato,
           v_riga.usato_at;
end;
$$;

revoke execute on function public.pr_ingresso(uuid) from public, anon;
grant execute on function public.pr_ingresso(uuid) to authenticated;


-- ------------------------------------------------------------
-- 4 · Chi entra e chi no, per il pannello (come nel 30)
-- ------------------------------------------------------------
create or replace function public.admin_pr_ingressi(p_event uuid)
returns table (
  pr_id    uuid,
  alias    text,
  vendute  int,
  attivo   boolean,
  forzato  boolean,
  usato_at timestamptz
)
language plpgsql
security definer
set search_path = public
stable
as $$
#variable_conflict use_column
declare v_soglia int;
begin
  if not public.is_admin() then
    raise exception 'Non autorizzato';
  end if;

  v_soglia := public._ingresso_soglia(p_event);

  return query
    select pf.id,
           pf.alias,
           coalesce(v.n, 0)::int,
           (coalesce(v.n, 0) >= v_soglia or coalesce(i.forzato, false)),
           coalesce(i.forzato, false),
           i.usato_at
      from public.profiles pf
      left join lateral (
        select count(*)::int as n from public.presales ps
         where ps.event_id = p_event and ps.pr_id = pf.id
           and ps.stato <> 'annullata'
      ) v on true
      left join public.pr_ingressi i
        on i.event_id = p_event and i.pr_id = pf.id
     where pf.role = 'crew' and pf.deleted_at is null
     order by coalesce(v.n, 0) desc, pf.alias;
end;
$$;

revoke execute on function public.admin_pr_ingressi(uuid) from public, anon;
grant execute on function public.admin_pr_ingressi(uuid) to authenticated;


-- ------------------------------------------------------------
-- 5 · La porta (copiata dal 32 senza toccare una virgola, tranne
--     la riga che legge il numero: ora è quello della serata del pass)
-- ------------------------------------------------------------
create or replace function public.porta_checkin(p_token text, p_event uuid default null)
returns table (
  esito       text,
  nome        text,
  cognome     text,
  tier_label  text,
  prezzo      numeric,
  minorenne   boolean,
  under16     boolean,
  pr_alias    text,
  evento      text,
  entrata_at  timestamptz,
  presale_id  uuid
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_b      record;
  v_pr     text;
  v_ev     text;
  v_i      record;
  v_soglia int;
  v_vend   int;
begin
  if not (public.is_staff() or public.is_account_manager()) then
    raise exception 'Non autorizzato';
  end if;

  select s.*, e.name as nome_evento, e.starts_at as quando_evento,
           p.alias as alias_pr
    into v_b
    from public.presales s
    join public.events e on e.id = s.event_id
    left join public.profiles p on p.id = s.pr_id
   where s.token = p_token;

  if not found then
    -- Non è un biglietto: può essere il pass di un PR.
    select i.*, e.name as nome_evento, pf.alias as alias_pr
      into v_i
      from public.pr_ingressi i
      join public.events e on e.id = i.event_id
      join public.profiles pf on pf.id = i.pr_id
     where i.token = p_token;

    if not found then
      return query select 'sconosciuto'::text, null::text, null::text, null::text,
                          null::numeric, null::boolean, null::boolean,
                          null::text, null::text, null::timestamptz, null::uuid;
      return;
    end if;

    if p_event is not null and v_i.event_id <> p_event then
      return query select 'altra_serata'::text, v_i.alias_pr, null::text, 'PASS PR'::text,
                          null::numeric, null::boolean, null::boolean,
                          v_i.alias_pr, v_i.nome_evento, null::timestamptz, null::uuid;
      return;
    end if;

    if v_i.usato_at is not null then
      return query select 'gia_usato'::text, v_i.alias_pr, null::text, 'PASS PR'::text,
                          null::numeric, null::boolean, null::boolean,
                          v_i.alias_pr, v_i.nome_evento, v_i.usato_at, null::uuid;
      return;
    end if;

    v_soglia := public._ingresso_soglia(v_i.event_id);

    select count(*)::int into v_vend
      from public.presales ps
     where ps.event_id = v_i.event_id and ps.pr_id = v_i.pr_id
       and ps.stato <> 'annullata';

    if not (v_vend >= v_soglia or v_i.forzato) then
      return query select 'pr_non_attivo'::text, v_i.alias_pr, null::text,
                          format('%s su %s', v_vend, v_soglia)::text,
                          null::numeric, null::boolean, null::boolean,
                          v_i.alias_pr, v_i.nome_evento, null::timestamptz, null::uuid;
      return;
    end if;

    update public.pr_ingressi i
       set usato_at = now(), usato_da = (auth.jwt() ->> 'email')
     where i.event_id = v_i.event_id and i.pr_id = v_i.pr_id and i.usato_at is null;

    if not found then
      return query select 'gia_usato'::text, v_i.alias_pr, null::text, 'PASS PR'::text,
                          null::numeric, null::boolean, null::boolean,
                          v_i.alias_pr, v_i.nome_evento, now(), null::uuid;
      return;
    end if;

    return query select 'pr_ok'::text, v_i.alias_pr, null::text, 'PASS PR'::text,
                        null::numeric, null::boolean, null::boolean,
                        v_i.alias_pr, v_i.nome_evento, now(), null::uuid;
    return;
  end if;

  v_pr := coalesce(v_b.alias_pr, 'DIREZIONE');
  v_ev := v_b.nome_evento;

  if p_event is not null and v_b.event_id <> p_event then
    return query select 'altra_serata'::text, v_b.nome, v_b.cognome, v_b.tier_label,
                        v_b.prezzo, null::boolean, null::boolean, v_pr, v_ev,
                        null::timestamptz, v_b.id;
    return;
  end if;

  if v_b.stato = 'annullata' then
    return query select 'annullato'::text, v_b.nome, v_b.cognome, v_b.tier_label,
                        v_b.prezzo, null::boolean, null::boolean, v_pr, v_ev,
                        null::timestamptz, v_b.id;
    return;
  end if;

  if v_b.stato = 'usata' then
    return query select 'gia_usato'::text, v_b.nome, v_b.cognome, v_b.tier_label,
                        v_b.prezzo, null::boolean, null::boolean, v_pr, v_ev,
                        v_b.usata_at, v_b.id;
    return;
  end if;

  if v_b.stato = 'in_attesa' then
    return query select 'non_pagato'::text, v_b.nome, v_b.cognome, v_b.tier_label,
                        v_b.prezzo, null::boolean, null::boolean, v_pr, v_ev,
                        null::timestamptz, v_b.id;
    return;
  end if;

  update public.presales s
     set stato = 'usata',
         usata_at = now(),
         usata_da = (auth.jwt() ->> 'email'),
         entrata_da = (auth.jwt() ->> 'email')
   where s.id = v_b.id and s.stato = 'attiva';

  if not found then
    return query select 'gia_usato'::text, v_b.nome, v_b.cognome, v_b.tier_label,
                        v_b.prezzo, null::boolean, null::boolean, v_pr, v_ev,
                        now(), v_b.id;
    return;
  end if;

  return query select 'ok'::text, v_b.nome, v_b.cognome, v_b.tier_label, v_b.prezzo,
                      (extract(year from now())::int - v_b.anno_nascita) < 18,
                      public.forse_under16(v_b.anno_nascita, v_b.quando_evento),
                      v_pr, v_ev, now(), v_b.id;
end;
$$;

grant execute on function public.porta_checkin(text, uuid) to authenticated;


-- ------------------------------------------------------------
-- 6 · I numeri di partenza
-- ------------------------------------------------------------
-- Quello di serie torna 10, la regola di settembre: vale per le
-- serate che non hanno un numero loro (quelle che si creeranno).
update public.prevendite_config set ingresso_soglia = 10 where id = 1;

-- Le tre serate in programma. `do nothing`: rieseguendo lo script non
-- si cancella un numero cambiato dopo dal pannello.
insert into public.pr_ingresso_soglie (event_id, soglia, cambiato_da)
select e.id, v.soglia, 'script 40'
  from public.events e
  join (values ('day-off-la-domenica-pomeriggio-con-nabi', 1),
               ('opening-party-with-lil-naay',             5),
               ('halloween-2026',                         10)) as v(slug, soglia)
    on v.slug = e.slug
on conflict (event_id) do nothing;


-- ============================================================
-- Controllo: quante prevendite servono, serata per serata
-- ============================================================
select e.name as serata,
       e.starts_at::date as data,
       public._ingresso_soglia(e.id) as "prevendite per l'ingresso PR",
       (select count(*) from public.pr_ingressi i
         where i.event_id = e.id and i.usato_at is not null) as "PR già entrati"
  from public.events e
 where e.starts_at > now()
 order by e.starts_at;
