-- ============================================================
-- 43 — MALDITA RESTA STACCATA DA PR E MANAGER
--
-- Chiesto da Luka il 6 ottobre 2026, prima di pubblicare il link:
-- *"non deve interferire con altri eventi, altre cose, o darmi casini"*.
--
-- 1. I tre account manager possono lavorare su TUTTE le serate (39):
--    nella loro area sarebbe comparsa anche MALDITA. Vendere non
--    potevano (non ha fasce di prezzo), ma la serata dev'essere fuori.
--    Ora una serata che ha una lista omaggio (42) non è "agganciabile"
--    da nessun PR né manager: non la vedono, non ci vendono, non ci
--    ricevono blocchetti. L'admin resta libero come prima.
-- 2. Il freno contro le iscrizioni a raffica sale da 10 a 60 l'ora per
--    rete: sotto la rete del telefono tante ragazze vere condividono lo
--    stesso indirizzo, e con 10 qualcuna si sarebbe vista rifiutare.
--
-- Da incollare dopo il 42. Si può rieseguire.
-- ============================================================

do $$
begin
  if to_regclass('public.omaggio_liste') is null then
    raise exception 'Manca lo script 42: incolla prima il 42, poi questo.';
  end if;
end $$;


-- ------------------------------------------------------------
-- 1 · Copiata dal 39, con in più la riga della lista omaggio
-- ------------------------------------------------------------
create or replace function public._pr_agganciato(p_pr uuid, p_event uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select not exists (select 1 from public.omaggio_liste ol where ol.event_id = p_event)
     and (
          exists (select 1 from public.pr_serate s
                   where s.pr_id = p_pr and s.event_id = p_event)
       or exists (select 1 from public.account_managers m
                   where m.profile_id = p_pr and m.attivo)
     );
$$;

revoke execute on function public._pr_agganciato(uuid, uuid) from public, anon, authenticated;


-- ------------------------------------------------------------
-- 2 · L'iscrizione: copiata dal 42, cambia solo il freno (60 l'ora)
-- ------------------------------------------------------------
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

  -- Freno ai programmi che iscrivono a raffica: 60 l'ora dalla stessa rete.
  -- (Era 10: con i telefoni sotto la stessa rete dell'operatore, tante
  -- ragazze vere escono con lo stesso indirizzo. 60 ferma solo i programmi.)
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
  ) >= 60 then
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


-- ============================================================
-- Controllo: quanti PR o manager risultano agganciati a MALDITA.
-- Deve uscire 0.
-- ============================================================
select count(*) as "PR o manager che vedono MALDITA (deve essere 0)"
  from public.profiles p
  join public.omaggio_liste l on l.slug = 'maldita'
 where (exists (select 1 from public.pr_serate s where s.pr_id = p.id and s.event_id = l.event_id)
        or exists (select 1 from public.account_managers m where m.profile_id = p.id and m.attivo))
   and public._pr_agganciato(p.id, l.event_id);
