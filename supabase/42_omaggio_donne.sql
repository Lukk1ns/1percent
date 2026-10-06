-- ============================================================
-- 42 — DONNA OMAGGIO: la pagina dedicata di sabato 17 ottobre
--
-- Chiesto da Luka il 6 ottobre 2026 per MALDITA · OFFICIAL OPENING,
-- l'apertura del nuovo PAPI-ON: *"diamo solo TOT posti omaggio a donne
-- che entrano entro le 00:30 facendosi scannerizzare"*.
--
-- È un servizio che unpercento.it fa per QUELLA serata, staccato da
-- tutto il resto del sito: niente PR, niente prevendite, niente punti,
-- niente eccezioni. La serata viene creata NON pubblicata, quindi non
-- compare in home né fra gli eventi dell'1%: la vede solo la porta.
--
-- COME FUNZIONA
--   · la ragazza si iscrive su unpercento.it/maldita (nome, cognome,
--     data di nascita, WhatsApp, Instagram facoltativo) e riceve la sua
--     pagina personale: "in attesa", poi il QR quando è approvata;
--   · l'approvazione la decide Luka dal pannello, in tutti i modi:
--     una per una, in blocco, oppure in automatico fino ai posti;
--   · finiti i posti, chi arriva dopo va in lista d'attesa;
--   · le iscrizioni chiudono da sole venerdì 16 alle 23:59;
--   · approvata = un omaggio vero (prezzo 0, stesso QR, stessa porta),
--     con in più una SCADENZA: dopo le 00:30 di sabato notte la porta
--     dice "SCADUTO". Senza tolleranza, deciso da Luka.
--
-- PRIMA DI QUESTO vanno incollati il 40 e il 41, in quest'ordine:
-- se mancano, lo script si ferma da solo alla prima riga e non tocca
-- niente. Si può rieseguire.
-- ============================================================


-- ------------------------------------------------------------
-- 0 · Il 40 e il 41 devono esserci già
--
-- Questo script riscrive `porta_checkin`, che il 40 aveva appena
-- cambiato: se il 40 arrivasse DOPO, si mangerebbe la scadenza delle
-- 00:30. E il numero WhatsApp si pulisce con la regola del 41.
-- ------------------------------------------------------------
do $$
begin
  if to_regprocedure('public._ingresso_soglia(uuid)') is null then
    raise exception 'Manca lo script 40. Incolla prima il 40, poi il 41, poi di nuovo questo.';
  end if;
  if to_regprocedure('public._numero_whatsapp(text)') is null then
    raise exception 'Manca lo script 41. Incolla prima il 41, poi di nuovo questo.';
  end if;
end $$;


-- ------------------------------------------------------------
-- 1 · Il biglietto può scadere
--
-- null = vale tutta la sera, come sempre. Con un orario, dopo quello
-- la porta non lo fa passare. Oggi lo usano solo gli omaggi donna.
-- ------------------------------------------------------------
alter table public.presales add column if not exists valido_fino timestamptz;


-- ------------------------------------------------------------
-- 2 · La lista (una per pagina) e le iscrizioni
-- ------------------------------------------------------------
create table if not exists public.omaggio_liste (
  slug           text primary key,            -- l'indirizzo: unpercento.it/<slug>
  event_id       uuid not null references public.events (id) on delete restrict,
  titolo         text not null,
  aperta         boolean not null default true,   -- l'interruttore di Luka
  modo           text not null default 'mano' check (modo in ('mano', 'auto')),
  posti          int check (posti is null or posti >= 0),  -- null = non ancora deciso
  chiude_at      timestamptz not null,            -- fine iscrizioni
  valido_fino    timestamptz not null,            -- dopo quest'ora il QR non fa entrare
  eta_min        int not null default 16,
  tier_label     text not null default 'OMAGGIO DONNA',
  ig_tag         text,                            -- il profilo da taggare nelle storie
  sorpresa_on    boolean not null default false,  -- lo shot compare sulle loro pagine
  sorpresa_testo text,
  msg_conferma   text,
  msg_sorpresa   text,
  updated_at     timestamptz not null default now(),
  updated_by     text
);

alter table public.omaggio_liste enable row level security;

