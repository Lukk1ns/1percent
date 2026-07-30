-- ============================================================
-- 1% — L'ESTRAZIONE DIVENTA DI OGNI SERATA (step 5)
--
-- Da eseguire DOPO regali.sql e DOPO 05_carta_crew.sql.
-- Incollalo tutto e premi Run. È idempotente.
--
-- Come funziona lo STAND UNPERCENTO:
--   · dentro il locale c'è il nostro stand. Non è la porta: all'ingresso
--     si entra normalmente, lo stand è un'altra cosa.
--   · chi passa fa scansionare il suo QR: parte l'estrazione e ritira
--     subito quello che ha vinto.
--   · quella stessa scansione vale come PRESENZA alla serata: un solo
--     scan fa tutto (regalo + presenza che conta per le tessere crew).
--   · si gioca UNA VOLTA PER SERATA, non una volta nella vita: alla
--     serata dopo tutti rigiocano. Anche i PR: allo stand ci passano
--     anche loro, e possono vincere drink e shot come i clienti.
--
-- Prima l'estrazione era una sola per persona per sempre: questo script
-- la lega alla serata.
-- ============================================================

-- ============================================================
-- 0. CONTROLLO: prima serve 05_carta_crew.sql
--
-- Senza, non esistono né le presenze né la funzione che trova la
-- serata in corso, e questo script non ha su cosa appoggiarsi.
-- ============================================================

do $$
begin
  if to_regprocedure('public.evento_in_corso()') is null
     or to_regclass('public.checkins') is null then
    raise exception
      'Prima incolla supabase/05_carta_crew.sql: qui mancano le presenze e evento_in_corso().';
  end if;
end $$;


-- ============================================================
-- 1. UNA GIOCATA PER SERATA
-- ============================================================

alter table public.prize_draws
  add column if not exists event_id uuid references public.events (id) on delete set null;

-- La vecchia chiave era il profilo: bloccava tutti dopo la prima serata.
alter table public.prize_draws drop constraint if exists prize_draws_pkey;
alter table public.prize_draws add column if not exists id uuid not null default gen_random_uuid();

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.prize_draws'::regclass and contype = 'p'
  ) then
    alter table public.prize_draws add primary key (id);
  end if;
end $$;

create unique index if not exists prize_draws_una_per_serata
  on public.prize_draws (profile_id, event_id);


-- ============================================================
-- 2. L'ESTRAZIONE ALLO STAND — SOLO STAFF
--
-- Stessa funzione di prima (lo scanner non cambia), ma la giocata è
-- legata alla serata in corso e registra anche la presenza.
-- ============================================================

