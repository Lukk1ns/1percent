-- ============================================================
-- 30 — L'INGRESSO DEL PR SE LO GUADAGNA
--
-- Chiesto da Luka il 24 settembre 2026: *"aggiungi un QR code che si
-- attiva solo quando il PR vende il numero di prevendite richiesto,
-- fissato a 10. Poi io posso fare eccezione e attivarglielo anche se
-- ne ha vendute 8, ma decido io. Lui vede ATTIVO o NON ANCORA ATTIVO,
-- e lo sa."*
--
-- È il patto scritto su una pagina invece che a voce: il PR sa sempre
-- a che punto è, e non c'è più da discutere in porta.
--
-- COME FUNZIONA
--   · Un QR **per PR e per serata**: il pass di sabato non apre la
--     porta di venerdì. Il codice nasce alla prima occhiata e non
--     cambia più, così chi se l'è salvato in galleria lo ritrova
--     valido.
--   · **Attivo** quando le prevendite vendute arrivano alla soglia
--     (`prevendite_config.ingresso_soglia`, 10 di serie, si cambia dal
--     pannello) **oppure** quando lo accende Luka a mano.
--   · **Si conta il venduto**, non il saldato: chi ha fatto i suoi 10
--     nominativi ha fatto il suo lavoro anche se i contanti arrivano
--     domani. Se si vuole legarlo ai soldi incassati, si cambia una
--     riga qui sotto (è segnata).
--   · Vale **una volta sola**: alla porta si brucia come un biglietto.
--
-- Da incollare nel SQL Editor. Si può rieseguire.
-- ============================================================


alter table public.prevendite_config
  add column if not exists ingresso_soglia int not null default 10;


-- ------------------------------------------------------------
-- Il pass del PR
-- ------------------------------------------------------------
create table if not exists public.pr_ingressi (
  event_id   uuid not null references public.events (id) on delete cascade,
  pr_id      uuid not null references public.profiles (id) on update cascade on delete cascade,
  token      text not null unique default encode(gen_random_bytes(16), 'hex'),
  forzato    boolean not null default false,
  forzato_da text,
  forzato_at timestamptz,
  usato_at   timestamptz,
  usato_da   text,
  created_at timestamptz not null default now(),
  primary key (event_id, pr_id)
);

alter table public.pr_ingressi enable row level security;
-- Nessuna policy: si passa solo dalle funzioni qui sotto, che
-- controllano una per una chi sta chiamando.


-- ------------------------------------------------------------
-- Quante ne servono: si legge e si cambia dal pannello
-- ------------------------------------------------------------
create or replace function public.admin_ingresso_soglia()
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
  select c.ingresso_soglia into v_n from public.prevendite_config c where c.id = 1;
  return coalesce(v_n, 10);
end;
$$;

revoke execute on function public.admin_ingresso_soglia() from public, anon;
grant execute on function public.admin_ingresso_soglia() to authenticated;


create or replace function public.admin_set_ingresso_soglia(p_n int)
returns int
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception 'Non autorizzato';
  end if;
  if p_n < 0 or p_n > 500 then
    raise exception 'Metti un numero fra 0 e 500';
  end if;
  update public.prevendite_config set ingresso_soglia = p_n where id = 1;
  return p_n;
end;
$$;

revoke execute on function public.admin_set_ingresso_soglia(int) from public, anon;
grant execute on function public.admin_set_ingresso_soglia(int) to authenticated;


-- ------------------------------------------------------------
-- Il PR guarda il suo pass
-- ------------------------------------------------------------
-- Non è `stable`: la prima volta il codice va creato.
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

  select coalesce(c.ingresso_soglia, 10) into v_soglia
    from public.prevendite_config c where c.id = 1;

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
-- L'eccezione la fa Luka
-- ------------------------------------------------------------
create or replace function public.admin_pr_ingresso_forza(
  p_event uuid,
  p_pr    uuid,
  p_on    boolean
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception 'Non autorizzato';
  end if;

  insert into public.pr_ingressi (event_id, pr_id, forzato, forzato_da, forzato_at)
  values (p_event, p_pr, p_on, (auth.jwt() ->> 'email'), now())
  on conflict (event_id, pr_id) do update
    set forzato    = excluded.forzato,
        forzato_da = excluded.forzato_da,
        forzato_at = excluded.forzato_at;

  return p_on;
end;
$$;

revoke execute on function public.admin_pr_ingresso_forza(uuid, uuid, boolean) from public, anon;
grant execute on function public.admin_pr_ingresso_forza(uuid, uuid, boolean) to authenticated;


-- ------------------------------------------------------------
-- Chi entra e chi no, per il pannello
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

  select coalesce(c.ingresso_soglia, 10) into v_soglia
    from public.prevendite_config c where c.id = 1;

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
-- La porta riconosce anche il pass del PR
-- ------------------------------------------------------------
-- Stessa funzione di prima: se il codice non è di un biglietto, prima
-- di dire "non è un biglietto" si guarda fra i pass dei PR. Tre esiti
-- nuovi, che la pagina della porta colora come gli altri:
--   pr_ok         → è della crew e ha fatto i suoi numeri: passa
--   pr_non_attivo → non ci è ancora arrivato (e si vede a quanto sta)
--   gia_usato     → il pass vale una volta sola, come i biglietti
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
  if not public.is_staff() then
    raise exception 'Non autorizzato';
  end if;

  select s.*, e.name as nome_evento, p.alias as alias_pr
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

    select coalesce(c.ingresso_soglia, 10) into v_soglia
      from public.prevendite_config c where c.id = 1;

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
                      (extract(year from now())::int - v_b.anno_nascita) < 16,
                      v_pr, v_ev, now(), v_b.id;
end;
$$;

grant execute on function public.porta_checkin(text, uuid) to authenticated;


-- ============================================================
-- Controllo
-- ============================================================
select c.ingresso_soglia as "prevendite per avere l'ingresso",
       (select count(*) from public.pr_ingressi) as "pass già creati"
  from public.prevendite_config c
 where c.id = 1;