create table if not exists public.omaggio_richieste (
  id           uuid primary key default gen_random_uuid(),
  lista        text not null references public.omaggio_liste (slug) on delete cascade,
  nome         text not null,
  cognome      text not null,
  nascita      date not null,
  telefono     text not null,                  -- sempre "+" e cifre (regola del 41)
  instagram    text,
  promo        boolean not null default false, -- vuole sapere delle prossime serate
  privacy_at   timestamptz not null default now(),
  token        text not null unique,           -- la sua pagina personale
  stato        text not null default 'in_attesa'
               check (stato in ('in_attesa', 'lista_attesa', 'approvata', 'rifiutata')),
  presale_id   uuid references public.presales (id) on delete set null,
  deciso_at    timestamptz,
  deciso_da    text,
  conferma_at  timestamptz,                    -- Luka le ha mandato il QR su WhatsApp
  sorpresa_at  timestamptz,                    -- Luka le ha mandato la sorpresa dello shot
  shot_at      timestamptz,                    -- lo shot l'ha ritirato al bar
  ip           text,
  created_at   timestamptz not null default now(),
  unique (lista, telefono)
);

create index if not exists omaggio_richieste_lista_idx
  on public.omaggio_richieste (lista, stato, created_at);

-- Nessuna policy: si passa solo dalle funzioni qui sotto.
alter table public.omaggio_richieste enable row level security;


-- ------------------------------------------------------------
-- 3 · La serata e la lista di sabato 17
--
-- Se una serata "Maldita" del 17 c'è già, si usa quella. Altrimenti
-- si crea, NON pubblicata: per l'1% non esiste, per la porta sì.
-- ------------------------------------------------------------
do $$
declare
  v_ev    uuid;
  v_venue uuid;
begin
  if exists (select 1 from public.omaggio_liste where slug = 'maldita') then
    return;
  end if;

  select e.id into v_ev
    from public.events e
   where (e.starts_at at time zone 'Europe/Rome')::date = date '2026-10-17'
     and e.name ilike '%maldita%'
   order by e.starts_at
   limit 1;

  if v_ev is null then
    select v.id into v_venue
      from public.venues v
     where upper(regexp_replace(v.name, '[^A-Za-z]', '', 'g')) = 'PAPION'
     limit 1;

    insert into public.events (venue_id, name, slug, starts_at, descrizione, published)
    values (v_venue,
            'MALDITA · OFFICIAL OPENING',
            'maldita-official-opening-17-ottobre',
            timestamptz '2026-10-17 23:00:00 Europe/Rome',
            'Special guest Armando Castillo · Deejlord · DJ Gringo',
            false)
    on conflict (slug) do nothing
    returning id into v_ev;

    if v_ev is null then
      select e.id into v_ev from public.events e
       where e.slug = 'maldita-official-opening-17-ottobre';
    end if;
  end if;

  insert into public.omaggio_liste
    (slug, event_id, titolo, chiude_at, valido_fino, eta_min,
     sorpresa_testo, msg_conferma, msg_sorpresa)
  values
    ('maldita', v_ev, 'MALDITA · OFFICIAL OPENING',
     timestamptz '2026-10-16 23:59:59 Europe/Rome',
     timestamptz '2026-10-18 00:30:00 Europe/Rome',
     16,
     'Condividi la locandina nelle tue storie Instagram taggando {tag}. Sabato, una volta dentro, fai vedere la storia al bar: lo shot te lo offriamo noi.',
     E'Ciao {nome}! 🔥 Sei in lista per MALDITA · OFFICIAL OPENING, sabato 17 ottobre al nuovo PAPI-ON.\n\nIl tuo ingresso omaggio è qui: {link}\n\nVale solo se entri entro le 00:30 (dopo si paga) e serve il documento vero, in mano. Ci vediamo sabato!',
     E'Ciao {nome}! Abbiamo una sorpresa per te 🥃\n\nCondividi la locandina di sabato nelle tue storie Instagram taggando {tag}: dentro, al bar, ti offriamo uno shot.\n\nLa locandina da scaricare e il tuo ingresso sono qui: {link}');
end $$;


-- ------------------------------------------------------------
-- 4 · Approvare una richiesta (interna)
--
-- Crea l'omaggio vero in `presales`: prezzo 0, nessun PR, già valido,
-- con la scadenza della lista. Rispetta i posti: se sono finiti non
-- approva e dice di no. Non la chiama nessuno da fuori.
-- ------------------------------------------------------------
create or replace function public._omaggio_approva(p_id uuid, p_chi text)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v       record;
  v_lista text;
  v_appr  int;
  v_tok   text;
  v_pid   uuid;
