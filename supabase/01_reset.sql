-- ============================================================
-- 1% — AZZERAMENTO DATI
--
-- ⚠️  IRREVERSIBILE. Cancella TUTTI i membri, i pass, i poke,
--     i messaggi, i post e i regali estratti.
--     I tuoi account admin e operatore NON vengono toccati.
--
-- PRIMA DI ESEGUIRE:
--   1. Hai eseguito 00_backup.sql e scaricato i 4 CSV?  ← obbligatorio
--   2. Hai svuotato i bucket foto?  (Storage → volti e volti-blur →
--      seleziona tutto → Delete).  I file NON si possono cancellare
--      da SQL: Supabase lo vieta. Vanno tolti dall'interfaccia.
--
-- Se hai risposto sì a entrambe, incolla tutto ed esegui.
-- Al warning "destructive operation" rispondi "Run without RLS".
-- ============================================================

begin;

-- ------------------------------------------------------------
-- Tabelle che potrebbero non esistere (social congelato, regali,
-- bacheca): le svuoto solo se ci sono, così lo script gira sempre.
-- ------------------------------------------------------------
do $$
declare
  t text;
begin
  foreach t in array array[
    'prize_draws',      -- regali estratti
    'reports',          -- segnalazioni
    'blocks',           -- blocchi tra utenti
    'messages',         -- messaggi
    'conversations',
    'chat_requests',
    'pokes',
    'posts'             -- bacheca post-it
  ]
  loop
    if to_regclass('public.' || t) is not null then
      execute format('delete from public.%I', t);
      raise notice 'svuotata: %', t;
    end if;
  end loop;
end $$;

-- ------------------------------------------------------------
-- Pass e profili
-- ------------------------------------------------------------
delete from public.passes;
delete from public.profiles;

-- ------------------------------------------------------------
-- Utenti auth: via tutti tranne admin e operatori, altrimenti
-- ti chiudi fuori dal tuo stesso pannello.
-- ------------------------------------------------------------
do $$
declare
  v_tenuti text := 'select lower(email) from public.admins';
begin
  -- la tabella operators esiste solo se hai già lanciato il ruolo operatore
  if to_regclass('public.operators') is not null then
    v_tenuti := v_tenuti || ' union select lower(email) from public.operators';
  end if;

  execute format(
    'delete from auth.users u where coalesce(lower(u.email), '''') not in (%s)',
    v_tenuti
  );
end $$;

-- ------------------------------------------------------------
-- Il prossimo iscritto sarà il #1
-- ------------------------------------------------------------
alter sequence public.profiles_member_number_seq restart with 1;

commit;

-- ------------------------------------------------------------
-- VERIFICA — devono essere tutti 0 tranne admin/operatori
-- ------------------------------------------------------------
select
  (select count(*) from public.profiles) as membri,
  (select count(*) from public.passes)   as pass,
  (select count(*) from auth.users)      as utenti_auth_rimasti,
  (select count(*) from public.admins)   as admin;
