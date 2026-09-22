-- ============================================================
-- 21 — LA PORTA FUNZIONA ANCHE SENZA RETE
--
-- Come faceva Evently, e per lo stesso motivo: in porta il campo va e
-- viene, e una serata non si ferma perché il telefono non prende.
--
-- Come funziona:
--   · PRIMA della serata si scarica la lista dei biglietti sul telefono
--   · durante la serata si valida CONTRO LA LISTA, senza chiedere niente
--     a nessuno: l'ingresso viene segnato sul telefono
--   · appena torna la rete, gli ingressi vengono mandati al server
--
-- Il rischio vero del lavorare offline è il doppio ingresso: due
-- telefoni che non si parlano lasciano passare lo stesso biglietto due
-- volte. Non si può impedire (sono scollegati), ma alla riconciliazione
-- il server **lo dice**, con nome e ora, così si sa cos'è successo.
--
-- Da incollare nel SQL Editor. Si può rieseguire.
-- ============================================================


-- ------------------------------------------------------------
-- LA LISTA DA PORTARSI DIETRO
--
-- Solo quello che serve in porta: chi è, cosa ha pagato, se è
-- minorenne. Niente telefono, niente prezzo: se il telefono di un
-- collaboratore finisce in mano a qualcuno, non c'è molto da leggere.
-- ------------------------------------------------------------
create or replace function public.porta_lista(p_event uuid)
returns table (
  token      text,
  nome       text,
  cognome    text,
  tier_label text,
  stato      text,
  under16    boolean,
  minorenne  boolean,
  pr_alias   text
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
    select s.token, s.nome, s.cognome, s.tier_label, s.stato,
           (extract(year from now())::int - s.anno_nascita) < 16,
           (extract(year from now())::int - s.anno_nascita) < 18,
           coalesce(p.alias, 'DIREZIONE')
    from public.presales s
    left join public.profiles p on p.id = s.pr_id
    where s.event_id = p_event
      and s.stato <> 'annullata'
    order by s.cognome, s.nome;
end;
$$;

grant execute on function public.porta_lista(uuid) to authenticated;


-- ------------------------------------------------------------
-- RIPORTARE GLI INGRESSI FATTI SENZA RETE
--
-- Arriva un elenco di { token, quando }. Per ognuno:
--   entrato       → segnato, tutto a posto
--   gia_entrato   → era già passato PRIMA: doppio ingresso, da guardare
--   non_pagato    → è stato fatto entrare ma il PR non aveva saldato
--   sconosciuto   → token che non risulta
--
-- L'orario è quello vero della porta, non quello della sincronizzazione:
-- così il registro resta fedele a com'è andata la serata.
-- ------------------------------------------------------------
create or replace function public.porta_sync(p_scansioni jsonb)
returns table (
  token     text,
  esito     text,
  nome      text,
  cognome   text,
  quando    timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
declare
  r      jsonb;
  v_b    record;
  v_when timestamptz;
  v_chi  text := (auth.jwt() ->> 'email');
begin
  if not public.is_staff() then
    raise exception 'Non autorizzato';
  end if;

  for r in select * from jsonb_array_elements(coalesce(p_scansioni, '[]'::jsonb))
  loop
    select s.* into v_b from public.presales s
     where s.token = (r ->> 'token');

    if not found then
      token := r ->> 'token'; esito := 'sconosciuto';
      nome := null; cognome := null; quando := null;
      return next;
      continue;
    end if;

    v_when := coalesce((r ->> 'quando')::timestamptz, now());

    if v_b.stato = 'usata' then
      -- era già passato prima che arrivasse questa scansione
      token := v_b.token; esito := 'gia_entrato';
      nome := v_b.nome; cognome := v_b.cognome; quando := v_b.usata_at;
      return next;
      continue;
    end if;

    update public.presales s
       set stato = 'usata',
           usata_at = v_when,
           usata_da = v_chi,
           entrata_da = v_chi || ' (senza rete)',
           -- se era in attesa, chi l'ha fatto entrare se n'è preso la
           -- responsabilità: resta scritto
           attivata_at = coalesce(s.attivata_at, v_when),
           attivata_da = coalesce(s.attivata_da, v_chi || ' (in porta, senza rete)')
     where s.id = v_b.id;

    token := v_b.token;
    esito := case when v_b.stato = 'in_attesa' then 'non_pagato' else 'entrato' end;
    nome := v_b.nome; cognome := v_b.cognome; quando := v_when;
    return next;
  end loop;
end;
$$;

grant execute on function public.porta_sync(jsonb) to authenticated;


-- ============================================================
-- Controllo
-- ============================================================
select
  (select count(*) from public.presales where entrata_da like '%senza rete%')
    as "ingressi registrati offline finora";