begin
  select r.lista into v_lista from public.omaggio_richieste r where r.id = p_id;
  if not found then
    return false;
  end if;

  -- Una lista alla volta: due approvazioni nello stesso istante non
  -- devono sforare i posti né fare due omaggi alla stessa ragazza.
  -- Lo stato si rilegge DOPO il lucchetto, non prima.
  perform pg_advisory_xact_lock(hashtext('omaggio:' || v_lista));

  select r.*, l.event_id, l.valido_fino, l.tier_label, l.posti
    into v
    from public.omaggio_richieste r
    join public.omaggio_liste l on l.slug = r.lista
   where r.id = p_id;

  if not found or v.stato = 'approvata' then
    return false;
  end if;

  select count(*)::int into v_appr
    from public.omaggio_richieste r
   where r.lista = v.lista and r.stato = 'approvata';

  if v.posti is not null and v_appr >= v.posti then
    return false;
  end if;

  v_tok := substr(md5(gen_random_uuid()::text || clock_timestamp()::text), 1, 20);

  insert into public.presales
    (event_id, pr_id, da_admin, nome, cognome, anno_nascita, telefono,
     tier_id, tier_label, prezzo, token, stato, attivata_at, attivata_da, valido_fino)
  values
    (v.event_id, null, true, v.nome, v.cognome, extract(year from v.nascita)::int, v.telefono,
     null, v.tier_label, 0, v_tok, 'attiva', now(), 'lista ' || v.lista, v.valido_fino)
  returning id into v_pid;

  update public.omaggio_richieste r
     set stato = 'approvata', presale_id = v_pid, deciso_at = now(), deciso_da = p_chi
   where r.id = p_id;

  return true;
end;
$$;

revoke execute on function public._omaggio_approva(uuid, text) from public, anon, authenticated;


-- Togliere l'approvazione: l'omaggio si annulla, se non è già entrata.
create or replace function public._omaggio_togli(p_id uuid, p_stato text, p_chi text)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v record;
begin
  select r.*, ps.stato as qr_stato
    into v
    from public.omaggio_richieste r
    left join public.presales ps on ps.id = r.presale_id
   where r.id = p_id;

  if not found then return false; end if;
  -- È già dentro: non si torna indietro.
  if v.qr_stato = 'usata' then return false; end if;

  if v.presale_id is not null and v.qr_stato = 'attiva' then
    update public.presales s
       set stato = 'annullata', annullata_at = now(), annullata_da = p_chi,
           annulla_motivo = 'lista ' || v.lista || ': ' || p_stato
     where s.id = v.presale_id;
  end if;

  update public.omaggio_richieste r
     set stato = p_stato, presale_id = null, deciso_at = now(), deciso_da = p_chi
   where r.id = p_id;

  return true;
end;
$$;

revoke execute on function public._omaggio_togli(uuid, text, text) from public, anon, authenticated;


-- ------------------------------------------------------------
-- 5 · La pagina pubblica
-- ------------------------------------------------------------

-- Cosa sa la pagina prima che ti iscrivi. Nessun numero: "posti
-- limitati" e basta, come per i PR.
create or replace function public.omaggio_info(p_slug text)
returns table (
  titolo      text,
  starts_at   timestamptz,
  aperta      boolean,
  chiude_at   timestamptz,
  esauriti    boolean,
  eta_min     int,
  valido_fino timestamptz
)
language sql
security definer
set search_path = public
stable
as $$
  select l.titolo, e.starts_at,
         (l.aperta and now() < l.chiude_at),
         l.chiude_at,
         (l.posti is not null and (
            select count(*) from public.omaggio_richieste r
             where r.lista = l.slug and r.stato = 'approvata') >= l.posti),
         l.eta_min,
         l.valido_fino
    from public.omaggio_liste l
    join public.events e on e.id = l.event_id
   where l.slug = p_slug;
$$;

grant execute on function public.omaggio_info(text) to anon, authenticated;


