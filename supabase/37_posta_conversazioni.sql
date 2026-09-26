-- ============================================================
-- 37 · RISPONDERE A CHI SCRIVE NELLA POSTA
--
-- Luka, 26 settembre 2026: *"a chi mi segnala le foto e mi scrive la
-- motivazione che mi arriva nella posta dovrei poter rispondere a quegli
-- utenti e avviare una conversazione"*.
--
-- Fino a qui la richiesta di togliere una foto era a senso unico: la
-- persona scriveva il motivo, Luka la leggeva in /admin/posta, e poteva
-- solo togliere la foto o lasciarla. Nessun modo di dire "fatto" o di
-- chiedere "quale sei?".
--
-- La conversazione è **una per persona**, fra lei e la direzione, non una
-- per richiesta: chi chiede di togliere tre foto parla con Luka in un
-- posto solo. La persona la trova nei suoi Messaggi, con il pallino come
-- per una chat normale, e può rispondere.
--
-- **La apre solo la direzione.** Una persona non può scrivere per prima:
-- risponde a una conversazione che Luka ha già cominciato. Così non
-- nasce un secondo canale di posta da tenere pulito.
--
-- Da incollare nel SQL Editor. Si può rieseguire.
-- ============================================================


-- ------------------------------------------------------------
-- La tabella
-- ------------------------------------------------------------
create table if not exists public.direzione_messaggi (
  id           uuid primary key default gen_random_uuid(),
  profile_id   uuid not null references public.profiles (id) on delete cascade,
  da_direzione boolean not null,
  testo        text not null check (char_length(testo) between 1 and 1000),
  -- La richiesta di rimozione da cui è partito il discorso: serve a
  -- mostrare, sopra il primo messaggio, di quale foto si parla.
  rimozione_id uuid references public.photo_removal_requests (id) on delete set null,
  created_at   timestamptz not null default now(),
  letto_at     timestamptz
);

create index if not exists direzione_messaggi_profilo_idx
  on public.direzione_messaggi (profile_id, created_at);

alter table public.direzione_messaggi enable row level security;

-- Lettura diretta: ognuno i suoi, l'admin tutti. Serve al tempo reale
-- (il pallino che si accende senza ricaricare). Si scrive solo con le
-- funzioni qui sotto. Nella tabella non c'è la mail di chi ha risposto,
-- apposta: la leggerebbe anche l'utente.
drop policy if exists "direzione_leggo_i_miei" on public.direzione_messaggi;
create policy "direzione_leggo_i_miei"
  on public.direzione_messaggi for select
  using (profile_id = auth.uid() or public.is_admin());

do $$
begin
  alter publication supabase_realtime add table public.direzione_messaggi;
exception when duplicate_object then null;
end $$;


-- ============================================================
-- LATO DIREZIONE
-- ============================================================

-- Scrivere a una persona. Apre la conversazione se non c'è ancora.
create or replace function public.admin_direzione_scrivi(
  p_profile   uuid,
  p_testo     text,
  p_rimozione uuid default null
)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_testo text := trim(coalesce(p_testo, ''));
  v_rim   uuid := p_rimozione;
begin
  if not public.is_admin() then
    raise exception 'Non autorizzato';
  end if;

  if v_testo = '' then return 'vuoto'; end if;
  if char_length(v_testo) > 1000 then return 'troppo_lungo'; end if;

  if not exists (
    select 1 from public.profiles p where p.id = p_profile and p.deleted_at is null
  ) then
    return 'non_trovato';
  end if;

  -- La richiesta va attaccata solo al primo messaggio che ne parla, e
  -- solo se è davvero di questa persona.
  if v_rim is not null and (
    not exists (
      select 1 from public.photo_removal_requests r
       where r.id = v_rim and r.profile_id = p_profile
    )
    or exists (
      select 1 from public.direzione_messaggi m where m.rimozione_id = v_rim
    )
  ) then
    v_rim := null;
  end if;

  insert into public.direzione_messaggi (profile_id, da_direzione, testo, rimozione_id)
  values (p_profile, true, v_testo, v_rim);

  return 'ok';
end;
$$;

revoke execute on function public.admin_direzione_scrivi(uuid, text, uuid) from public, anon;
grant execute on function public.admin_direzione_scrivi(uuid, text, uuid) to authenticated;


-- La conversazione con una persona. Aprirla la segna come letta.
create or replace function public.admin_direzione_thread(p_profile uuid)
returns table (
  id           uuid,
  da_direzione boolean,
  testo        text,
  created_at   timestamptz,
  letto_at     timestamptz,
  album        text,
  album_slug   text,
  photo_id     uuid,
  motivo       text
)
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception 'Non autorizzato';
  end if;

  update public.direzione_messaggi m
     set letto_at = now()
   where m.profile_id = p_profile and not m.da_direzione and m.letto_at is null;

  return query
    select m.id, m.da_direzione, m.testo, m.created_at, m.letto_at,
           a.nome, a.slug, r.photo_id, r.motivo
      from public.direzione_messaggi m
      left join public.photo_removal_requests r on r.id = m.rimozione_id
      left join public.photos f on f.id = r.photo_id
      left join public.albums a on a.id = f.album_id
     where m.profile_id = p_profile
     order by m.created_at
     limit 300;
