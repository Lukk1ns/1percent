-- ============================================================
-- 62 — PR DEL PAPI-ON: OGNI 10 PRESENZE UN DRINK E UNO SHOT IN PIÙ
--
-- Luka, 17 novembre 2026 (stesso giorno del 61): *"metti ogni 10
-- presenze anche un drink e un secondo shot in omaggio"*.
--
--   · presenza normale        → 1 drink
--   · 5ª, 15ª, 25ª…            → 1 drink + 1 shot
--   · 10ª, 20ª, 30ª…           → 2 drink + 2 shot
--
-- Valgono sempre e solo quella sera. Al bar il tasto DRINK e il tasto
-- SHOT si possono toccare due volte quella sera, poi "già dato".
--
-- Riscrive solo funzioni del 61 (nessuna dell'1%). Le presenze già
-- segnate prendono il premio dei 10 se il loro numero è 10, 20, 30…
--
-- Da incollare nel SQL Editor di Supabase DOPO il 61. Si può rieseguire.
-- ============================================================


-- ------------------------------------------------------------
-- 1 · Il secondo drink e il secondo shot sulla presenza
-- ------------------------------------------------------------
alter table public.papion_pr_presenze
  add column if not exists extra     boolean not null default false,  -- 10ª, 20ª…: drink e shot in più
  add column if not exists drink2_at timestamptz,
  add column if not exists drink2_da text,
  add column if not exists shot2_at  timestamptz,
  add column if not exists shot2_da  text;

-- Ogni quante presenze c'è il premio grande. Se cambia, cambia anche lib/papion-pr.ts.
create or replace function public._papion_ogni_extra()
returns int
language sql
immutable
as $$ select 10 $$;

update public.papion_pr_presenze
   set extra = (numero % public._papion_ogni_extra() = 0)
 where extra is distinct from (numero % public._papion_ogni_extra() = 0);


-- ------------------------------------------------------------
-- 2 · La presenza nasce già col premio giusto
-- ------------------------------------------------------------
create or replace function public._papion_pr_entra(p_pr uuid, p_da text)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_serata date := public._papion_serata();
  v_n      int;
begin
  perform 1 from public.papion_pr where id = p_pr for update;

  if exists (select 1 from public.papion_pr_presenze where pr_id = p_pr and serata = v_serata) then
    return false;
  end if;

  select count(*)::int + 1 into v_n from public.papion_pr_presenze where pr_id = p_pr;

  insert into public.papion_pr_presenze (pr_id, serata, da, numero, shot, extra, operatore)
  values (p_pr, v_serata, p_da, v_n,
          v_n % public._papion_ogni() = 0,
          v_n % public._papion_ogni_extra() = 0,
          public._papion_operatore())
  on conflict (pr_id, serata) do nothing;

  return found;
end;
$$;

revoke execute on function public._papion_pr_entra(uuid, text) from public, anon, authenticated;


-- ------------------------------------------------------------
-- 3 · IN CASSA: dice anche se stasera c'è il premio dei 10
-- ------------------------------------------------------------
drop function if exists public.papion_pr_cassa(text);
create function public.papion_pr_cassa(p_qr text)
returns table (
  esito text, nome text, cognome text,
  numero int, shot boolean, extra boolean, entrato_at timestamptz, da text
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_pr    public.papion_pr%rowtype;
  v_nuova boolean;
  v_p     public.papion_pr_presenze%rowtype;
begin
  if not (public.is_staff() or public.is_account_manager()) then
    raise exception 'Non autorizzato' using errcode = '42501';
  end if;

  select * into v_pr from public.papion_pr where qr = trim(p_qr);
  if not found then
    return query select 'sconosciuto'::text, null::text, null::text,
                        null::int, null::boolean, null::boolean, null::timestamptz, null::text;
    return;
  end if;
  if not v_pr.attivo then
    return query select 'disattivo'::text, v_pr.nome, v_pr.cognome,
                        null::int, null::boolean, null::boolean, null::timestamptz, null::text;
    return;
  end if;

  v_nuova := public._papion_pr_entra(v_pr.id, 'cassa');
  select * into v_p from public.papion_pr_presenze
   where pr_id = v_pr.id and serata = public._papion_serata();

  return query select case when v_nuova then 'ok' else 'gia' end,
                      v_pr.nome, v_pr.cognome,
                      v_p.numero, v_p.shot, v_p.extra, v_p.entrato_at, v_p.da;
end;
$$;

revoke execute on function public.papion_pr_cassa(text) from public, anon;
grant execute on function public.papion_pr_cassa(text) to authenticated;


-- ------------------------------------------------------------
-- 4 · AL BAR: quanti drink e shot gli spettano stasera, e quanti ha preso
-- ------------------------------------------------------------
drop function if exists public.papion_pr_bar(text);
create function public.papion_pr_bar(p_qr text)
returns table (
  esito text, nome text, cognome text, entrato_at timestamptz,
  drink_tot int, drink_usati int, drink_ultimo timestamptz,
  shot_tot int, shot_usati int, shot_ultimo timestamptz,
  sconti int, ultimo_sconto timestamptz, presenze int
)
language plpgsql
security definer
set search_path = public
stable
as $$
declare
  v_pr  public.papion_pr%rowtype;
  v_p   public.papion_pr_presenze%rowtype;
  v_tot int;
  v_n   int;
  v_s   int;
  v_u   timestamptz;
begin
  if not (public.is_staff() or public.is_account_manager()) then
    raise exception 'Non autorizzato' using errcode = '42501';
  end if;

  select * into v_pr from public.papion_pr where qr = trim(p_qr);
  if not found then
    return query select 'sconosciuto'::text, null::text, null::text, null::timestamptz,
      null::int, null::int, null::timestamptz, null::int, null::int, null::timestamptz,
      null::int, null::timestamptz, null::int;
    return;
  end if;

  select count(*)::int into v_tot from public.papion_pr_presenze where pr_id = v_pr.id;
  select * into v_p from public.papion_pr_presenze
   where pr_id = v_pr.id and serata = public._papion_serata();
  select count(*)::int, max(s.at) into v_s, v_u from public.papion_pr_sconti s
   where s.pr_id = v_pr.id and s.serata = public._papion_serata();

  if v_p.id is null then
    -- non è passato dalla cassa: gli spetta quello della prossima presenza
    v_n := v_tot + 1;
    return query select
      case when v_pr.attivo then 'ok' else 'disattivo' end,
      v_pr.nome, v_pr.cognome, null::timestamptz,
      1 + (v_n % public._papion_ogni_extra() = 0)::int, 0, null::timestamptz,
      (v_n % public._papion_ogni() = 0)::int + (v_n % public._papion_ogni_extra() = 0)::int, 0, null::timestamptz,
      v_s, v_u, v_tot;
    return;
  end if;

  return query select
    case when v_pr.attivo then 'ok' else 'disattivo' end,
    v_pr.nome, v_pr.cognome, v_p.entrato_at,
    1 + v_p.extra::int,
    (v_p.drink_at is not null)::int + (v_p.drink2_at is not null)::int,
    greatest(v_p.drink_at, v_p.drink2_at),
    v_p.shot::int + v_p.extra::int,
    (v_p.shot_at is not null)::int + (v_p.shot2_at is not null)::int,
    greatest(v_p.shot_at, v_p.shot2_at),
    v_s, v_u, v_tot;
end;
$$;

revoke execute on function public.papion_pr_bar(text) from public, anon;
grant execute on function public.papion_pr_bar(text) to authenticated;


-- Usare: 'drink' · 'shot' · 'sconto'. rimasti = quanti drink/shot gli restano stasera.
drop function if exists public.papion_pr_bar_usa(text, text);
create function public.papion_pr_bar_usa(p_qr text, p_cosa text)
returns table (esito text, quando timestamptz, sconti int, rimasti int)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_pr     public.papion_pr%rowtype;
  v_p      public.papion_pr_presenze%rowtype;
  v_serata date := public._papion_serata();
  v_op     text := public._papion_operatore();
  v_quando timestamptz;
  v_s      int;
begin
  if not (public.is_staff() or public.is_account_manager()) then
    raise exception 'Non autorizzato' using errcode = '42501';
  end if;
  if p_cosa not in ('drink', 'shot', 'sconto') then
    return query select 'cosa'::text, null::timestamptz, null::int, null::int; return;
  end if;

  select * into v_pr from public.papion_pr where qr = trim(p_qr);
  if not found then
    return query select 'sconosciuto'::text, null::timestamptz, null::int, null::int; return;
  end if;
  if not v_pr.attivo then
    return query select 'disattivo'::text, null::timestamptz, null::int, null::int; return;
  end if;

  if p_cosa = 'sconto' then
    -- uno alla volta; un secondo tocco entro 10 secondi è lo stesso drink
    perform 1 from public.papion_pr where id = v_pr.id for update;
    select max(s.at) into v_quando from public.papion_pr_sconti s
     where s.pr_id = v_pr.id and s.serata = v_serata;
    if v_quando is not null and v_quando > now() - interval '10 seconds' then
      select count(*)::int into v_s from public.papion_pr_sconti s
       where s.pr_id = v_pr.id and s.serata = v_serata;
      return query select 'gia'::text, v_quando, v_s, null::int; return;
    end if;
    insert into public.papion_pr_sconti (pr_id, serata, operatore) values (v_pr.id, v_serata, v_op);
    select count(*)::int into v_s from public.papion_pr_sconti s
     where s.pr_id = v_pr.id and s.serata = v_serata;
    return query select 'ok'::text, now(), v_s, null::int; return;
  end if;

  -- drink e shot stanno sulla presenza: se non è passato dalla cassa, si segna adesso
  perform public._papion_pr_entra(v_pr.id, 'bar');
  select * into v_p from public.papion_pr_presenze p
   where p.pr_id = v_pr.id and p.serata = v_serata
   for update;

  if p_cosa = 'drink' then
    if v_p.drink_at is null then
      update public.papion_pr_presenze set drink_at = now(), drink_da = v_op where id = v_p.id;
      return query select 'ok'::text, now(), null::int, v_p.extra::int; return;
    elsif v_p.extra and v_p.drink2_at is null then
      update public.papion_pr_presenze set drink2_at = now(), drink2_da = v_op where id = v_p.id;
      return query select 'ok'::text, now(), null::int, 0; return;
    end if;
    return query select 'gia'::text, greatest(v_p.drink_at, v_p.drink2_at), null::int, 0; return;
  end if;

  -- shot
  if not coalesce(v_p.shot, false) then
    return query select 'niente_shot'::text, null::timestamptz, null::int, 0; return;
  end if;
  if v_p.shot_at is null then
    update public.papion_pr_presenze set shot_at = now(), shot_da = v_op where id = v_p.id;
    return query select 'ok'::text, now(), null::int, v_p.extra::int; return;
  elsif v_p.extra and v_p.shot2_at is null then
    update public.papion_pr_presenze set shot2_at = now(), shot2_da = v_op where id = v_p.id;
    return query select 'ok'::text, now(), null::int, 0; return;
  end if;
  return query select 'gia'::text, greatest(v_p.shot_at, v_p.shot2_at), null::int, 0;
end;
$$;

revoke execute on function public.papion_pr_bar_usa(text, text) from public, anon;
grant execute on function public.papion_pr_bar_usa(text, text) to authenticated;


-- ------------------------------------------------------------
-- 5 · L'APP DEL PR: il premio dei 10 e i conti giusti
-- ------------------------------------------------------------
create or replace function public.papion_pr_app(p_link text, p_icona boolean default false)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_pr     public.papion_pr%rowtype;
  v_serata date := public._papion_serata();
  v_p      public.papion_pr_presenze%rowtype;
begin
  if p_link is null or p_link !~ '^[0-9a-f]{24}$' then
    return null;
  end if;
  select * into v_pr from public.papion_pr where link = p_link;
  if not found or not v_pr.attivo then
    return null;
  end if;

  if v_pr.aperta_at is null or v_pr.aperta_at < now() - interval '5 minutes'
     or (p_icona and v_pr.installata_at is null) then
    update public.papion_pr
       set aperta_at = now(),
           installata_at = case when p_icona and installata_at is null then now() else installata_at end
     where id = v_pr.id;
  end if;

  select * into v_p from public.papion_pr_presenze where pr_id = v_pr.id and serata = v_serata;

  return jsonb_build_object(
    'id', v_pr.id,
    'nome', v_pr.nome,
    'cognome', v_pr.cognome,
    'qr', v_pr.qr,
    'prevendite_1p', v_pr.prevendite_1p,
    'dal', v_pr.created_at,
    'ogni', public._papion_ogni(),
    'ogni_extra', public._papion_ogni_extra(),
    'serata', v_serata,
    'presenze', (select count(*) from public.papion_pr_presenze where pr_id = v_pr.id),
    'drink', (select count(drink_at) + count(drink2_at) from public.papion_pr_presenze where pr_id = v_pr.id),
    'shot', (select count(shot_at) + count(shot2_at) from public.papion_pr_presenze where pr_id = v_pr.id),
    'sconti', (select count(*) from public.papion_pr_sconti where pr_id = v_pr.id),
    'sconti_stasera', (select count(*) from public.papion_pr_sconti where pr_id = v_pr.id and serata = v_serata),
    'stasera', case when v_p.id is null then null else jsonb_build_object(
        'entrato_at', v_p.entrato_at, 'numero', v_p.numero, 'shot', v_p.shot, 'extra', v_p.extra,
        'drink_at', v_p.drink_at, 'drink2_at', v_p.drink2_at,
        'shot_at', v_p.shot_at, 'shot2_at', v_p.shot2_at) end,
    'storico', coalesce((
        select jsonb_agg(jsonb_build_object(
                 'serata', x.serata, 'numero', x.numero, 'shot', x.shot, 'extra', x.extra,
                 'drink', (x.drink_at is not null)::int + (x.drink2_at is not null)::int,
                 'shot_presi', (x.shot_at is not null)::int + (x.shot2_at is not null)::int)
               order by x.serata desc)
          from (select * from public.papion_pr_presenze
                 where pr_id = v_pr.id order by serata desc limit 12) x), '[]'::jsonb),
    'tavoli', coalesce((
        select jsonb_agg(jsonb_build_object(
                 'id', t.id, 'serata', t.serata, 'nome', t.nome, 'budget', t.budget,
                 'bottiglie', t.bottiglie, 'stato', t.stato)
               order by t.serata desc, t.created_at desc)
          from public.papion_pr_tavoli t
         where t.pr_id = v_pr.id and t.serata >= v_serata - 60), '[]'::jsonb),
    'tavoli_tot', (select count(*) from public.papion_pr_tavoli
                    where pr_id = v_pr.id and stato <> 'non_venuto')
  );
end;
$$;

grant execute on function public.papion_pr_app(text, boolean) to anon, authenticated;


-- ------------------------------------------------------------
-- 6 · IL PANNELLO: conti col secondo drink/shot
-- ------------------------------------------------------------
create or replace function public.admin_papion_pr_lista()
returns table (
  id uuid, nome text, cognome text, telefono text, link text, foto text,
  attivo boolean, prevendite_1p boolean, created_at timestamptz,
  installata_at timestamptz, aperta_at timestamptz,
  presenze int, ultima date, presenze_30 int, stasera boolean,
  drink int, shot int, sconti int, tavoli int, tavoli_budget int
)
language plpgsql
security definer
set search_path = public
stable
as $$
declare
  v_serata date := public._papion_serata();
begin
  if not public.is_admin() then
    raise exception 'Non autorizzato' using errcode = '42501';
  end if;
  return query
    select p.id, p.nome, p.cognome, p.telefono, p.link, p.foto,
           p.attivo, p.prevendite_1p, p.created_at, p.installata_at, p.aperta_at,
           (select count(*)::int from public.papion_pr_presenze x where x.pr_id = p.id),
           (select max(x.serata) from public.papion_pr_presenze x where x.pr_id = p.id),
           (select count(*)::int from public.papion_pr_presenze x
             where x.pr_id = p.id and x.serata > v_serata - 30),
           exists (select 1 from public.papion_pr_presenze x where x.pr_id = p.id and x.serata = v_serata),
           (select (count(x.drink_at) + count(x.drink2_at))::int from public.papion_pr_presenze x where x.pr_id = p.id),
           (select (count(x.shot_at) + count(x.shot2_at))::int from public.papion_pr_presenze x where x.pr_id = p.id),
           (select count(*)::int from public.papion_pr_sconti s where s.pr_id = p.id),
           (select count(*)::int from public.papion_pr_tavoli t where t.pr_id = p.id and t.stato <> 'non_venuto'),
           (select coalesce(sum(t.budget), 0)::int from public.papion_pr_tavoli t
             where t.pr_id = p.id and t.stato <> 'non_venuto')
      from public.papion_pr p
     order by p.attivo desc, lower(p.nome), lower(p.cognome);
end;
$$;

revoke execute on function public.admin_papion_pr_lista() from public, anon;
grant execute on function public.admin_papion_pr_lista() to authenticated;


create or replace function public.admin_papion_pr_scheda(p_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
stable
as $$
begin
  if not public.is_admin() then
    raise exception 'Non autorizzato' using errcode = '42501';
  end if;
  return jsonb_build_object(
    'presenze', coalesce((
      select jsonb_agg(jsonb_build_object(
               'serata', x.serata, 'entrato_at', x.entrato_at, 'da', x.da, 'numero', x.numero,
               'shot', x.shot, 'extra', x.extra,
               'drink', (x.drink_at is not null)::int + (x.drink2_at is not null)::int,
               'shot_presi', (x.shot_at is not null)::int + (x.shot2_at is not null)::int,
               'sconti', (select count(*) from public.papion_pr_sconti s
                           where s.pr_id = x.pr_id and s.serata = x.serata))
             order by x.serata desc)
        from public.papion_pr_presenze x where x.pr_id = p_id), '[]'::jsonb),
    'sconti_fuori', coalesce((
      select jsonb_agg(jsonb_build_object('serata', s.serata, 'n', s.n) order by s.serata desc)
        from (select serata, count(*) as n from public.papion_pr_sconti
               where pr_id = p_id
                 and serata not in (select serata from public.papion_pr_presenze where pr_id = p_id)
               group by serata) s), '[]'::jsonb),
    'tavoli', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', t.id, 'serata', t.serata, 'nome', t.nome, 'budget', t.budget,
               'bottiglie', t.bottiglie, 'stato', t.stato, 'created_at', t.created_at)
             order by t.serata desc, t.created_at desc)
        from public.papion_pr_tavoli t where t.pr_id = p_id), '[]'::jsonb)
  );