-- L'iscrizione. Risponde sempre con un esito, mai con un errore:
--   ok · chiusa · sconosciuta · privacy · nome_sbagliato ·
--   numero_sbagliato · data_sbagliata · troppo_giovane ·
--   instagram_sbagliato · gia_registrata (col suo token, se è lei) ·
--   numero_usato · troppe
create or replace function public.omaggio_iscrivi(
  p_slug      text,
  p_nome      text,
  p_cognome   text,
  p_nascita   date,
  p_telefono  text,
  p_instagram text,
  p_promo     boolean,
  p_privacy   boolean
)
returns table (esito text, token text, stato text)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_l     record;
  v_nome  text := regexp_replace(trim(coalesce(p_nome, '')), '\s+', ' ', 'g');
  v_cogn  text := regexp_replace(trim(coalesce(p_cognome, '')), '\s+', ' ', 'g');
  v_tel   text;
  v_ig    text;
  v_ip    text;
  v_hdr   json;
  v_r     record;
  v_tok   text;
  v_id    uuid;
  v_stato text;
  v_appr  int;
  v_limite date;
begin
  select l.*, e.starts_at into v_l
    from public.omaggio_liste l
    join public.events e on e.id = l.event_id
   where l.slug = p_slug;

  if not found then
    return query select 'sconosciuta'::text, null::text, null::text; return;
  end if;

  if not (v_l.aperta and now() < v_l.chiude_at) then
    return query select 'chiusa'::text, null::text, null::text; return;
  end if;

  if not coalesce(p_privacy, false) then
    return query select 'privacy'::text, null::text, null::text; return;
  end if;

  if length(v_nome) not between 1 and 40 or length(v_cogn) not between 1 and 40
     or v_nome !~ '^[[:alpha:]'' .-]+$' or v_cogn !~ '^[[:alpha:]'' .-]+$' then
    return query select 'nome_sbagliato'::text, null::text, null::text; return;
  end if;

  v_tel := public._numero_whatsapp(p_telefono);
  if v_tel is null then
    return query select 'numero_sbagliato'::text, null::text, null::text; return;
  end if;

  if p_nascita is null or p_nascita < date '1940-01-01' or p_nascita > current_date then
    return query select 'data_sbagliata'::text, null::text, null::text; return;
  end if;

  -- 16 anni compiuti il giorno della serata
  v_limite := ((v_l.starts_at at time zone 'Europe/Rome')::date
               - make_interval(years => v_l.eta_min))::date;
  if p_nascita > v_limite then
    return query select 'troppo_giovane'::text, null::text, null::text; return;
  end if;

  v_ig := lower(trim(coalesce(p_instagram, '')));
  v_ig := regexp_replace(v_ig, '^(https?://)?(www\.)?instagram\.com/', '');
  v_ig := regexp_replace(v_ig, '[/?].*$', '');
  v_ig := ltrim(v_ig, '@');
  if v_ig = '' then
    v_ig := null;
  elsif v_ig !~ '^[a-z0-9._]{1,30}$' then
    return query select 'instagram_sbagliato'::text, null::text, null::text; return;
  end if;

  -- Una lista alla volta (posti e doppioni restano giusti)
  perform pg_advisory_xact_lock(hashtext('omaggio:' || p_slug));

  -- Stesso numero: se è proprio lei (stessi dati) le ridiamo la sua
  -- pagina; se i dati sono altri, quel numero non si può riusare.
  -- Così nessuno recupera il QR di un'altra conoscendone il numero.
  select r.* into v_r
    from public.omaggio_richieste r
   where r.lista = p_slug and r.telefono = v_tel;

  if found then
    if lower(v_r.nome) = lower(v_nome) and lower(v_r.cognome) = lower(v_cogn)
       and v_r.nascita = p_nascita then
      return query select 'gia_registrata'::text, v_r.token, v_r.stato; return;
    end if;
    return query select 'numero_usato'::text, null::text, null::text; return;
  end if;

  -- Stessa persona con un altro numero: una prenotazione a testa.
  if exists (
    select 1 from public.omaggio_richieste r
     where r.lista = p_slug
       and lower(r.nome) = lower(v_nome) and lower(r.cognome) = lower(v_cogn)
       and r.nascita = p_nascita
  ) then
    return query select 'gia_registrata'::text, null::text, null::text; return;
  end if;

  -- Freno ai programmi che iscrivono a raffica: 10 l'ora dalla stessa rete.
  begin
    v_hdr := nullif(current_setting('request.headers', true), '')::json;
  exception when others then
    v_hdr := null;
  end;
  v_ip := coalesce(v_hdr ->> 'cf-connecting-ip',
                   nullif(trim(split_part(coalesce(v_hdr ->> 'x-forwarded-for', ''), ',', 1)), ''));
  if v_ip is not null and (
    select count(*) from public.omaggio_richieste r
     where r.ip = v_ip and r.created_at > now() - interval '1 hour'
  ) >= 10 then
    return query select 'troppe'::text, null::text, null::text; return;
  end if;

  select count(*)::int into v_appr
    from public.omaggio_richieste r
   where r.lista = p_slug and r.stato = 'approvata';

  v_stato := case when v_l.posti is not null and v_appr >= v_l.posti
                  then 'lista_attesa' else 'in_attesa' end;

  v_tok := substr(md5(gen_random_uuid()::text || clock_timestamp()::text), 1, 20);

  insert into public.omaggio_richieste
    (lista, nome, cognome, nascita, telefono, instagram, promo, token, stato, ip)
  values
    (p_slug, v_nome, v_cogn, p_nascita, v_tel, v_ig, coalesce(p_promo, false), v_tok, v_stato, v_ip)
  returning id into v_id;

  -- In automatico, con i posti decisi: approvata subito, il QR è già lì.
  if v_l.modo = 'auto' and v_l.posti is not null and v_stato = 'in_attesa' then
    if public._omaggio_approva(v_id, 'automatica') then
      v_stato := 'approvata';
    end if;
  end if;

  return query select 'ok'::text, v_tok, v_stato;