create or replace function public.draw_prize(p_token text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_profile  public.profiles;
  v_evento   public.events;
  v_event_id uuid;
  v_draw     public.prize_draws;
  v_prize    public.prize_types;
  v_already  boolean := false;
  v_presenza boolean := false;
  v_total    numeric;
  v_r        numeric;
  v_pick     text;
begin
  if not public.is_staff() then
    raise exception 'Non autorizzato';
  end if;

  -- Accetta sia il QR del pass sia quello statico del profilo
  select p.* into v_profile
  from public.profiles p
  where (p.qr_token = p_token
         or p.id = (select pa.profile_id from public.passes pa where pa.qr_token = p_token))
    and p.deleted_at is null;

  if v_profile is null then
    return jsonb_build_object('ok', false, 'reason', 'not_found');
  end if;

  select * into v_evento from public.evento_in_corso();
  v_event_id := v_evento.id;

  -- La presenza: è lo stesso scan, non se ne fa un altro alla porta
  if v_event_id is not null then
    insert into public.checkins (profile_id, event_id, by_email)
    values (v_profile.id, v_event_id, lower(auth.jwt() ->> 'email'))
    on conflict (profile_id, event_id) do nothing;
    v_presenza := found;
  end if;

  -- Ha già giocato STASERA? Rileggi, non si gioca due volte per serata.
  select * into v_draw
  from public.prize_draws
  where profile_id = v_profile.id
    and event_id is not distinct from v_event_id;

  if v_draw is not null then
    v_already := true;
  else
    select coalesce(sum(weight), 0) into v_total
      from public.prize_types
     where enabled and (stock is null or stock > 0);

    if v_total <= 0 then
      v_pick := 'niente';
    else
      v_r := random() * v_total;
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

    update public.prize_types
       set stock = stock - 1
     where id = v_pick and (stock is null or stock > 0);
    if v_pick <> 'niente' and not found then
      v_pick := 'niente';
    end if;

    insert into public.prize_draws (profile_id, event_id, prize_id, drawn_by)
    values (v_profile.id, v_event_id, v_pick, auth.jwt() ->> 'email')
    on conflict (profile_id, event_id) do nothing
    returning * into v_draw;

    if v_draw is null then
      select * into v_draw
      from public.prize_draws
      where profile_id = v_profile.id and event_id is not distinct from v_event_id;
      v_already := true;
    end if;
  end if;

  select * into v_prize from public.prize_types where id = v_draw.prize_id;

  return jsonb_build_object(
    'ok', true,
    'alias', v_profile.alias,
    'avatar_id', v_profile.avatar_id,
    'member_number', v_profile.member_number,
    'entry', case when v_presenza then 'first' else 'again' end,
    'already', v_already,
    'evento', v_evento.name,
    'senza_evento', v_event_id is null,
    'ruolo', v_profile.role,
    'prize', case when v_prize.id = 'niente' then null
                  else jsonb_build_object('id', v_prize.id, 'label', v_prize.label, 'emoji', v_prize.emoji)
             end
  );
end;
$$;

revoke execute on function public.draw_prize(text) from anon;
grant execute on function public.draw_prize(text) to authenticated;


-- ============================================================
-- 3. IL PROPRIO REGALO — quello di stasera
-- ============================================================

create or replace function public.my_prize()
returns jsonb
language plpgsql
security definer
set search_path = public
stable
as $$
declare
  v_evento public.events;
  v_draw   public.prize_draws;
  v_prize  public.prize_types;
  v_vecchia boolean := false;
begin
  select * into v_evento from public.evento_in_corso();

  if v_evento.id is not null then
    select * into v_draw
    from public.prize_draws
    where profile_id = auth.uid() and event_id = v_evento.id;
  else
    -- Fuori serata: mostro l'ultima giocata, dichiarando che è passata
    select * into v_draw
    from public.prize_draws
    where profile_id = auth.uid()
    order by drawn_at desc
    limit 1;
    v_vecchia := v_draw is not null;
  end if;

  if v_draw is null then
    return jsonb_build_object('drawn', false);
  end if;

  select * into v_prize from public.prize_types where id = v_draw.prize_id;
  return jsonb_build_object(
    'drawn', true,
    'drawn_at', v_draw.drawn_at,
    'passata', v_vecchia,
    'prize', case when v_prize.id = 'niente' then null
                  else jsonb_build_object('id', v_prize.id, 'label', v_prize.label, 'emoji', v_prize.emoji)
             end
  );
end;
$$;

revoke execute on function public.my_prize() from anon;
grant execute on function public.my_prize() to authenticated;


-- ============================================================
-- 4. ANNULLARE UNA GIOCATA — quella della serata in corso
-- ============================================================

create or replace function public.admin_reset_prize(p_member_number int)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_profile public.profiles;
  v_evento  public.events;
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

  select * into v_evento from public.evento_in_corso();

  select * into v_draw
    from public.prize_draws
   where profile_id = v_profile.id
     and event_id is not distinct from v_evento.id;

  if v_draw is null then
    return jsonb_build_object('ok', false, 'reason', 'no_draw', 'alias', v_profile.alias);
  end if;

  update public.prize_types
     set stock = stock + 1
   where id = v_draw.prize_id and stock is not null;

  delete from public.prize_draws where id = v_draw.id;

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


-- ============================================================
-- VERIFICA
-- ============================================================
select
  (select name from public.evento_in_corso())                          as serata_in_corso,
  (select count(*) from public.prize_draws)                            as giocate_totali,
  (select count(*) from public.prize_draws where event_id is not null) as giocate_legate_a_una_serata;
