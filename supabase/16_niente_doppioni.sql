-- ============================================================
-- 16 — NIENTE DUE BIGLIETTI ALLO STESSO NOME
--
-- Chiesto da Luka il 22 settembre 2026.
--
--   · stesso NUMERO DI TELEFONO: permesso, e deve restare permesso —
--     uno può comprare i biglietti per tutto il gruppo e riceverli lui
--   · stesso NOME **e** COGNOME nella stessa serata: bloccato, è la
--     stessa persona due volte
--   · stesso solo cognome: permesso (fratelli, cugini)
--
-- Il confronto ignora maiuscole e spazi di troppo: "mario rossi" e
-- "Mario  Rossi" sono la stessa persona.
--
-- I biglietti annullati non contano: se uno viene annullato, quel nome
-- torna libero.
--
-- L'admin può **forzare** il doppione, per gli omonimi veri: due Marco
-- Rossi diversi esistono, e in quel caso decide lui.
--
-- Da incollare nel SQL Editor. Si può rieseguire.
-- ============================================================

drop function if exists public.pr_vendi(uuid, uuid, text, text, int, text);

create function public.pr_vendi(
  p_event    uuid,
  p_tier     uuid,
  p_nome     text,
  p_cognome  text,
  p_anno     int,
  p_telefono text,
  p_forza    boolean default false
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

  -- Stessa persona, stessa serata: si ferma qui.
  -- L'admin può insistere (omonimi), il PR no.
  if not (v_admin and p_forza) then
    if exists (
      select 1 from public.presales ps
      where ps.event_id = p_event
        and ps.stato <> 'annullata'
        and lower(regexp_replace(ps.nome, '\s+', ' ', 'g'))
            = lower(regexp_replace(trim(p_nome), '\s+', ' ', 'g'))
        and lower(regexp_replace(ps.cognome, '\s+', ' ', 'g'))
            = lower(regexp_replace(trim(p_cognome), '\s+', ' ', 'g'))
    ) then
      return query select 'gia_presente'::text, null::text, null::numeric, null::boolean, null::boolean; return;
    end if;
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
     -- doppi spazi via: il confronto dei doppioni deve reggere nel tempo
     regexp_replace(trim(p_nome), '\s+', ' ', 'g'),
     regexp_replace(trim(p_cognome), '\s+', ' ', 'g'),
     p_anno, nullif(trim(p_telefono), ''),
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

grant execute on function public.pr_vendi(uuid, uuid, text, text, int, text, boolean) to authenticated;


-- ============================================================
-- Controllo: ci sono già doppioni in giro?
-- (Se la serata è appena partita, esce zero.)
-- ============================================================
select count(*) as "nomi ripetuti nella stessa serata"
from (
  select ps.event_id, lower(ps.nome) as n, lower(ps.cognome) as c
  from public.presales ps
  where ps.stato <> 'annullata'
  group by 1, 2, 3
  having count(*) > 1
) d;
