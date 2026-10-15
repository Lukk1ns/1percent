-- ============================================================
-- 46 — ELIMINARE UNA PERSONA DAL PANNELLO (15 ottobre 2026)
--
-- Luka, dalla scheda di "cerca una persona" (/admin/cerca):
-- *"quando trovo un cliente o un iscritto o pr devo aver la
-- possibilità di eliminarlo tutto con le sue info"*.
--
-- admin_elimina_persona(profili, biglietti, richieste) fa tutto in
-- un colpo solo, o non fa niente:
--
--   · i biglietti ancora validi per una serata che deve ancora
--     arrivare si ANNULLANO (decisione di Luka: "lo annulli ma mi
--     avvisi"). Passano da admin_presale_annulla, quindi è un
--     annullamento normale: se il PR aveva già portato i soldi gli
--     vengono stornati, e se li ha in mano un manager lo si dice;
--   · su TUTTI i suoi biglietti nome, cognome e telefono spariscono,
--     ma la riga resta: è dentro i conti del PR e della serata, e i
--     soldi sono un registro (script 19). Diventa "cancellato";
--   · le richieste di una lista omaggio (MALDITA) si cancellano;
--   · il profilo si anonimizza come quando uno si cancella da solo
--     (delete_my_profile), in più nome, numero, risposte e staff;
--     via pass, ingresso PR, agganci alle serate, ruolo di manager e
--     conversazione con la direzione. Le foto del profilo le toglie
--     la pagina (lo storage non si tocca da SQL).
--
-- UN PR CON SOLDI APERTI NON SI ELIMINA: se su una serata quello che
-- ha venduto e quello che ha portato non tornano, o se da manager ha
-- contanti in mano, la funzione si ferma e non cambia niente. Quei
-- soldi resterebbero senza un nome a cui chiederli. Prima si chiudono
-- i conti, poi si elimina.
--
-- Da incollare nel SQL Editor di Supabase. Si può rieseguire.
-- ============================================================

create or replace function public.admin_elimina_persona(
  p_profili   uuid[],
  p_biglietti uuid[],
  p_richieste uuid[]
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_profili   uuid[] := coalesce(p_profili, '{}');
  v_biglietti uuid[] := coalesce(p_biglietti, '{}');
  v_richieste uuid[] := coalesce(p_richieste, '{}');
  v_p         record;
  v_aperto    record;
  v_b         record;
  v_esito     record;
  v_annullati jsonb := '[]'::jsonb;
  v_n_bigl    int := 0;
  v_n_rich    int := 0;
  v_n_prof    int := 0;
begin
  if not public.is_admin() then
    raise exception 'Non autorizzato';
  end if;

  -- 1 · Prima i soldi: un PR o un manager con conti aperti ferma tutto.
  for v_p in
    select p.id, p.alias from public.profiles p where p.id = any(v_profili)
  loop
    select x.event_id, sum(x.importo) as quanto
      into v_aperto
      from (
        select ps.event_id, ps.prezzo as importo
          from public.presales ps
         where ps.pr_id = v_p.id and ps.stato <> 'annullata'
        union all
        select st.event_id, -st.importo
          from public.pr_settlements st
         where st.pr_id = v_p.id
      ) x
     group by x.event_id
    having sum(x.importo) <> 0
     limit 1;
    if found then
      raise exception 'soldi_aperti:%:%', v_p.alias, v_aperto.quanto;
    end if;

    select m.event_id, sum(m.importo) as quanto
      into v_aperto
      from public.am_movimenti m
     where m.am_id = v_p.id
     group by m.event_id
    having sum(m.importo) <> 0
     limit 1;
    if found then
      raise exception 'manager_con_soldi:%:%', v_p.alias, v_aperto.quanto;
    end if;
  end loop;

  -- 2 · I biglietti. Anche quello nato dall'approvazione MALDITA.
  v_biglietti := v_biglietti || coalesce(
    (select array_agg(r.presale_id)
       from public.omaggio_richieste r
      where r.id = any(v_richieste) and r.presale_id is not null),
    '{}'::uuid[]);

  -- Prima il nome via, poi l'annullamento: così anche la riga del
  -- rimborso nel registro dei soldi non si porta dietro il cliente.
  update public.presales s
     set nome = 'cancellato', cognome = '', telefono = null
   where s.id = any(v_biglietti);
  get diagnostics v_n_bigl = row_count;

  for v_b in
    select s.id, s.prezzo, e.name as serata, e.starts_at,
           coalesce(p.alias, 'DIREZIONE') as pr
      from public.presales s
      join public.events e on e.id = s.event_id
      left join public.profiles p on p.id = s.pr_id
     where s.id = any(v_biglietti)
       and s.stato in ('attiva', 'in_attesa')
       and coalesce(e.ends_at, e.starts_at) >= now()
  loop
    select * into v_esito
      from public.admin_presale_annulla(v_b.id, 'persona eliminata dal pannello');
    v_annullati := v_annullati || jsonb_build_object(
      'serata',   v_b.serata,
      'quando',   v_b.starts_at,
      'pr',       v_b.pr,
      'prezzo',   v_b.prezzo,
      'rimborso', coalesce(v_esito.rimborso, 0),
      'manager',  v_esito.manager_da_sistemare
    );
  end loop;

  -- 3 · Le liste omaggio.
  delete from public.omaggio_richieste r where r.id = any(v_richieste);
  get diagnostics v_n_rich = row_count;

  -- 4 · Il profilo. Il numero di tessera resta (la catena di chi ha
  -- portato chi non si rompe), tutto il resto se ne va.
  update public.profiles p
     set alias               = 'cancellato_' || p.member_number,
         avatar_id           = null,
         email               = null,
         phone               = null,
         nome                = null,
         gender              = null,
         quiz_answers        = null,
         crew_answers        = null,
         bio                 = null,
         photo_blur_path     = null,
         photo_updated_at    = null,
         photo_consent_at    = null,
         role                = 'public',
         crew_request_status = 'nessuna',
         crew_since          = null,
         whatsapp_scritto_at = null,
         deleted_at          = coalesce(p.deleted_at, now())
   where p.id = any(v_profili);
  get diagnostics v_n_prof = row_count;

  delete from public.passes             where profile_id = any(v_profili);
  delete from public.pr_ingressi        where pr_id      = any(v_profili);
  delete from public.pr_serate          where pr_id      = any(v_profili);
  delete from public.account_managers   where profile_id = any(v_profili);
  delete from public.direzione_messaggi where profile_id = any(v_profili);

  -- Chi ha eliminato cosa: solo i numeri, nessun dato della persona.
  begin
    perform public.log_admin(
      'elimina_persona', null,
      jsonb_build_object('profili', v_n_prof, 'biglietti', v_n_bigl,
                         'richieste', v_n_rich, 'annullati', jsonb_array_length(v_annullati)));
  exception when others then
    null;
  end;

  return jsonb_build_object(
    'profili',   v_n_prof,
    'biglietti', v_n_bigl,
    'richieste', v_n_rich,
    'annullati', v_annullati
  );
end;
$$;

revoke execute on function public.admin_elimina_persona(uuid[], uuid[], uuid[]) from public, anon;
grant execute on function public.admin_elimina_persona(uuid[], uuid[], uuid[]) to authenticated;


-- ============================================================
-- Controllo: deve dire 1. (Qui non si chiama la funzione: nel SQL
-- Editor non sei admin, risponderebbe "Non autorizzato" e annullerebbe
-- tutto lo script.)
-- ============================================================
select count(*) as "funzione elimina persona"
  from pg_proc
 where proname = 'admin_elimina_persona';
