-- ============================================================
-- 66 — PR DEL PAPI-ON: 5 SCONTI A SERATA, E OGNI 10 DRINK PAGATI UNO IN REGALO
--
-- Luka, 20 novembre 2026: *"lo sconto a 1 € può essere usato su massimo
-- 5 drink a serata, uno alla volta"* e *"ogni 10 drink comprati hanno un
-- altro ulteriore drink omaggio... che sia indicato nel proprio profilo"*.
--
--   · SCONTO 1 €  → i primi 5 drink pagati della serata (da 7 € in su).
--                   Dal 6° il barista scansiona lo stesso: prezzo pieno,
--                   ma il drink conta per il regalo.
--   · DRINK PAGATI → ogni drink scansionato al bar (con o senza sconto).
--                   Ogni 10, da sempre, un drink in regalo.
--   · IL REGALO   → resta nell'app finché non lo usa (non scade a fine
--                   serata). Al bar esce dal tasto DRINK OMAGGIO, dopo il
--                   drink della serata.
--
-- Tabelle nuove: papion_pr_pagati (drink pagati a prezzo pieno, dal 6°)
-- e papion_pr_regali (drink in regalo dati). I drink pagati = righe di
-- papion_pr_sconti + righe di papion_pr_pagati. Le funzioni del pannello
-- non cambiano: gli sconti restano sconti.
--
-- Riscrive papion_pr_bar, papion_pr_bar_usa (drop + create: colonne in più)
-- e papion_pr_app. Nessuna funzione dell'1% toccata.
--
-- Da incollare nel SQL Editor di Supabase DOPO il 61 e il 62. Si può rieseguire.
-- ============================================================


-- ------------------------------------------------------------
-- 1 · Le tabelle nuove
-- ------------------------------------------------------------
create table if not exists public.papion_pr_pagati (
  id         uuid primary key default gen_random_uuid(),
  pr_id      uuid not null references public.papion_pr (id) on delete cascade,
  serata     date not null,
  at         timestamptz not null default now(),
  operatore  text
);
create index if not exists papion_pr_pagati_pr_serata on public.papion_pr_pagati (pr_id, serata);

create table if not exists public.papion_pr_regali (
  id         uuid primary key default gen_random_uuid(),
  pr_id      uuid not null references public.papion_pr (id) on delete cascade,
  serata     date not null,
  at         timestamptz not null default now(),
  operatore  text
);
create index if not exists papion_pr_regali_pr on public.papion_pr_regali (pr_id);

alter table public.papion_pr_pagati enable row level security;
alter table public.papion_pr_regali enable row level security;


-- ------------------------------------------------------------
-- 2 · Le regole (se cambiano, cambiano anche in lib/papion-pr.ts)
-- ------------------------------------------------------------
create or replace function public._papion_max_sconti()
returns int
language sql
immutable
as $$ select 5 $$;

create or replace function public._papion_ogni_pagati()
returns int
language sql
immutable
as $$ select 10 $$;

-- Drink pagati da sempre: con lo sconto + a prezzo pieno
create or replace function public._papion_pagati(p_pr uuid)
returns int
language sql
stable
set search_path = public
as $$
  select ((select count(*) from public.papion_pr_sconti s where s.pr_id = p_pr)
        + (select count(*) from public.papion_pr_pagati g where g.pr_id = p_pr))::int
$$;

-- Drink in regalo ancora da prendere
create or replace function public._papion_regali_liberi(p_pr uuid)
returns int
language sql
stable
set search_path = public
as $$
  select greatest(
    public._papion_pagati(p_pr) / public._papion_ogni_pagati()
    - (select count(*) from public.papion_pr_regali r where r.pr_id = p_pr)::int,
    0)
$$;

revoke execute on function public._papion_pagati(uuid) from public, anon, authenticated;
revoke execute on function public._papion_regali_liberi(uuid) from public, anon, authenticated;


-- ------------------------------------------------------------
-- 3 · AL BAR: cosa gli spetta, quanti sconti ha usato, i drink pagati e i regali
-- ------------------------------------------------------------
drop function if exists public.papion_pr_bar(text);
create function public.papion_pr_bar(p_qr text)
returns table (
  esito text, nome text, cognome text, entrato_at timestamptz,
  drink_tot int, drink_usati int, drink_ultimo timestamptz,
  shot_tot int, shot_usati int, shot_ultimo timestamptz,
  sconti int, ultimo_sconto timestamptz, presenze int,
  sconti_max int, pagati int, pagati_stasera int, regali int, ogni_pagati int
)
language plpgsql
security definer
set search_path = public
stable
as $$
declare
  v_serata date := public._papion_serata();
  v_pr     public.papion_pr%rowtype;
  v_p      public.papion_pr_presenze%rowtype;
  v_tot    int;
  v_n      int;
  v_s      int;
  v_u      timestamptz;
  v_pag    int;
  v_pag_s  int;
  v_reg    int;
