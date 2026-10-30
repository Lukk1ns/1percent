-- ============================================================
-- 52 · LA VENDITA DEL PR SEGNATA DA LUKA (30 ottobre 2026)
--
-- Luka: *"ho detto che chi aveva acquistato la prevendita di Nabi
-- poteva avere l'ingresso a soli 8 euro... qualche pr ha fatto delle
-- prevendite a 8 euro, solo che gli ho detto di non segnare nulla...
-- segnare io quale pr ha venduto le prevendite a 8 euro e a chi, e
-- quella persona ha un link come gli altri, solo calcolato a 8"*.
--
-- Un biglietto del PR a tutti gli effetti, solo che lo scrive Luka
-- dal pannello:
--   - va a nome del PR scelto (pr_id), non della direzione: i soldi li
--     ha in mano lui, quindi gli 8 € finiscono nel suo "deve";
--   - nasce "in attesa" come i suoi, e diventa valido quando il PR
--     porta i soldi (subito, se ha già del credito su quella serata);
--   - prezzo e scritta li decide Luka (8 €, "EX NABI"): nessuna fascia,
--     così i PR non la vedono e non la possono usare da soli;
--   - non mangia il blocchetto: insieme al biglietto entra una
--     consegna da +1 con il nome del cliente nella nota, così il PR
--     ha ancora le prevendite che aveva e nel registro dei soldi resta
--     scritto chi l'ha segnata e per chi.
--
-- Nessuna funzione esistente cambia: porta, conti, annullo e stelle
-- leggono pr_id e prezzo, che qui sono come quelli di una vendita vera.
--
-- Si può rieseguire.
-- ============================================================

create or replace function public.admin_vendita_pr(
  p_event    uuid,
  p_pr       uuid,
  p_nome     text,
  p_cognome  text,
  p_anno     int,
  p_telefono text default null,
  p_importo  int default 8,
  p_scritta  text default 'EX NABI',
  p_forza    boolean default false
)
returns table (esito text, token text, stato text, minorenne boolean, under16 boolean)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_token   text;
  v_stato   text;
  v_nome    text := regexp_replace(trim(coalesce(p_nome, '')), '\s+', ' ', 'g');
  v_cogn    text := regexp_replace(trim(coalesce(p_cognome, '')), '\s+', ' ', 'g');
  v_scritta text := upper(regexp_replace(trim(coalesce(p_scritta, '')), '\s+', ' ', 'g'));
  v_id      uuid;
begin
  -- Solo Luka, come omaggi e prenotazioni.
  if not public.is_admin() then
    raise exception 'Non autorizzato';
  end if;

  if not exists (select 1 from public.events e where e.id = p_event) then
    return query select 'serata_sconosciuta'::text, null::text, null::text, null::boolean, null::boolean;
    return;
  end if;

  if not exists (select 1 from public.profiles p
                  where p.id = p_pr and p.role = 'crew' and p.deleted_at is null) then
    return query select 'pr_sconosciuto'::text, null::text, null::text, null::boolean, null::boolean;
    return;
  end if;

  -- Il PR deve vedere la serata nella sua pagina, se no il biglietto
  -- (e il link da rimandare) gli resta nascosto.
  if not public._pr_agganciato(p_pr, p_event) then
    return query select 'non_agganciato'::text, null::text, null::text, null::boolean, null::boolean;
    return;
  end if;

  if v_nome = '' or v_cogn = '' then
    return query select 'dati_mancanti'::text, null::text, null::text, null::boolean, null::boolean;
    return;
  end if;

  if p_anno is null or p_anno < 1900 or p_anno > 2100 then
    return query select 'anno_sbagliato'::text, null::text, null::text, null::boolean, null::boolean;
    return;
  end if;

  if p_importo is null or p_importo < 1 or p_importo > 500 then
    return query select 'importo_sbagliato'::text, null::text, null::text, null::boolean, null::boolean;
    return;
  end if;

  -- "PRENOTAZIONE · X € IN CASSA" la porta la legge come "paga in cassa"
  -- (script 50): qui i soldi li ha il PR, quindi quella scritta no.
  if v_scritta = '' or v_scritta like 'PRENOTAZIONE%' or length(v_scritta) > 40 then
    return query select 'scritta_sbagliata'::text, null::text, null::text, null::boolean, null::boolean;
    return;
  end if;

  -- Stessa persona, stessa serata: si ferma, come dappertutto.
  if not p_forza then
    if exists (
      select 1 from public.presales ps
      where ps.event_id = p_event
        and ps.stato <> 'annullata'
        and lower(regexp_replace(ps.nome, '\s+', ' ', 'g')) = lower(v_nome)
        and lower(regexp_replace(ps.cognome, '\s+', ' ', 'g')) = lower(v_cogn)
    ) then
      return query select 'gia_presente'::text, null::text, null::text, null::boolean, null::boolean;
      return;
    end if;
  end if;

  -- Il pezzo di blocchetto che il biglietto si prende: lo rimettiamo.
  insert into public.pr_allocations (event_id, pr_id, delta, nota, created_by)
  values (p_event, p_pr, 1,
          format('%s %s € · %s %s (segnata dalla direzione)', v_scritta, p_importo, v_nome, v_cogn),
          (auth.jwt() ->> 'email'));

  v_token := substr(md5(gen_random_uuid()::text || clock_timestamp()::text), 1, 20);

  insert into public.presales
    (event_id, pr_id, da_admin, nome, cognome, anno_nascita, telefono,
     tier_id, tier_label, prezzo, token, stato)
  values
    (p_event, p_pr, false,
     v_nome, v_cogn, p_anno, nullif(trim(coalesce(p_telefono, '')), ''),
     null, v_scritta, p_importo, v_token, 'in_attesa')
  returning id into v_id;

  -- Se il PR ha già portato più di quanto deve, si accende subito.
  perform public._pr_applica_credito(p_event, p_pr, 'automatico');

  select ps.stato into v_stato from public.presales ps where ps.id = v_id;

  return query select 'ok'::text, v_token, v_stato,
                      ((extract(year from now())::int - p_anno) < 18),
                      ((extract(year from now())::int - p_anno) < 16);
end;
$$;

revoke execute on function public.admin_vendita_pr(uuid, uuid, text, text, int, text, int, text, boolean) from public, anon;
grant execute on function public.admin_vendita_pr(uuid, uuid, text, text, int, text, int, text, boolean) to authenticated;


-- ============================================================
-- Controllo: deve uscire una riga, "admin_vendita_pr".
-- ============================================================
select p.proname as "funzione nuova"
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
 where n.nspname = 'public' and p.proname = 'admin_vendita_pr';
