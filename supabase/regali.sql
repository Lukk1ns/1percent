-- ============================================================
-- 1% — REGALI / ESTRAZIONE ISTANTANEA (area benvenuto)
-- ============================================================
-- Meccanismo: nell'area benvenuto lo STAFF scansiona il QR del
-- membro (lo stesso pass di /pass, che punta a /admin/scan?token=).
-- La scansione estrae UN regalo, UNA sola volta per membro:
--   - il risultato è deciso e registrato sul SERVER (niente Math.random
--     nel browser: non truccabile, non ri-tirabile)
--   - i premi hanno SCORTE LIMITATE che si scalano da sole
--   - re-scansione dello stesso QR → ritorna il regalo già assegnato
--     con "già ritirato" (nessun doppione)
--
-- Da incollare nel SQL Editor di Supabase (una volta sola).
-- Idempotente: si può rieseguire senza rompere nulla.
-- ============================================================

-- ------------------------------------------------------------
-- Tabelle
-- ------------------------------------------------------------

-- Catalogo premi con peso (probabilità relativa) e scorta.
-- stock = pezzi ancora disponibili. NULL = illimitato (es. "niente").
create table if not exists public.prize_types (
  id       text primary key,
  label    text not null,
  emoji    text not null,
  weight   numeric not null default 1 check (weight >= 0),
  stock    int,                          -- NULL = illimitato
  enabled  boolean not null default true,
  sort     int not null default 0
);

-- Un'estrazione per membro (la primary key su profile_id lo garantisce).
create table if not exists public.prize_draws (
  profile_id  uuid primary key references public.profiles (id) on delete cascade,
  prize_id    text not null references public.prize_types (id),
  drawn_at    timestamptz not null default now(),
  drawn_by    text,                       -- email staff che ha scansionato
  redeemed    boolean not null default true  -- consegnato al momento della scansione
);

-- Seed del catalogo (solo se il premio non esiste già: non sovrascrive
-- le scorte che Luka imposta dal pannello).
--   stock  = pezzi disponibili   ·   weight = probabilità relativa
insert into public.prize_types (id, label, emoji, weight, stock, enabled, sort) values
  ('amazon',   'BUONO AMAZON 50€',     '🛒',  1,   1,   true, 10),
  ('prosecco', 'BOTTIGLIA PROSECCO',   '🍾',  1,   1,   true, 15),
  ('bracciale','BRACCIALE',            '📿',  1,   1,   true, 18),
  ('magliette','MAGLIETTA UFFICIALE',  '👕',  5,   10,  true, 20),
  ('shot',     'SHOT',                 '🥃',  4,   10,  true, 30),
  ('drink',    'DRINK',                '🍹',  4,   10,  true, 35),
  ('torcia',   'TORCIA PORTACHIAVI',   '🔦',  6,   10,  true, 40),
  ('tictoc',   'TICTOC BOX',           '📦',  15,  30,  true, 45),
  ('bubble',   'BUBBLE WORLD',         '🫧',  12,  24,  true, 50),
  ('lollipop', 'LOLLIPOP',             '🍭',  20,  40,  true, 55),
  ('mentos',   'MENTOS',               '🍬',  20,  40,  true, 60),
  ('niente',   'NIENTE',               '😔',  15,  null, true, 99)
on conflict (id) do nothing;

-- RLS: nessuna lettura/scrittura diretta. Tutto passa dalle funzioni sotto.
alter table public.prize_types enable row level security;
alter table public.prize_draws enable row level security;