begin
  if not (public.is_staff() or public.is_account_manager()) then
    raise exception 'Non autorizzato' using errcode = '42501';
  end if;

  select * into v_pr from public.papion_pr where qr = trim(p_qr);
  if not found then
    return query select 'sconosciuto'::text, null::text, null::text, null::timestamptz,
      null::int, null::int, null::timestamptz, null::int, null::int, null::timestamptz,
      null::int, null::timestamptz, null::int,
      null::int, null::int, null::int, null::int, null::int;
    return;
  end if;

  select count(*)::int into v_tot from public.papion_pr_presenze x where x.pr_id = v_pr.id;
  select * into v_p from public.papion_pr_presenze x
   where x.pr_id = v_pr.id and x.serata = v_serata;
  select count(*)::int, max(s.at) into v_s, v_u from public.papion_pr_sconti s
   where s.pr_id = v_pr.id and s.serata = v_serata;
  select count(*)::int into v_pag_s from public.papion_pr_pagati g
   where g.pr_id = v_pr.id and g.serata = v_serata;
  v_pag_s := v_pag_s + v_s;
  v_pag := public._papion_pagati(v_pr.id);
  v_reg := public._papion_regali_liberi(v_pr.id);

  if v_p.id is null then
    -- non è passato dalla cassa: gli spetta quello della prossima presenza
    v_n := v_tot + 1;
    return query select
      case when v_pr.attivo then 'ok' else 'disattivo' end,
      v_pr.nome, v_pr.cognome, null::timestamptz,
      1 + (v_n % public._papion_ogni_extra() = 0)::int, 0, null::timestamptz,
      (v_n % public._papion_ogni() = 0)::int + (v_n % public._papion_ogni_extra() = 0)::int, 0, null::timestamptz,
      v_s, v_u, v_tot,
      public._papion_max_sconti(), v_pag, v_pag_s, v_reg, public._papion_ogni_pagati();
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
    v_s, v_u, v_tot,
    public._papion_max_sconti(), v_pag, v_pag_s, v_reg, public._papion_ogni_pagati();
end;
$$;

revoke execute on function public.papion_pr_bar(text) from public, anon;
grant execute on function public.papion_pr_bar(text) to authenticated;


-- Usare: 'drink' · 'shot' · 'sconto'.
--   esito:   ok · pieno (sconti finiti: prezzo pieno, il drink conta lo stesso) · gia ·
--            niente_shot · disattivo · sconosciuto · cosa
--   sconti:  sconti usati stasera (dopo questo)
--   rimasti: drink/shot che gli restano (per il drink: della serata + in regalo)
--   pagati:  drink pagati da sempre (dopo questo)
--   regalo:  sconto/pieno → con questo drink ne ha pagati 10, 20…: ha un drink in regalo
--            drink        → il drink dato era quello in regalo
--   regali:  drink in regalo ancora da prendere
drop function if exists public.papion_pr_bar_usa(text, text);
create function public.papion_pr_bar_usa(p_qr text, p_cosa text)
returns table (esito text, quando timestamptz, sconti int, rimasti int, pagati int, regalo boolean, regali int)
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
  v_pag    int;
  v_reg    int;
  v_esito  text;
