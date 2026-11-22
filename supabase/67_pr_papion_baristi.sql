-- ============================================================
-- 67 — PR DEL PAPI-ON: DA QUALE BARISTA
--
-- Luka, 22 novembre 2026, dopo il primo weekend con l'app: *"si poteva
-- anche segnare da quale barista andavano a farsi fare il drink gratis e
-- da quale barista acquistano la roba"*.
--
-- Il barista era GIÀ segnato a ogni tocco dal 61 (la sua email in
-- drink_da / shot_da / operatore): nessuna funzione del bar cambia, i
-- dati del primo weekend ci sono già. Questo script li fa vedere nel
-- pannello:
--
--   · papion_baristi       → il nome che Luka dà a ogni barista (finché
--                            non c'è, si vede l'inizio della sua email).
--                            Tabella a parte: NON tocca gli operatori.
--   · admin_papion_barista_nome(email, nome) → dà / cambia / toglie il nome.
--   · admin_papion_pr_scheda e admin_papion_pr_serata → una chiave in più,
--     `bar`: ogni tocco al bar (drink e shot omaggio, drink in regalo,
--     drink comprati con lo sconto o a prezzo pieno) con l'ora e il barista.
--     Il resto della risposta è identico al 62.
--
-- Da incollare nel SQL Editor di Supabase DOPO il 61, 62 e 66. Si può rieseguire.
-- ============================================================


-- ------------------------------------------------------------
-- 1 · I nomi dei baristi
-- ------------------------------------------------------------
create table if not exists public.papion_baristi (
  email       text primary key,               -- minuscola, com'è nei registri
  nome        text not null,
  updated_at  timestamptz not null default now()
);
alter table public.papion_baristi enable row level security;

-- Come si chiama chi ha toccato il tasto: nome dato da Luka, se no l'inizio della mail
create or replace function public._papion_barista(p_email text)
returns text
language sql
stable
security definer
set search_path = public
as $$
  select case
    when coalesce(p_email, '') = '' then null
    when p_email = 'sconosciuto' then '?'
    else coalesce(
      (select b.nome from public.papion_baristi b where b.email = lower(p_email)),
      split_part(p_email, '@', 1))
  end;
$$;
revoke execute on function public._papion_barista(text) from public, anon, authenticated;

create or replace function public.admin_papion_barista_nome(p_email text, p_nome text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_email text := lower(trim(coalesce(p_email, '')));
  v_nome  text := trim(coalesce(p_nome, ''));
begin
  if not public.is_admin() then
    raise exception 'Non autorizzato' using errcode = '42501';
  end if;
  if v_email = '' or v_email = 'sconosciuto' or position('@' in v_email) = 0 then
    return jsonb_build_object('ok', false, 'reason', 'email');
  end if;
  if v_nome = '' then
    delete from public.papion_baristi where email = v_email;   -- torna l'inizio della mail
  else
    insert into public.papion_baristi (email, nome) values (v_email, left(v_nome, 40))
    on conflict (email) do update set nome = excluded.nome, updated_at = now();
  end if;
  return jsonb_build_object('ok', true, 'nome', public._papion_barista(v_email));
end;
$$;
revoke execute on function public.admin_papion_barista_nome(text, text) from public, anon;
grant execute on function public.admin_papion_barista_nome(text, text) to authenticated;


-- ------------------------------------------------------------
-- 2 · Tutti i tocchi al bar, con chi li ha fatti
--     cosa: drink / shot (omaggio della serata) · regalo (ogni 10 pagati)
--           sconto (comprato a −1 €) · pagato (comprato a prezzo pieno)
-- ------------------------------------------------------------
create or replace function public._papion_bar_tocchi(p_pr uuid, p_serata date)
returns table (pr_id uuid, serata date, at timestamptz, cosa text, email text)
language sql
stable
security definer
set search_path = public
as $$
  select x.pr_id, x.serata, x.drink_at, 'drink', x.drink_da from public.papion_pr_presenze x
   where x.drink_at is not null and (p_pr is null or x.pr_id = p_pr) and (p_serata is null or x.serata = p_serata)
  union all
  select x.pr_id, x.serata, x.drink2_at, 'drink', x.drink2_da from public.papion_pr_presenze x
   where x.drink2_at is not null and (p_pr is null or x.pr_id = p_pr) and (p_serata is null or x.serata = p_serata)
  union all
  select x.pr_id, x.serata, x.shot_at, 'shot', x.shot_da from public.papion_pr_presenze x
   where x.shot_at is not null and (p_pr is null or x.pr_id = p_pr) and (p_serata is null or x.serata = p_serata)
  union all
  select x.pr_id, x.serata, x.shot2_at, 'shot', x.shot2_da from public.papion_pr_presenze x
   where x.shot2_at is not null and (p_pr is null or x.pr_id = p_pr) and (p_serata is null or x.serata = p_serata)
  union all
  select r.pr_id, r.serata, r.at, 'regalo', r.operatore from public.papion_pr_regali r
   where (p_pr is null or r.pr_id = p_pr) and (p_serata is null or r.serata = p_serata)
  union all
  select s.pr_id, s.serata, s.at, 'sconto', s.operatore from public.papion_pr_sconti s
   where (p_pr is null or s.pr_id = p_pr) and (p_serata is null or s.serata = p_serata)
  union all
  select g.pr_id, g.serata, g.at, 'pagato', g.operatore from public.papion_pr_pagati g
   where (p_pr is null or g.pr_id = p_pr) and (p_serata is null or g.serata = p_serata);
$$;
revoke execute on function public._papion_bar_tocchi(uuid, date) from public, anon, authenticated;


-- ------------------------------------------------------------
-- 3 · Il pannello: scheda del PR e serata, con `bar` in più
--     (copia del 62 + la chiave `bar`)
-- ------------------------------------------------------------
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
        from public.papion_pr_tavoli t where t.pr_id = p_id), '[]'::jsonb),
    'bar', coalesce((
      select jsonb_agg(jsonb_build_object(
               'pr_id', b.pr_id, 'serata', b.serata, 'at', b.at, 'cosa', b.cosa,
               'chi', public._papion_barista(b.email), 'email', b.email)
             order by b.at)
        from public._papion_bar_tocchi(p_id, null) b), '[]'::jsonb)
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
       where t.serata = p_serata), '[]'::jsonb),
    'bar', coalesce((
      select jsonb_agg(jsonb_build_object(
               'pr_id', b.pr_id, 'serata', b.serata, 'at', b.at, 'cosa', b.cosa,
               'chi', public._papion_barista(b.email), 'email', b.email)
             order by b.at)
        from public._papion_bar_tocchi(null, p_serata) b), '[]'::jsonb)
  );
end;
$$;

revoke execute on function public.admin_papion_pr_serata(date) from public, anon;
grant execute on function public.admin_papion_pr_serata(date) to authenticated;
