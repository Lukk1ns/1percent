-- ============================================================
-- 12 — IL BIGLIETTO DISTINGUE I MINORI DI 16 ANNI
--
-- Deciso da Luka il 22 settembre 2026, guardando il biglietto vero:
--   · sotto i 18 serve il documento
--   · sotto i 16 serve ANCHE la delega firmata da chi accompagna
-- Quindi al biglietto serve sapere quale dei due casi è.
--
-- (Il biglietto non dice più al cliente se il PR ha pagato: quello
-- resta un fatto interno e si legge dal pannello. Lato database non
-- cambia niente, lo stato continua a essere scritto com'era.)
--
-- Da incollare nel SQL Editor. Si può rieseguire.
-- ============================================================

drop function if exists public.biglietto(text);

create function public.biglietto(p_token text)
returns table (
  nome        text,
  cognome     text,
  tier_label  text,
  prezzo      numeric,
  stato       text,
  minorenne   boolean,
  under16     boolean,
  evento      text,
  locale      text,
  citta       text,
  indirizzo   text,
  starts_at   timestamptz,
  cover_key   text,
  cover_v     bigint
)
language sql
security definer
set search_path = public
stable
as $$
  select s.nome, s.cognome, s.tier_label, s.prezzo, s.stato,
         (extract(year from now())::int - s.anno_nascita) < 18,
         (extract(year from now())::int - s.anno_nascita) < 16,
         e.name, v.name, v.city, v.address, e.starts_at, e.cover_key,
         coalesce(extract(epoch from e.cover_updated_at)::bigint, 0)
  from public.presales s
  join public.events e on e.id = s.event_id
  left join public.venues v on v.id = e.venue_id
  where s.token = p_token;
$$;

grant execute on function public.biglietto(text) to anon, authenticated;


-- Anche il PR deve sapere a chi va ricordata la delega.
drop function if exists public.pr_miei_biglietti(uuid);

create function public.pr_miei_biglietti(p_event uuid)
returns table (
  id uuid, nome text, cognome text, anno_nascita int, telefono text,
  tier_label text, prezzo numeric, token text, stato text,
  minorenne boolean, under16 boolean, created_at timestamptz
)
language plpgsql
security definer
set search_path = public
stable
as $$
declare v_admin boolean := public.is_admin();
begin
  if not public.is_pr() then
    raise exception 'Non autorizzato';
  end if;

  return query
    select s.id, s.nome, s.cognome, s.anno_nascita, s.telefono,
           s.tier_label, s.prezzo, s.token, s.stato,
           (extract(year from now())::int - s.anno_nascita) < 18,
           (extract(year from now())::int - s.anno_nascita) < 16,
           s.created_at
    from public.presales s
    where s.event_id = p_event
      and (case when v_admin then s.pr_id is null else s.pr_id = auth.uid() end)
    order by s.created_at desc;
end;
$$;

grant execute on function public.pr_miei_biglietti(uuid) to authenticated;


-- E nel pannello, sull'elenco della serata.
drop function if exists public.admin_presales(uuid);

create function public.admin_presales(p_event uuid)
returns table (
  id uuid, nome text, cognome text, anno_nascita int, telefono text,
  tier_label text, prezzo numeric, token text, stato text,
  minorenne boolean, under16 boolean, pr_alias text, pr_nome text,
  created_at timestamptz
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
    select s.id, s.nome, s.cognome, s.anno_nascita, s.telefono,
           s.tier_label, s.prezzo, s.token, s.stato,
           (extract(year from now())::int - s.anno_nascita) < 18,
           (extract(year from now())::int - s.anno_nascita) < 16,
           coalesce(p.alias, 'DIREZIONE'), p.nome, s.created_at
    from public.presales s
    left join public.profiles p on p.id = s.pr_id
    where s.event_id = p_event
    order by s.created_at desc;
end;
$$;

grant execute on function public.admin_presales(uuid) to authenticated;


-- E alla vendita, per dirlo subito al PR.
drop function if exists public.pr_vendi(uuid, uuid, text, text, int, text);

create function public.pr_vendi(
  p_event    uuid,
  p_tier     uuid,
  p_nome     text,
  p_cognome  text,
  p_anno     int,
  p_telefono text
)
returns table (esito text, token text, prezzo numeric, minorenne boolean, under16 boolean)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_me       uuid    := auth.uid();
  v_admin    boolean := public.is_admin();
  v_tier     record;
  v_residue  int;
  v_rimaste  int;
  v_token    text;
begin
  if not public.is_pr() then
    raise exception 'Non autorizzato';
  end if;

  if not v_admin then
    if not exists (select 1 from public.prevendite_config c where c.id = 1 and c.aperta) then
      return query select 'chiuso'::text, null::text, null::numeric, null::boolean, null::boolean; return;
    end if;
    if not exists (select 1 from public.prevendite_config c where c.id = 1 and c.vendite_on) then
      return query select 'vendite_ferme'::text, null::text, null::numeric, null::boolean, null::boolean; return;
    end if;
  end if;

  select t.* into v_tier from public.event_tiers t
   where t.id = p_tier and t.event_id = p_event;
  if not found then
    return query select 'fascia_sconosciuta'::text, null::text, null::numeric, null::boolean, null::boolean; return;
  end if;

  if coalesce(trim(p_nome), '') = '' or coalesce(trim(p_cognome), '') = '' then
    return query select 'dati_mancanti'::text, null::text, null::numeric, null::boolean, null::boolean; return;
  end if;

  if not v_admin then
    select coalesce((select sum(al.delta) from public.pr_allocations al
                     where al.event_id = p_event and al.pr_id = v_me), 0)
         - (select count(*) from public.presales ps
            where ps.event_id = p_event and ps.pr_id = v_me and ps.stato <> 'annullata')
    into v_residue;

    if v_residue <= 0 then
      return query select 'finite'::text, null::text, null::numeric, null::boolean, null::boolean; return;
    end if;

    if v_tier.stock is not null then
      select v_tier.stock - count(*) into v_rimaste from public.presales ps
        where ps.tier_id = v_tier.id and ps.stato <> 'annullata';
      if v_rimaste <= 0 then
        return query select 'fascia_esaurita'::text, null::text, null::numeric, null::boolean, null::boolean; return;
      end if;
    end if;
  end if;

  v_token := substr(md5(gen_random_uuid()::text || clock_timestamp()::text), 1, 20);

  insert into public.presales
    (event_id, pr_id, da_admin, nome, cognome, anno_nascita, telefono,
     tier_id, tier_label, prezzo, token, stato, attivata_at, attivata_da)
  values
    (p_event,
     case when v_admin then null else v_me end,
     v_admin,
     trim(p_nome), trim(p_cognome), p_anno, nullif(trim(p_telefono), ''),
     v_tier.id, v_tier.label, v_tier.price, v_token,
     case when v_admin then 'attiva' else 'in_attesa' end,
     case when v_admin then now() else null end,
     case when v_admin then 'direzione' else null end);

  if not v_admin then
    perform public._pr_applica_credito(p_event, v_me, 'automatico');
  end if;

  return query select 'ok'::text, v_token, v_tier.price,
                      ((extract(year from now())::int - p_anno) < 18),
                      ((extract(year from now())::int - p_anno) < 16);
end;
$$;

grant execute on function public.pr_vendi(uuid, uuid, text, text, int, text) to authenticated;


-- Controllo (legge una tabella, non una funzione protetta)
select count(*) as "biglietti finora" from public.presales;