-- ------------------------------------------------------------
-- draw_prize(token) — SOLO STAFF
-- Estrae (o rilegge) il regalo del membro proprietario del QR.
-- Fa anche il check-in d'ingresso se il pass è ancora 'valid'.
-- ------------------------------------------------------------
create or replace function public.draw_prize(p_token text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_pass    public.passes;
  v_profile public.profiles;
  v_draw    public.prize_draws;
  v_prize   public.prize_types;
  v_entry   text;             -- 'first' | 'again'
  v_already boolean := false; -- il regalo era già stato assegnato?
  v_total   numeric;
  v_r       numeric;          -- soglia casuale, calcolata UNA volta
  v_pick    text;
begin
  if not public.is_admin() then
    raise exception 'Non autorizzato';
  end if;

  select * into v_pass from public.passes where qr_token = p_token;
  if v_pass is null then
    return jsonb_build_object('ok', false, 'reason', 'not_found');
  end if;

  select * into v_profile from public.profiles where id = v_pass.profile_id;
  if v_profile is null or v_profile.deleted_at is not null then
    return jsonb_build_object('ok', false, 'reason', 'not_found');
  end if;

  -- Check-in d'ingresso (indipendente dal regalo).
  if v_pass.status = 'valid' then
    update public.passes
       set status = 'checked_in', checked_in_at = now(), checked_in_by = auth.jwt() ->> 'email'
     where id = v_pass.id;
    v_entry := 'first';
  else
    v_entry := 'again';
  end if;

  -- Regalo già estratto? Rileggilo, non ne assegna un altro.
  select * into v_draw from public.prize_draws where profile_id = v_profile.id;
  if v_draw is not null then
    v_already := true;
  else
    -- Estrazione pesata tra i premi disponibili (abilitati e con scorta).
    -- Blocca le righe per evitare corse se due scanner girano insieme.
    select coalesce(sum(weight), 0) into v_total
      from public.prize_types
     where enabled and (stock is null or stock > 0);

    if v_total <= 0 then
      -- Nessun premio disponibile: fallback su 'niente' se esiste.
      v_pick := 'niente';
    else
      v_r := random() * v_total;   -- una sola estrazione casuale
      select id into v_pick
        from (
          select id, sum(weight) over (order by sort, id) as cum
            from public.prize_types
           where enabled and (stock is null or stock > 0)
        ) c
       where cum >= v_r
       order by cum
       limit 1;
      v_pick := coalesce(v_pick, 'niente');
    end if;

    -- Scala la scorta in modo atomico; se è appena finita (corsa),
    -- ripiega su 'niente'.
    update public.prize_types
       set stock = stock - 1
     where id = v_pick and (stock is null or stock > 0);
    if v_pick <> 'niente' and not found then
      v_pick := 'niente';
    end if;

    insert into public.prize_draws (profile_id, prize_id, drawn_by)
    values (v_profile.id, v_pick, auth.jwt() ->> 'email')
    on conflict (profile_id) do nothing
    returning * into v_draw;

    -- Corsa estrema: qualcun altro ha inserito nel frattempo → rileggi.
    if v_draw is null then
      select * into v_draw from public.prize_draws where profile_id = v_profile.id;
      v_already := true;
    end if;
  end if;

  select * into v_prize from public.prize_types where id = v_draw.prize_id;

  return jsonb_build_object(
    'ok', true,
    'alias', v_profile.alias,
    'avatar_id', v_profile.avatar_id,
    'member_number', v_profile.member_number,
    'entry', v_entry,
    'already', v_already,
    'prize', case when v_prize.id = 'niente' then null
                  else jsonb_build_object('id', v_prize.id, 'label', v_prize.label, 'emoji', v_prize.emoji)
             end
  );
end;
$$;

revoke execute on function public.draw_prize(text) from anon;
grant execute on function public.draw_prize(text) to authenticated;

-- ------------------------------------------------------------
-- my_prize() — il membro loggato legge il proprio regalo
-- ------------------------------------------------------------
create or replace function public.my_prize()
returns jsonb
language plpgsql
security definer
set search_path = public
stable
as $$
declare
  v_draw  public.prize_draws;
  v_prize public.prize_types;
begin
  select * into v_draw from public.prize_draws where profile_id = auth.uid();
  if v_draw is null then
    return jsonb_build_object('drawn', false);
  end if;
  select * into v_prize from public.prize_types where id = v_draw.prize_id;
  return jsonb_build_object(
    'drawn', true,
    'drawn_at', v_draw.drawn_at,
    'prize', case when v_prize.id = 'niente' then null
                  else jsonb_build_object('id', v_prize.id, 'label', v_prize.label, 'emoji', v_prize.emoji)
             end
  );
end;
$$;

revoke execute on function public.my_prize() from anon;
grant execute on function public.my_prize() to authenticated;

-- ------------------------------------------------------------
-- prize_pool() — montepremi vetrina (label+emoji, niente scorte/PII)
-- Per mostrare "cosa puoi vincere" nella pagina membro.
-- ------------------------------------------------------------
create or replace function public.prize_pool()
returns jsonb
language sql
security definer
set search_path = public
stable
as $$
  select coalesce(jsonb_agg(
           jsonb_build_object('label', label, 'emoji', emoji)
           order by sort
         ), '[]'::jsonb)
    from public.prize_types
   where enabled and id <> 'niente';
$$;

grant execute on function public.prize_pool() to anon, authenticated;

-- ------------------------------------------------------------
-- admin_prize_dashboard() — SOLO STAFF: scorte + assegnati
-- ------------------------------------------------------------
create or replace function public.admin_prize_dashboard()
returns jsonb
language plpgsql
security definer
set search_path = public
stable
as $$
begin
  if not public.is_admin() then
    raise exception 'Non autorizzato';
  end if;

  return jsonb_build_object(
    'prizes', (
      select coalesce(jsonb_agg(
               jsonb_build_object(
                 'id', p.id,
                 'label', p.label,
                 'emoji', p.emoji,
                 'weight', p.weight,
                 'stock', p.stock,
                 'enabled', p.enabled,
                 'assigned', (select count(*) from public.prize_draws d where d.prize_id = p.id)
               ) order by p.sort
             ), '[]'::jsonb)
        from public.prize_types p
    ),
    'total_draws', (select count(*) from public.prize_draws),
    'won_draws',   (select count(*) from public.prize_draws where prize_id <> 'niente'),
    'winners', (
      select coalesce(jsonb_agg(
               jsonb_build_object(
                 'alias', pr.alias,
                 'member_number', pr.member_number,
                 'emoji', pt.emoji,
                 'label', pt.label,
                 'drawn_at', d.drawn_at
               ) order by d.drawn_at desc
             ), '[]'::jsonb)
        from public.prize_draws d
        join public.profiles pr on pr.id = d.profile_id
        join public.prize_types pt on pt.id = d.prize_id
       where d.prize_id <> 'niente'
    )
  );
end;
$$;

revoke execute on function public.admin_prize_dashboard() from anon;
grant execute on function public.admin_prize_dashboard() to authenticated;

-- ------------------------------------------------------------
-- admin_set_prize(id, stock, weight, enabled) — SOLO STAFF
-- Modifica scorta / peso / on-off di un premio dal pannello.
-- ------------------------------------------------------------
create or replace function public.admin_set_prize(
  p_id      text,
  p_stock   int,
  p_weight  numeric,
  p_enabled boolean
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception 'Non autorizzato';
  end if;

  update public.prize_types
     set stock   = p_stock,        -- NULL ammesso = illimitato
         weight  = greatest(p_weight, 0),
         enabled = p_enabled
   where id = p_id;

  if not found then
    return jsonb_build_object('ok', false, 'reason', 'not_found');
  end if;
  return jsonb_build_object('ok', true);
end;
$$;

revoke execute on function public.admin_set_prize(text, int, numeric, boolean) from anon;
grant execute on function public.admin_set_prize(text, int, numeric, boolean) to authenticated;

-- ------------------------------------------------------------
-- admin_reset_prize(member_number) — SOLO STAFF
-- Annulla l'estrazione di un membro così può ri-tirare.
-- Se aveva vinto un premio a scorta finita, glielo rimette in magazzino.
-- ------------------------------------------------------------
create or replace function public.admin_reset_prize(p_member_number int)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_profile public.profiles;
  v_draw    public.prize_draws;
begin
  if not public.is_admin() then
    raise exception 'Non autorizzato';
  end if;

  select * into v_profile
    from public.profiles
   where member_number = p_member_number and deleted_at is null;
  if v_profile is null then
    return jsonb_build_object('ok', false, 'reason', 'not_found');
  end if;

  select * into v_draw from public.prize_draws where profile_id = v_profile.id;
  if v_draw is null then
    return jsonb_build_object('ok', false, 'reason', 'no_draw', 'alias', v_profile.alias);
  end if;

  -- Rimetti in scorta il premio annullato (solo se non è 'niente' e ha scorta finita).
  update public.prize_types
     set stock = stock + 1
   where id = v_draw.prize_id and stock is not null;

  delete from public.prize_draws where profile_id = v_profile.id;

  return jsonb_build_object(
    'ok', true,
    'alias', v_profile.alias,
    'member_number', v_profile.member_number,
    'restored', v_draw.prize_id
  );
end;
$$;

revoke execute on function public.admin_reset_prize(int) from anon;
grant execute on function public.admin_reset_prize(int) to authenticated;