end;
$$;

revoke execute on function public.admin_papion_pr_scheda(uuid) from public, anon;
grant execute on function public.admin_papion_pr_scheda(uuid) to authenticated;


create or replace function public.admin_papion_pr_serata(p_serata date)
returns jsonb
language plpgsql
security definer
set search_path = public
stable
as $$
begin
  if not public.is_admin() then
    raise exception 'Non autorizzato' using errcode = '42501';
  end if;
  return jsonb_build_object(
    'entrati', coalesce((
      select jsonb_agg(jsonb_build_object(
               'pr_id', p.id, 'nome', p.nome, 'cognome', p.cognome,
               'entrato_at', x.entrato_at, 'da', x.da, 'numero', x.numero,
               'shot', x.shot, 'extra', x.extra,
               'drink', (x.drink_at is not null)::int + (x.drink2_at is not null)::int,
               'shot_presi', (x.shot_at is not null)::int + (x.shot2_at is not null)::int,
               'sconti', (select count(*) from public.papion_pr_sconti s
                           where s.pr_id = p.id and s.serata = p_serata))
             order by x.entrato_at)
        from public.papion_pr_presenze x
        join public.papion_pr p on p.id = x.pr_id
       where x.serata = p_serata), '[]'::jsonb),
    'sconti_senza_ingresso', coalesce((
      select jsonb_agg(jsonb_build_object('pr_id', p.id, 'nome', p.nome, 'cognome', p.cognome, 'n', s.n))
        from (select pr_id, count(*) as n from public.papion_pr_sconti
               where serata = p_serata
                 and pr_id not in (select pr_id from public.papion_pr_presenze where serata = p_serata)
               group by pr_id) s
        join public.papion_pr p on p.id = s.pr_id), '[]'::jsonb),
    'tavoli', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', t.id, 'pr_id', p.id, 'pr', trim(p.nome || ' ' || p.cognome),
               'nome', t.nome, 'budget', t.budget, 'bottiglie', t.bottiglie,
               'stato', t.stato, 'created_at', t.created_at)
             order by lower(p.nome), t.created_at)
        from public.papion_pr_tavoli t
        join public.papion_pr p on p.id = t.pr_id
       where t.serata = p_serata), '[]'::jsonb)
  );