end;
$$;

grant execute on function public.omaggio_iscrivi(text, text, text, date, text, text, boolean, boolean)
  to anon, authenticated;


-- La sua pagina: chi l'ha, la apre. Il token è l'indirizzo.
create or replace function public.omaggio_mia(p_token text)
returns table (
  lista          text,
  nome           text,
  cognome        text,
  stato          text,
  titolo         text,
  starts_at      timestamptz,
  valido_fino    timestamptz,
  qr             text,
  qr_stato       text,
  entrata_at     timestamptz,
  minorenne      boolean,
  sorpresa_on    boolean,
  sorpresa_testo text,
  ig_tag         text,
  shot_at        timestamptz
)
language sql
security definer
set search_path = public
stable
as $$
  select r.lista, r.nome, r.cognome, r.stato, l.titolo, e.starts_at, l.valido_fino,
         case when r.stato = 'approvata' and ps.stato in ('attiva', 'usata') then ps.token end,
         case when r.stato = 'approvata' then ps.stato end,
         case when ps.stato = 'usata' then ps.usata_at end,
         r.nascita > ((e.starts_at at time zone 'Europe/Rome')::date - interval '18 years')::date,
         (l.sorpresa_on and r.stato = 'approvata'),
         case when l.sorpresa_on and r.stato = 'approvata' then l.sorpresa_testo end,
         l.ig_tag,
         r.shot_at
    from public.omaggio_richieste r
    join public.omaggio_liste l on l.slug = r.lista
    join public.events e on e.id = l.event_id
    left join public.presales ps on ps.id = r.presale_id
   where r.token = p_token;
$$;

grant execute on function public.omaggio_mia(text) to anon, authenticated;


-- Lo shot al bar: lo conferma il barista toccando la sua pagina.
-- Solo a chi è già entrata, solo una volta.
create or replace function public.omaggio_shot(p_token text)
returns table (esito text, quando timestamptz)
language plpgsql
security definer
set search_path = public
as $$
declare
  v record;
begin
  select r.id, r.shot_at, r.stato, l.sorpresa_on, ps.stato as qr_stato
    into v
    from public.omaggio_richieste r
    join public.omaggio_liste l on l.slug = r.lista
    left join public.presales ps on ps.id = r.presale_id
   where r.token = p_token;

  if not found or not v.sorpresa_on or v.stato <> 'approvata' then
    return query select 'no'::text, null::timestamptz; return;
  end if;
  if v.shot_at is not null then
    return query select 'gia'::text, v.shot_at; return;
  end if;
  if v.qr_stato is distinct from 'usata' then
    return query select 'non_entrata'::text, null::timestamptz; return;
  end if;

  update public.omaggio_richieste r set shot_at = now()
   where r.id = v.id and r.shot_at is null;

  return query select 'ok'::text, now();