begin
  if not (public.is_staff() or public.is_account_manager()) then
    raise exception 'Non autorizzato' using errcode = '42501';
  end if;
  if p_cosa not in ('drink', 'shot', 'sconto') then
    return query select 'cosa'::text, null::timestamptz, null::int, null::int, null::int, false, null::int; return;
  end if;

  select * into v_pr from public.papion_pr where qr = trim(p_qr);
  if not found then
    return query select 'sconosciuto'::text, null::timestamptz, null::int, null::int, null::int, false, null::int; return;
  end if;
  if not v_pr.attivo then
    return query select 'disattivo'::text, null::timestamptz, null::int, null::int, null::int, false, null::int; return;
  end if;

  if p_cosa = 'sconto' then
    -- uno alla volta: un secondo tocco entro 10 secondi è lo stesso drink
    perform 1 from public.papion_pr where id = v_pr.id for update;
    select greatest(
             (select max(s.at) from public.papion_pr_sconti s where s.pr_id = v_pr.id and s.serata = v_serata),
             (select max(g.at) from public.papion_pr_pagati g where g.pr_id = v_pr.id and g.serata = v_serata))
      into v_quando;
    select count(*)::int into v_s from public.papion_pr_sconti s
     where s.pr_id = v_pr.id and s.serata = v_serata;
    if v_quando is not null and v_quando > now() - interval '10 seconds' then
      return query select 'gia'::text, v_quando, v_s, null::int,
                          public._papion_pagati(v_pr.id), false, public._papion_regali_liberi(v_pr.id);
      return;
    end if;

    if v_s < public._papion_max_sconti() then
      insert into public.papion_pr_sconti (pr_id, serata, operatore) values (v_pr.id, v_serata, v_op);
      v_s := v_s + 1;
      v_esito := 'ok';
    else
      -- sconti finiti stasera: prezzo pieno, ma il drink conta per il regalo
      insert into public.papion_pr_pagati (pr_id, serata, operatore) values (v_pr.id, v_serata, v_op);
      v_esito := 'pieno';
    end if;
    v_pag := public._papion_pagati(v_pr.id);
    return query select v_esito, now(), v_s, null::int, v_pag,
                        v_pag % public._papion_ogni_pagati() = 0,
                        public._papion_regali_liberi(v_pr.id);
    return;
  end if;

  -- drink e shot stanno sulla presenza: se non è passato dalla cassa, si segna adesso
  perform public._papion_pr_entra(v_pr.id, 'bar');
  select * into v_p from public.papion_pr_presenze p
   where p.pr_id = v_pr.id and p.serata = v_serata
   for update;

  if p_cosa = 'drink' then
    -- prima il drink (o i due) della serata, poi quelli in regalo
    v_reg := public._papion_regali_liberi(v_pr.id);
    if v_p.drink_at is null then
      update public.papion_pr_presenze set drink_at = now(), drink_da = v_op where id = v_p.id;
      return query select 'ok'::text, now(), null::int, v_p.extra::int + v_reg, null::int, false, v_reg; return;
    elsif v_p.extra and v_p.drink2_at is null then
      update public.papion_pr_presenze set drink2_at = now(), drink2_da = v_op where id = v_p.id;
      return query select 'ok'::text, now(), null::int, v_reg, null::int, false, v_reg; return;
    elsif v_reg > 0 then
      insert into public.papion_pr_regali (pr_id, serata, operatore) values (v_pr.id, v_serata, v_op);
      return query select 'ok'::text, now(), null::int, v_reg - 1, null::int, true, v_reg - 1; return;
    end if;
    return query select 'gia'::text, greatest(v_p.drink_at, v_p.drink2_at), null::int, 0, null::int, false, 0; return;
  end if;

  -- shot
  if not coalesce(v_p.shot, false) then
    return query select 'niente_shot'::text, null::timestamptz, null::int, 0, null::int, false, null::int; return;
  end if;
  if v_p.shot_at is null then
    update public.papion_pr_presenze set shot_at = now(), shot_da = v_op where id = v_p.id;
    return query select 'ok'::text, now(), null::int, v_p.extra::int, null::int, false, null::int; return;
  elsif v_p.extra and v_p.shot2_at is null then
    update public.papion_pr_presenze set shot2_at = now(), shot2_da = v_op where id = v_p.id;
    return query select 'ok'::text, now(), null::int, 0, null::int, false, null::int; return;
  end if;
  return query select 'gia'::text, greatest(v_p.shot_at, v_p.shot2_at), null::int, 0, null::int, false, null::int;
end;
$$;

revoke execute on function public.papion_pr_bar_usa(text, text) from public, anon;
grant execute on function public.papion_pr_bar_usa(text, text) to authenticated;


-- ------------------------------------------------------------
-- 4 · L'APP DEL PR: sconti della serata, drink pagati, regali
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
    'sconti_max', public._papion_max_sconti(),
    'ogni_pagati', public._papion_ogni_pagati(),
    'serata', v_serata,
    'presenze', (select count(*) from public.papion_pr_presenze where pr_id = v_pr.id),
    'drink', (select count(drink_at) + count(drink2_at) from public.papion_pr_presenze where pr_id = v_pr.id),
    'shot', (select count(shot_at) + count(shot2_at) from public.papion_pr_presenze where pr_id = v_pr.id),
    'sconti', (select count(*) from public.papion_pr_sconti where pr_id = v_pr.id),
    'sconti_stasera', (select count(*) from public.papion_pr_sconti where pr_id = v_pr.id and serata = v_serata),
    'pagati', public._papion_pagati(v_pr.id),
    'pagati_stasera', (select count(*) from public.papion_pr_sconti where pr_id = v_pr.id and serata = v_serata)
                    + (select count(*) from public.papion_pr_pagati where pr_id = v_pr.id and serata = v_serata),
    'regali', public._papion_regali_liberi(v_pr.id),
    'regali_presi', (select count(*) from public.papion_pr_regali where pr_id = v_pr.id),
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
-- CONTROLLO: deve uscire una riga con "pronto ✓"
-- ------------------------------------------------------------
select 'pronto ✓' as sconti_e_regalo,
       public._papion_max_sconti() as sconti_a_serata,
       public._papion_ogni_pagati() as regalo_ogni,
       (select count(*) from public.papion_pr_sconti) as drink_pagati_finora;