end;
$$;

revoke execute on function public.admin_direzione_thread(uuid) from public, anon;
grant execute on function public.admin_direzione_thread(uuid) to authenticated;


-- Tutte le conversazioni aperte, quelle con una risposta da leggere in cima.
create or replace function public.admin_direzione_conversazioni()
returns table (
  profile_id    uuid,
  alias         text,
  nome          text,
  numero        int,
  ultimo_testo  text,
  ultimo_mio    boolean,
  ultimo_at     timestamptz,
  non_letti     int
)
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
    select p.id, p.alias, p.nome, p.member_number,
           u.testo, u.da_direzione, u.created_at,
           (select count(*)::int from public.direzione_messaggi x
             where x.profile_id = p.id and not x.da_direzione and x.letto_at is null)
      from public.profiles p
      join lateral (
        select m.testo, m.da_direzione, m.created_at
          from public.direzione_messaggi m
         where m.profile_id = p.id
         order by m.created_at desc
         limit 1
      ) u on true
     where p.deleted_at is null
     order by 8 desc, u.created_at desc
     limit 200;
end;
$$;

revoke execute on function public.admin_direzione_conversazioni() from public, anon;
grant execute on function public.admin_direzione_conversazioni() to authenticated;


-- ------------------------------------------------------------
-- Le richieste di rimozione adesso dicono anche CHI (l'id), così dalla
-- scheda si apre la conversazione con quella persona.
-- Cambia la forma del risultato: va tolta e rifatta.
-- ------------------------------------------------------------
drop function if exists public.admin_rimozioni();

create function public.admin_rimozioni()
returns table (
  id         uuid,
  photo_id   uuid,
  album      text,
  album_slug text,
  chi        text,
  numero     int,
  motivo     text,
  stato      text,
  quando     timestamptz,
  chiusa_da  text,
  profile_id uuid
)
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
    select r.id, r.photo_id, a.nome, a.slug, p.alias, p.member_number,
           r.motivo, r.stato, r.created_at, r.handled_by,
           case when p.deleted_at is null then p.id end
      from public.photo_removal_requests r
      join public.photos f on f.id = r.photo_id
      join public.albums a on a.id = f.album_id
      left join public.profiles p on p.id = r.profile_id
     order by (r.stato = 'aperta') desc, r.created_at desc
     limit 200;
end;
$$;

revoke execute on function public.admin_rimozioni() from public, anon;
grant execute on function public.admin_rimozioni() to authenticated;


-- ------------------------------------------------------------
-- Il contatore della posta conta anche le risposte da leggere.
-- Cambia la forma del risultato: va tolta e rifatta.
-- ------------------------------------------------------------
drop function if exists public.admin_notifiche();

create function public.admin_notifiche()
returns table (
  rimozioni    int,
  segnalazioni int,
  candidature  int,
  bacheca      int,
  risposte     int,
  totale       int
)
language plpgsql
security definer
set search_path = public
stable
as $$
declare
  v_rim int := 0;
  v_seg int := 0;
  v_can int := 0;
  v_bac int := 0;
  v_ris int := 0;
begin
  if not public.is_admin() then
    raise exception 'Non autorizzato';
  end if;

  -- Ogni pezzo dentro il suo controllo: se una tabella non c'è ancora
  -- il resto deve arrivare lo stesso (come nello script 33).
  begin
    select count(*)::int into v_rim
      from public.photo_removal_requests r where r.stato = 'aperta';
  exception when others then v_rim := 0;
  end;

  begin
    select count(*)::int into v_seg
      from public.reports r where r.status = 'open';
  exception when others then v_seg := 0;
  end;

  begin
    select count(*)::int into v_can
      from public.profiles p
     where p.crew_request_status = 'in_attesa' and p.deleted_at is null;
  exception when others then v_can := 0;
  end;

  begin
    select count(*)::int into v_bac from public.admin_pending_posts();
  exception when others then v_bac := 0;
  end;

  -- Le persone che hanno risposto e aspettano di essere lette.
  begin
    select count(distinct m.profile_id)::int into v_ris
      from public.direzione_messaggi m
      join public.profiles p on p.id = m.profile_id and p.deleted_at is null
     where not m.da_direzione and m.letto_at is null;
  exception when others then v_ris := 0;
  end;

  return query select v_rim, v_seg, v_can, v_bac, v_ris,
                      (v_rim + v_seg + v_can + v_bac + v_ris);
end;
$$;

revoke execute on function public.admin_notifiche() from public, anon;
grant execute on function public.admin_notifiche() to authenticated;


-- ============================================================
-- LATO PERSONA
-- ============================================================

-- La mia conversazione con la direzione. Aprirla la segna come letta.
create or replace function public.direzione_miei()
returns table (
  id           uuid,
  da_direzione boolean,
  testo        text,
  created_at   timestamptz,
  letto_at     timestamptz,
  album        text,
  album_slug   text,
  photo_id     uuid,
  motivo       text
)
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'Nessuna sessione attiva';
  end if;

  update public.direzione_messaggi m
     set letto_at = now()
   where m.profile_id = auth.uid() and m.da_direzione and m.letto_at is null;

  return query
    select m.id, m.da_direzione, m.testo, m.created_at, m.letto_at,
           a.nome, a.slug, r.photo_id, r.motivo
      from public.direzione_messaggi m
      left join public.photo_removal_requests r on r.id = m.rimozione_id
      left join public.photos f on f.id = r.photo_id
      left join public.albums a on a.id = f.album_id
     where m.profile_id = auth.uid()
     order by m.created_at
     limit 300;
end;
$$;

revoke execute on function public.direzione_miei() from public, anon;
grant execute on function public.direzione_miei() to authenticated;


-- Per l'elenco dei Messaggi: c'è una conversazione? ultimo messaggio e
-- quanti da leggere. Non segna niente come letto. null = nessuna.
create or replace function public.direzione_riepilogo()
returns jsonb
language sql
security definer
set search_path = public
stable
as $$
  select case when u.created_at is null then null else jsonb_build_object(
    'ultimo_testo', u.testo,
    'ultimo_mio',   not u.da_direzione,
    'ultimo_at',    u.created_at,
    'non_letti',    (select count(*) from public.direzione_messaggi x
                      where x.profile_id = auth.uid() and x.da_direzione
                        and x.letto_at is null)
  ) end
  from (select 1) uno
  left join lateral (
    select m.testo, m.da_direzione, m.created_at
      from public.direzione_messaggi m
     where m.profile_id = auth.uid()
     order by m.created_at desc
     limit 1
  ) u on true;
$$;

revoke execute on function public.direzione_riepilogo() from public, anon;
grant execute on function public.direzione_riepilogo() to authenticated;


-- Rispondere. Solo dentro una conversazione che la direzione ha aperto.
create or replace function public.direzione_rispondi(p_testo text)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_me    uuid := auth.uid();
  v_testo text := trim(coalesce(p_testo, ''));
begin
  if v_me is null then
    raise exception 'Nessuna sessione attiva';
  end if;

  if v_testo = '' then return 'vuoto'; end if;
  if char_length(v_testo) > 1000 then return 'troppo_lungo'; end if;

  if not exists (
    select 1 from public.profiles p where p.id = v_me and p.deleted_at is null
  ) then
    return 'chiusa';
  end if;

  if not exists (
    select 1 from public.direzione_messaggi m
     where m.profile_id = v_me and m.da_direzione
  ) then
    return 'chiusa';
  end if;

  -- Anti-raffica, come nelle chat fra membri.
  if (select count(*) from public.direzione_messaggi m
       where m.profile_id = v_me and not m.da_direzione
         and m.created_at > now() - interval '1 minute') >= 10
  or (select count(*) from public.direzione_messaggi m
       where m.profile_id = v_me and not m.da_direzione
         and m.created_at > now() - interval '1 day') >= 60
  then
    return 'rate';
  end if;

  insert into public.direzione_messaggi (profile_id, da_direzione, testo)
  values (v_me, false, v_testo);

  return 'ok';
end;
$$;

revoke execute on function public.direzione_rispondi(text) from public, anon;
grant execute on function public.direzione_rispondi(text) to authenticated;


-- ------------------------------------------------------------
-- Il pallino dei messaggi (in alto su tutto il sito) conta anche
-- quelli della direzione. Stessa firma dello script messaggi.sql,
-- con una voce in più.
-- ------------------------------------------------------------
create or replace function public.inbox_badge()
returns jsonb
language sql
security definer
set search_path = public
stable
as $$
  select jsonb_build_object(
    'unread', (
      select count(*) from messages m
      join conversations c on c.id = m.conversation_id
      where auth.uid() in (c.a, c.b)
        and m.sender <> auth.uid()
        and m.read_at is null
    ) + (
      select count(*) from direzione_messaggi d
      where d.profile_id = auth.uid()
        and d.da_direzione
        and d.letto_at is null
    ),
    'requests', (
      select count(*) from chat_requests
      where to_profile = auth.uid() and status = 'pending'
    ),
    'direzione', (
      select count(*) from direzione_messaggi d
      where d.profile_id = auth.uid()
        and d.da_direzione
        and d.letto_at is null
    )
  );
$$;

grant execute on function public.inbox_badge() to authenticated;


-- ============================================================
-- Controllo: deve uscire una riga con 0 conversazioni (è nuova) e
-- la tabella con la sicurezza accesa.
-- ============================================================
select
  (select count(*) from public.direzione_messaggi) as messaggi,
  (select relrowsecurity from pg_class where oid = 'public.direzione_messaggi'::regclass) as sicurezza_accesa;
