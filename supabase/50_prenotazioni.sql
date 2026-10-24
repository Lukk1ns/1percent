-- ============================================================
-- 50 · LE PRENOTAZIONI: IN PORTA SI PAGA
--
-- Luka, 24 ottobre 2026 (LIL NAAY): *"vendere delle prevendite ma che
-- quando scannerizza la cassiera viene fuori la scritta di quanto deve
-- pagare in cassa... per alcuni pr o collaboratori a cui non do
-- l'omaggio ma la possibilità di pagare un prezzo conveniente in
-- serata"*. Le fa solo lui dal pannello; il prezzo è uno per serata.
--
-- È un omaggio (36) con il conto rimandato alla porta: biglietto vero,
-- stesso QR, intestato alla direzione, già valido, **prezzo zero** —
-- così non entra nei conti delle prevendite, dove sembrerebbero soldi
-- già in mano. Quello che si paga in cassa sta nel nome della fascia:
--
--     PRENOTAZIONE · 15 € IN CASSA
--
-- La porta riceve già il nome della fascia, anche dalla lista per
-- lavorare senza campo: le funzioni `porta_*` non si toccano. Il sito
-- lo riconosce da quella scritta (`inCassa` in lib/biglietto-cliente.ts):
-- se la cambi qui, va cambiata anche lì.
--
-- Si può rieseguire.
-- ============================================================

create or replace function public.admin_prenotazione(
  p_event    uuid,
  p_nome     text,
  p_cognome  text,
  p_anno     int,
  p_telefono text default null,
  p_importo  int default 15,
  p_forza    boolean default false
)
returns table (esito text, token text, minorenne boolean, under16 boolean)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_token text;
  v_nome  text := regexp_replace(trim(coalesce(p_nome, '')), '\s+', ' ', 'g');
  v_cogn  text := regexp_replace(trim(coalesce(p_cognome, '')), '\s+', ' ', 'g');
begin
  -- Solo Luka, come gli omaggi.
  if not public.is_admin() then
    raise exception 'Non autorizzato';
  end if;

  if not exists (select 1 from public.events e where e.id = p_event) then
    return query select 'serata_sconosciuta'::text, null::text, null::boolean, null::boolean;
    return;
  end if;

  if v_nome = '' or v_cogn = '' then
    return query select 'dati_mancanti'::text, null::text, null::boolean, null::boolean;
    return;
  end if;

  if p_anno is null or p_anno < 1900 or p_anno > 2100 then
    return query select 'anno_sbagliato'::text, null::text, null::boolean, null::boolean;
    return;
  end if;

  if p_importo is null or p_importo < 1 or p_importo > 500 then
    return query select 'importo_sbagliato'::text, null::text, null::boolean, null::boolean;
    return;
  end if;

  -- Stessa persona, stessa serata: si ferma, come per gli omaggi.
  if not p_forza then
    if exists (
      select 1 from public.presales ps
      where ps.event_id = p_event
        and ps.stato <> 'annullata'
        and lower(regexp_replace(ps.nome, '\s+', ' ', 'g')) = lower(v_nome)
        and lower(regexp_replace(ps.cognome, '\s+', ' ', 'g')) = lower(v_cogn)
    ) then
      return query select 'gia_presente'::text, null::text, null::boolean, null::boolean;
      return;
    end if;
  end if;

  v_token := substr(md5(gen_random_uuid()::text || clock_timestamp()::text), 1, 20);

  insert into public.presales
    (event_id, pr_id, da_admin, nome, cognome, anno_nascita, telefono,
     tier_id, tier_label, prezzo, token, stato, attivata_at, attivata_da)
  values
    (p_event, null, true,
     v_nome, v_cogn, p_anno, nullif(trim(coalesce(p_telefono, '')), ''),
     null, format('PRENOTAZIONE · %s € IN CASSA', p_importo), 0,
     v_token, 'attiva', now(), 'prenotazione');

  return query select 'ok'::text, v_token,
                      ((extract(year from now())::int - p_anno) < 18),
                      ((extract(year from now())::int - p_anno) < 16);
end;
$$;

revoke execute on function public.admin_prenotazione(uuid, text, text, int, text, int, boolean) from public, anon;
grant execute on function public.admin_prenotazione(uuid, text, text, int, text, int, boolean) to authenticated;


-- ============================================================
-- Controllo: deve uscire una riga, "admin_prenotazione".
-- ============================================================
select p.proname as "funzione nuova"
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
 where n.nspname = 'public' and p.proname = 'admin_prenotazione';
