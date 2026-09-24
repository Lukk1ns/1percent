-- ============================================================
-- 24 — CHI È GIÀ DENTRO DEVE POTER RIENTRARE
--
-- 24 settembre 2026. Un PR a cui Luka aveva appena sistemato
-- l'account: "mi ha fatto uscire ma non riesco a rientrare". Mette la
-- mail, riceve il link, lo apre… e finisce sulla schermata "si entra
-- solo su invito". Da fuori sembra il muro dell'invito, ma il muro è
-- solo dove è caduto: il punto è che il sito non l'ha riconosciuto.
--
-- COSA SUCCEDE DAVVERO. Chi si iscrive entra con una sessione
-- anonima, e il suo profilo porta quell'id. Quando poi rientra dalla
-- mail, l'accesso è un altro: `link_email_account()` deve ritrovare il
-- profilo dall'indirizzo e attaccarcelo, cambiando l'id del profilo.
-- Ma cambiare quell'id significa cambiarlo anche in tutte le tabelle
-- che lo tengono per mano — e **nessuna delle 22 chiavi che puntano a
-- profiles ha `on update cascade`**: Postgres si rifiuta, la funzione
-- va in errore, il sito conclude "non ti conosco" e lo manda a
-- iscriversi da capo. Più cose uno ha fatto sul sito, meno riesce a
-- rientrare: un PR con dei biglietti assegnati non ce la fa mai.
--
-- Qui dentro due cose:
--   · le chiavi verso profiles imparano a seguire il cambio di id
--   · link_email_account() riscritta, che non si fa più ingannare da
--     una maiuscola nell'indirizzo e dice "sì" anche quando non c'è
--     niente da spostare
--
-- Da incollare nel SQL Editor. Si può rieseguire.
-- ============================================================


-- ------------------------------------------------------------
-- 1. Le chiavi seguono il profilo
-- ------------------------------------------------------------
-- Una per una, senza elencarle a mano: domani ne nasceranno altre e
-- basterà rieseguire questo pezzo. Tocca solo quelle che puntano a
-- public.profiles e che non hanno già una regola in aggiornamento.
do $$
declare r record;
begin
  for r in
    select n.nspname  as schema_tabella,
           t.relname  as tabella,
           c.conname  as vincolo,
           pg_get_constraintdef(c.oid) as definizione
      from pg_constraint c
      join pg_class     t  on t.oid  = c.conrelid
      join pg_namespace n  on n.oid  = t.relnamespace
      join pg_class     rt on rt.oid = c.confrelid
      join pg_namespace rn on rn.oid = rt.relnamespace
     where c.contype = 'f'
       and rn.nspname = 'public'
       and rt.relname = 'profiles'
       and c.confupdtype <> 'c'                             -- 'c' = cascade
       and pg_get_constraintdef(c.oid) !~* 'on update'      -- non ne ha già una sua
  loop
    execute format('alter table %I.%I drop constraint %I',
                   r.schema_tabella, r.tabella, r.vincolo);
    execute format('alter table %I.%I add constraint %I %s on update cascade',
                   r.schema_tabella, r.tabella, r.vincolo, r.definizione);
    raise notice 'ora segue il profilo: %.% (%)', r.schema_tabella, r.tabella, r.vincolo;
  end loop;
end $$;


-- ------------------------------------------------------------
-- 2. Ritrovare il profilo dalla mail
-- ------------------------------------------------------------
-- Tre cambiamenti rispetto a prima:
--   · se il profilo è già attaccato a questo accesso risponde "sì"
--     invece di "no" (non c'era niente da spostare: non è un errore)
--   · l'indirizzo si confronta senza maiuscole e senza spazi ai lati,
--     perché "Mario@Gmail.com" e "mario@gmail.com" sono la stessa
--     persona e la mail la scrive lei a mano
--   · i profili cancellati restano cancellati: non si resuscita
--     nessuno per sbaglio
drop function if exists public.link_email_account();

create or replace function public.link_email_account()
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_email text;
  v_id    uuid;
begin
  if auth.uid() is null then
    return false;
  end if;

  -- Già a posto: questo accesso ha il suo profilo.
  if exists (
    select 1 from public.profiles p
     where p.id = auth.uid() and p.deleted_at is null
  ) then
    return true;
  end if;

  v_email := lower(trim(coalesce(auth.jwt() ->> 'email', '')));
  if v_email = '' then
    return false;
  end if;

  select p.id into v_id
    from public.profiles p
   where lower(trim(p.email)) = v_email
     and p.deleted_at is null
   order by p.created_at desc
   limit 1;

  if v_id is null then
    return false;   -- questa mail non è di nessuno: si iscriverà
  end if;

  if v_id = auth.uid() then
    return true;
  end if;

  update public.profiles set id = auth.uid() where id = v_id;
  return true;
end;
$$;

revoke execute on function public.link_email_account() from public, anon;
grant execute on function public.link_email_account() to authenticated;


-- ============================================================
-- Controllo
-- ============================================================
-- Deve dire 0. Se dice un altro numero, quelle chiavi lì bloccano
-- ancora il rientro di chi ha righe in quella tabella.
select count(*) as "chiavi che NON seguono il profilo (deve essere 0)"
  from pg_constraint c
  join pg_class     rt on rt.oid = c.confrelid
  join pg_namespace rn on rn.oid = rt.relnamespace
 where c.contype = 'f'
   and rn.nspname = 'public'
   and rt.relname = 'profiles'
   and c.confupdtype <> 'c';