end;
$$;

grant execute on function public.omaggio_shot(text) to anon, authenticated;


-- ------------------------------------------------------------
-- 6 · Il pannello di Luka
-- ------------------------------------------------------------
create or replace function public.admin_omaggio_lista(p_slug text)
returns table (
  slug           text,
  titolo         text,
  event_id       uuid,
  aperta         boolean,
  modo           text,
  posti          int,
  chiude_at      timestamptz,
  valido_fino    timestamptz,
  eta_min        int,
  ig_tag         text,
  sorpresa_on    boolean,
  sorpresa_testo text,
  msg_conferma   text,
  msg_sorpresa   text,
  n_attesa       int,
  n_lista_attesa int,
  n_approvate    int,
  n_rifiutate    int,
  n_entrate      int,
  n_shot         int,
  n_promo        int
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
    select l.slug, l.titolo, l.event_id, l.aperta, l.modo, l.posti, l.chiude_at,
           l.valido_fino, l.eta_min, l.ig_tag, l.sorpresa_on, l.sorpresa_testo,
           l.msg_conferma, l.msg_sorpresa,
           count(r.id) filter (where r.stato = 'in_attesa')::int,
           count(r.id) filter (where r.stato = 'lista_attesa')::int,
           count(r.id) filter (where r.stato = 'approvata')::int,
           count(r.id) filter (where r.stato = 'rifiutata')::int,
           count(r.id) filter (where r.stato = 'approvata' and ps.stato = 'usata')::int,
           count(r.id) filter (where r.shot_at is not null)::int,
           count(r.id) filter (where r.promo)::int
      from public.omaggio_liste l
      left join public.omaggio_richieste r on r.lista = l.slug
      left join public.presales ps on ps.id = r.presale_id
     where l.slug = p_slug
     group by l.slug;
end;
$$;

revoke execute on function public.admin_omaggio_lista(text) from anon;
grant execute on function public.admin_omaggio_lista(text) to authenticated;


-- Le impostazioni. Se il modo è automatico, riempie subito i posti
-- liberi con chi aspetta, in ordine d'arrivo.
create or replace function public.admin_omaggio_imposta(
  p_slug           text,
  p_aperta         boolean,
  p_modo           text,
  p_posti          int,
  p_ig_tag         text,
  p_sorpresa_on    boolean,
  p_sorpresa_testo text,
  p_msg_conferma   text,
  p_msg_sorpresa   text
)
returns table (esito text, approvate_ora int)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_fatte int := 0;
  r       record;
  v_tag   text := ltrim(trim(coalesce(p_ig_tag, '')), '@');
begin
  if not public.is_admin() then
    raise exception 'Non autorizzato';
  end if;

  if p_modo not in ('mano', 'auto') then
    return query select 'modo_sbagliato'::text, 0; return;
  end if;
  if p_posti is not null and p_posti < 0 then
    return query select 'posti_sbagliati'::text, 0; return;
  end if;

  update public.omaggio_liste l
     set aperta = coalesce(p_aperta, l.aperta),
         modo = p_modo,
         posti = p_posti,
         ig_tag = case when v_tag = '' then null else '@' || v_tag end,
         sorpresa_on = coalesce(p_sorpresa_on, l.sorpresa_on),
         sorpresa_testo = coalesce(nullif(trim(p_sorpresa_testo), ''), l.sorpresa_testo),
         msg_conferma = coalesce(nullif(trim(p_msg_conferma), ''), l.msg_conferma),
         msg_sorpresa = coalesce(nullif(trim(p_msg_sorpresa), ''), l.msg_sorpresa),
         updated_at = now(),
         updated_by = (auth.jwt() ->> 'email')
   where l.slug = p_slug;

  if not found then
    return query select 'sconosciuta'::text, 0; return;
  end if;

  if p_modo = 'auto' and p_posti is not null then
    for r in
      select x.id from public.omaggio_richieste x
       where x.lista = p_slug and x.stato in ('in_attesa', 'lista_attesa')
       order by x.created_at
    loop
      exit when not public._omaggio_approva(r.id, 'automatica');
      v_fatte := v_fatte + 1;
    end loop;
  end if;

  return query select 'ok'::text, v_fatte;
end;
$$;

revoke execute on function public.admin_omaggio_imposta(text, boolean, text, int, text, boolean, text, text, text) from anon;
grant execute on function public.admin_omaggio_imposta(text, boolean, text, int, text, boolean, text, text, text) to authenticated;


create or replace function public.admin_omaggio_richieste(p_slug text)
returns table (
  id          uuid,
  nome        text,
  cognome     text,
  nascita     date,
  telefono    text,
  instagram   text,
  promo       boolean,
  stato       text,
  token       text,
  created_at  timestamptz,
  deciso_at   timestamptz,
  deciso_da   text,
  conferma_at timestamptz,
  sorpresa_at timestamptz,
  shot_at     timestamptz,
  qr_stato    text,
  entrata_at  timestamptz
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
    select r.id, r.nome, r.cognome, r.nascita, r.telefono, r.instagram, r.promo,
           r.stato, r.token, r.created_at, r.deciso_at, r.deciso_da,
           r.conferma_at, r.sorpresa_at, r.shot_at,
           ps.stato, case when ps.stato = 'usata' then ps.usata_at end
      from public.omaggio_richieste r
      left join public.presales ps on ps.id = r.presale_id
     where r.lista = p_slug
     order by r.created_at;
end;
$$;

revoke execute on function public.admin_omaggio_richieste(text) from anon;
grant execute on function public.admin_omaggio_richieste(text) to authenticated;


-- Decidere, una o tante in un colpo solo:
--   approva → omaggio creato (finché ci sono posti, in ordine d'arrivo)
--   rifiuta → niente omaggio
--   attesa  → torna "da decidere" (l'omaggio, se c'era, si annulla)
-- Chi è già entrata non si tocca più.
create or replace function public.admin_omaggio_decidi(p_ids uuid[], p_azione text)
returns table (fatte int, saltate int)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_fatte   int := 0;
  v_saltate int := 0;
  v_chi     text := (auth.jwt() ->> 'email');
  r         record;
  v_ok      boolean;
begin
  if not public.is_admin() then
    raise exception 'Non autorizzato';
  end if;

  if p_azione not in ('approva', 'rifiuta', 'attesa') then
    raise exception 'Azione sconosciuta: %', p_azione;
  end if;

  for r in
    select x.id, x.stato from public.omaggio_richieste x
     where x.id = any(coalesce(p_ids, '{}'::uuid[]))
     order by x.created_at
  loop
    -- (if separati, non un AND: Postgres non promette l'ordine in cui
    -- valuta le due metà, e la funzione partirebbe comunque)
    v_ok := false;
    if p_azione = 'approva' then
      v_ok := public._omaggio_approva(r.id, v_chi);
    elsif p_azione = 'rifiuta' then
      if r.stato <> 'rifiutata' then
        v_ok := public._omaggio_togli(r.id, 'rifiutata', v_chi);
      end if;
    else
      if r.stato <> 'in_attesa' then
        v_ok := public._omaggio_togli(r.id, 'in_attesa', v_chi);
      end if;
    end if;

    if v_ok then v_fatte := v_fatte + 1; else v_saltate := v_saltate + 1; end if;
  end loop;

  return query select v_fatte, v_saltate;
end;
$$;

revoke execute on function public.admin_omaggio_decidi(uuid[], text) from anon;
grant execute on function public.admin_omaggio_decidi(uuid[], text) to authenticated;


-- Riempire i posti liberi in ordine d'arrivo (anche col modo "a mano").
create or replace function public.admin_omaggio_riempi(p_slug text)
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  v_fatte int := 0;
  v_chi   text := (auth.jwt() ->> 'email');
  r       record;
begin
  if not public.is_admin() then
    raise exception 'Non autorizzato';
  end if;

  if (select l.posti from public.omaggio_liste l where l.slug = p_slug) is null then
    return 0;  -- senza posti decisi non si riempie niente
  end if;

  for r in
    select x.id from public.omaggio_richieste x
     where x.lista = p_slug and x.stato in ('in_attesa', 'lista_attesa')
     order by x.created_at
  loop
    exit when not public._omaggio_approva(r.id, v_chi);
    v_fatte := v_fatte + 1;
  end loop;

  return v_fatte;
end;
$$;

revoke execute on function public.admin_omaggio_riempi(text) from anon;
grant execute on function public.admin_omaggio_riempi(text) to authenticated;


-- I messaggi WhatsApp: chi ha già ricevuto cosa.
--   p_cosa = 'conferma' | 'sorpresa'
create or replace function public.admin_omaggio_scritto(p_ids uuid[], p_cosa text, p_on boolean)
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  v_n int;
begin
  if not public.is_admin() then
    raise exception 'Non autorizzato';
  end if;

  if p_cosa = 'conferma' then
    update public.omaggio_richieste r
       set conferma_at = case when p_on then coalesce(r.conferma_at, now()) end
     where r.id = any(coalesce(p_ids, '{}'::uuid[]));
  elsif p_cosa = 'sorpresa' then
    update public.omaggio_richieste r
       set sorpresa_at = case when p_on then coalesce(r.sorpresa_at, now()) end
     where r.id = any(coalesce(p_ids, '{}'::uuid[]));
  else
    raise exception 'Messaggio sconosciuto: %', p_cosa;
  end if;

  get diagnostics v_n = row_count;
  return v_n;
end;
$$;

revoke execute on function public.admin_omaggio_scritto(uuid[], text, boolean) from anon;
grant execute on function public.admin_omaggio_scritto(uuid[], text, boolean) to authenticated;


-- ------------------------------------------------------------
-- 7 · La porta: il biglietto scaduto non passa
--
-- Copiata dal 40 senza toccare una virgola, tranne il blocco
-- "SCADUTO" prima di bruciare il biglietto. In `entrata_at` torna
-- l'ora di scadenza, così la porta può scrivere "valeva fino alle 00:30".
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

  -- SCADUTO (42): l'omaggio donna vale fino alle 00:30, senza tolleranza.
  -- Non si brucia: entra pagando, e il biglietto resta com'è.
  if v_b.valido_fino is not null and now() > v_b.valido_fino then
    return query select 'scaduto'::text, v_b.nome, v_b.cognome, v_b.tier_label,
                        v_b.prezzo, null::boolean, null::boolean, v_pr, v_ev,
                        v_b.valido_fino, v_b.id;
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


-- La lista per lavorare senza rete si porta dietro la scadenza:
-- anche offline, dopo le 00:30 il telefono dice "SCADUTO".
-- (Copiata dal 32; cambia la forma, quindi va tolta e rifatta.)
drop function if exists public.porta_lista(uuid);

create function public.porta_lista(p_event uuid)
returns table (
  token       text,
  nome        text,
  cognome     text,
  tier_label  text,
  stato       text,
  under16     boolean,
  minorenne   boolean,
  pr_alias    text,
  valido_fino timestamptz
)
language plpgsql
security definer
set search_path = public
stable
as $$
begin
  if not (public.is_staff() or public.is_account_manager()) then
    raise exception 'Non autorizzato';
  end if;

  return query
    select s.token, s.nome, s.cognome, s.tier_label, s.stato,
           (extract(year from now())::int - s.anno_nascita) < 16,
           (extract(year from now())::int - s.anno_nascita) < 18,
           coalesce(p.alias, 'DIREZIONE'),
           s.valido_fino
    from public.presales s
    left join public.profiles p on p.id = s.pr_id
    where s.event_id = p_event
      and s.stato <> 'annullata'
    order by s.cognome, s.nome;
end;
$$;

revoke execute on function public.porta_lista(uuid) from anon;
grant execute on function public.porta_lista(uuid) to authenticated;


-- ============================================================
-- Controllo: la lista di sabato e la sua serata.
-- Deve uscire una riga: maldita · la serata · iscrizioni aperte
-- fino a venerdì 23:59 · QR valido fino alle 00:30.
-- ============================================================
select l.slug as "pagina",
       e.name as "serata",
       e.published as "pubblicata sull'1% (deve essere false)",
       to_char(l.chiude_at at time zone 'Europe/Rome', 'DD/MM HH24:MI') as "iscrizioni fino a",
       to_char(l.valido_fino at time zone 'Europe/Rome', 'DD/MM HH24:MI') as "QR valido fino a",
       l.modo as "approvazione",
       coalesce(l.posti::text, 'da decidere') as "posti"
  from public.omaggio_liste l
  join public.events e on e.id = l.event_id;
