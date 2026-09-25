-- ============================================================
-- 36 · GLI OMAGGI DELLA DIREZIONE
--
-- Luka, 25 settembre 2026: *"io che posso vendere omaggi — si puo
-- inserire solo questa opzione e solo per me, gli viene generata la
-- prevendita e non serve segnare i soldi da nessuna parte"*.
--
-- Un omaggio è un biglietto vero — stesso QR, stessa porta, stesso
-- controllo dei doppioni — ma **senza soldi attaccati**: prezzo zero,
-- nessun PR a cui addebitarlo, nessun contante da ritirare. Per questo
-- non passa da `pr_vendi`: quella funzione toglie un pezzo dal
-- blocchetto di qualcuno e gli mette un debito sul groppone.
--
-- Come si riconosce un omaggio, ovunque: **prezzo = 0**. I conti della
-- serata lo ignorano da soli (sommano i prezzi), e il pannello lo conta
-- a parte come persona che entra senza pagare.
--
-- Nasce già valido: se lo regala la direzione non c'è nessun incasso da
-- aspettare.
-- ============================================================

create or replace function public.admin_omaggio(
  p_event    uuid,
  p_nome     text,
  p_cognome  text,
  p_anno     int,
  p_telefono text default null,
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
  -- Solo Luka. Nemmeno i manager: un omaggio non si ritira da nessuno,
  -- quindi sarebbe un ingresso gratis che non lascia traccia in cassa.
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

  -- Stessa persona, stessa serata: si ferma. Vale anche se il biglietto
  -- l'aveva già fatto un PR — sennò l'omaggio gli regala l'ingresso e il
  -- PR resta col debito.
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
     null, 'OMAGGIO', 0, v_token, 'attiva', now(), 'omaggio');

  return query select 'ok'::text, v_token,
                      ((extract(year from now())::int - p_anno) < 18),
                      ((extract(year from now())::int - p_anno) < 16);
end;
$$;

grant execute on function public.admin_omaggio(uuid, text, text, int, text, boolean) to authenticated;


-- ============================================================
-- Controllo: quanti omaggi ci sono già in giro, serata per serata.
-- (Appena incollato esce zero, o niente righe.)
-- ============================================================
select e.nome as "serata",
       count(*) filter (where ps.prezzo = 0 and ps.stato <> 'annullata') as "omaggi",
       count(*) filter (where ps.prezzo > 0 and ps.stato <> 'annullata') as "a pagamento"
from public.events e
left join public.presales ps on ps.event_id = e.id
group by e.nome, e.starts_at
order by e.starts_at desc;
