-- ============================================================
-- 20 — LA PORTA  (Fase 2 delle prevendite)
--
-- Fino a ieri il QR sul biglietto non lo leggeva nessuno: `/admin/scan`
-- è lo scanner dello STAND, quello dei regali, ed è un altro mestiere.
-- Questo è l'ingresso.
--
-- Chi può stare in porta: admin **e operatori** (`is_staff()`), perché
-- in porta ci sono i collaboratori, non Luka. Una sola cosa resta di
-- Luka soltanto: far entrare un biglietto che il PR non ha ancora
-- pagato.
--
-- Regola che vale più di tutte: **un biglietto entra una volta sola**.
-- Il secondo tentativo dice quando è passato il primo.
--
-- Da incollare nel SQL Editor. Si può rieseguire.
-- ============================================================


-- Quando e da chi è entrato: serve per il "già passato alle 23:47"
alter table public.presales add column if not exists entrata_da text;


-- ------------------------------------------------------------
-- IL CHECK-IN
--
-- Ritorna sempre una riga, anche quando va male: la porta deve sapere
-- cosa dire, non ricevere un errore.
--   ok             → passa
--   gia_usato      → è già entrato (e quando)
--   non_pagato     → il PR non ha consegnato: decide Luka
--   annullato      → biglietto annullato
--   altra_serata   → è il biglietto di un'altra serata
--   sconosciuto    → questo QR non è un biglietto
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
  v_b   record;
  v_pr  text;
  v_ev  text;
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
    return query select 'sconosciuto'::text, null::text, null::text, null::text,
                        null::numeric, null::boolean, null::boolean,
                        null::text, null::text, null::timestamptz, null::uuid;
    return;
  end if;

  v_pr := coalesce(v_b.alias_pr, 'DIREZIONE');
  v_ev := v_b.nome_evento;

  -- Se la porta sta lavorando su una serata precisa, un biglietto di
  -- un'altra sera non deve passare per distrazione.
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

  -- Valido: si brucia adesso.
  update public.presales s
     set stato = 'usata',
         usata_at = now(),
         usata_da = (auth.jwt() ->> 'email'),
         entrata_da = (auth.jwt() ->> 'email')
   where s.id = v_b.id and s.stato = 'attiva';

  if not found then
    -- Qualcun altro l'ha scansionato nello stesso istante: vince il primo.
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


-- ------------------------------------------------------------
-- FALLO ENTRARE LO STESSO
--
-- Il PR non ha ancora portato i soldi ma il cliente è lì davanti e ha
-- pagato: decide Luka, e resta scritto che è passato così.
-- Solo admin: un collaboratore in porta non può.
-- ------------------------------------------------------------
create or replace function public.porta_forza(p_id uuid)
returns table (esito text, nome text, cognome text)
language plpgsql
security definer
set search_path = public
as $$
declare v_b record;
begin
  if not public.is_admin() then
    raise exception 'Solo l''amministratore può farlo entrare senza pagamento';
  end if;

  select s.* into v_b from public.presales s where s.id = p_id;
  if not found then
    return query select 'non_trovato'::text, null::text, null::text; return;
  end if;
  if v_b.stato = 'usata' then
    return query select 'gia_usato'::text, v_b.nome, v_b.cognome; return;
  end if;

  update public.presales s
     set stato = 'usata',
         attivata_at = coalesce(s.attivata_at, now()),
         attivata_da = coalesce(s.attivata_da, (auth.jwt() ->> 'email') || ' (in porta)'),
         usata_at = now(),
         usata_da = (auth.jwt() ->> 'email'),
         entrata_da = (auth.jwt() ->> 'email') || ' (fatto entrare senza pagamento)'
   where s.id = p_id;

  return query select 'ok'::text, v_b.nome, v_b.cognome;
end;
$$;

grant execute on function public.porta_forza(uuid) to authenticated;


-- ------------------------------------------------------------
-- CERCARE PER NOME
--
-- Il telefono scarico, il QR che non si legge, lo screenshot cancellato:
-- succede. Si cerca il nome e si fa entrare da qui.
-- ------------------------------------------------------------
create or replace function public.porta_cerca(p_event uuid, p_testo text)
returns table (
  id         uuid,
  nome       text,
  cognome    text,
  tier_label text,
  stato      text,
  pr_alias   text,
  minorenne  boolean,
  under16    boolean,
  token      text
)
language plpgsql
security definer
set search_path = public
stable
as $$
begin
  if not public.is_staff() then
    raise exception 'Non autorizzato';
  end if;

  if coalesce(trim(p_testo), '') = '' or length(trim(p_testo)) < 2 then
    return;
  end if;

  return query
    select s.id, s.nome, s.cognome, s.tier_label, s.stato,
           coalesce(p.alias, 'DIREZIONE'),
           (extract(year from now())::int - s.anno_nascita) < 18,
           (extract(year from now())::int - s.anno_nascita) < 16,
           s.token
    from public.presales s
    left join public.profiles p on p.id = s.pr_id
    where s.event_id = p_event
      and s.stato <> 'annullata'
      and (s.nome || ' ' || s.cognome) ilike '%' || trim(p_testo) || '%'
    order by s.cognome, s.nome
    limit 25;
end;
$$;

grant execute on function public.porta_cerca(uuid, text) to authenticated;


-- ------------------------------------------------------------
-- QUANTI SONO ENTRATI
-- ------------------------------------------------------------
create or replace function public.porta_riepilogo(p_event uuid)
returns table (
  entrati      int,
  attesi       int,
  non_pagati   int,
  ultimi       jsonb
)
language plpgsql
security definer
set search_path = public
stable
as $$
begin
  if not public.is_staff() then
    raise exception 'Non autorizzato';
  end if;

  return query
  select
    (select count(*) from public.presales s
      where s.event_id = p_event and s.stato = 'usata')::int,
    (select count(*) from public.presales s
      where s.event_id = p_event and s.stato in ('attiva','usata'))::int,
    (select count(*) from public.presales s
      where s.event_id = p_event and s.stato = 'in_attesa')::int,
    (select coalesce(jsonb_agg(x), '[]'::jsonb) from (
       select s.nome, s.cognome, s.usata_at
       from public.presales s
       where s.event_id = p_event and s.stato = 'usata'
       order by s.usata_at desc
       limit 8
     ) x);
end;
$$;

grant execute on function public.porta_riepilogo(uuid) to authenticated;


-- ------------------------------------------------------------
-- LE SERATE SU CUI LAVORA LA PORTA
-- Solo quelle di oggi e domani: in porta non si sbaglia serata.
-- ------------------------------------------------------------
create or replace function public.porta_serate()
returns table (event_id uuid, nome text, starts_at timestamptz, biglietti int)
language plpgsql
security definer
set search_path = public
stable
as $$
begin
  if not public.is_staff() then
    raise exception 'Non autorizzato';
  end if;

  return query
    select e.id, e.name, e.starts_at,
           (select count(*) from public.presales s
             where s.event_id = e.id and s.stato <> 'annullata')::int
    from public.events e
    where e.starts_at between now() - interval '18 hours' and now() + interval '10 days'
    order by e.starts_at;
end;
$$;

grant execute on function public.porta_serate() to authenticated;


-- ============================================================
-- Controllo
-- ============================================================
select
  (select count(*) from public.presales where stato = 'usata') as "già entrati finora";