end;
$$;

revoke execute on function public.admin_papion_pr_serata(date) from public, anon;
grant execute on function public.admin_papion_pr_serata(date) to authenticated;


-- Presenza a mano: anche lei col premio dei 10
create or replace function public.admin_papion_pr_presenza(p_pr uuid, p_serata date, p_on boolean)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_n int;
begin
  if not public.is_admin() then
    raise exception 'Non autorizzato' using errcode = '42501';
  end if;
  if p_serata is null or p_serata > public._papion_serata() then
    return 'data';
  end if;

  if not p_on then
    delete from public.papion_pr_presenze where pr_id = p_pr and serata = p_serata;
    return case when found then 'tolta' else 'non_cera' end;
  end if;

  perform 1 from public.papion_pr where id = p_pr for update;
  if not found then return 'pr'; end if;
  if exists (select 1 from public.papion_pr_presenze where pr_id = p_pr and serata = p_serata) then
    return 'gia';
  end if;
  select count(*)::int + 1 into v_n from public.papion_pr_presenze where pr_id = p_pr;
  insert into public.papion_pr_presenze (pr_id, serata, entrato_at, da, numero, shot, extra, operatore)
  values (p_pr, p_serata,
          case when p_serata = public._papion_serata() then now()
               else ((p_serata + time '23:30') at time zone 'Europe/Rome') end,
          'direzione', v_n,
          v_n % public._papion_ogni() = 0,
          v_n % public._papion_ogni_extra() = 0,
          public._papion_operatore());
  return 'ok';
end;
$$;

revoke execute on function public.admin_papion_pr_presenza(uuid, date, boolean) from public, anon;
grant execute on function public.admin_papion_pr_presenza(uuid, date, boolean) to authenticated;


-- ------------------------------------------------------------
-- CONTROLLO: deve uscire una riga con "pronto ✓"
-- ------------------------------------------------------------
select 'pronto ✓' as premio_dei_10,
       public._papion_ogni_extra() as ogni,
       (select count(*) from public.papion_pr_presenze where extra) as presenze_col_premio;
