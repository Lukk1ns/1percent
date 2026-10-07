-- ============================================================
-- 44 — I PR DEVONO POTER RIENTRARE (di nuovo)
--
-- 7 ottobre 2026. Luka: *"ho pr che dicono che non riescono ad
-- entrare più, che il sito non li riconosce"*.
--
-- È lo stesso buco del 24, rinato con le tabelle nuove. Chi si
-- iscrive entra con un accesso anonimo; quando rientra con la mail
-- l'accesso è un altro, e `link_email_account()` sposta il profilo
-- sull'accesso nuovo cambiandogli l'id. Il 24 aveva insegnato a tutte
-- le chiavi verso `profiles` a seguire il cambio (`on update cascade`)
-- — ma solo a quelle che c'erano il 24 settembre. Quelle nate dopo
-- non lo sanno, e Postgres rifiuta il cambio di id:
--
--   · `pr_serate` (39, 4 ott) — OGNI PR ne ha una riga (tutti agganciati
--     a Halloween): da quel giorno nessun PR riesce più a ricollegarsi.
--     Il sito risponde "Mail sbagliata?" anche con la mail giusta.
--   · `account_managers` e `am_movimenti` (32) — i manager, e i PR che
--     hanno consegnato soldi a un manager.
--   · `direzione_messaggi` (37) — chi ha scritto alla direzione.
--
-- In più `am_movimenti` ha un blocco che rifiuta ogni modifica: come
-- per il registro dei PR (25), deve lasciar passare il solo cambio di
-- persona, con tutto il resto identico.
--
-- Da incollare nel SQL Editor. Si può rieseguire.
-- ⚠️ D'ora in poi: ogni tabella nuova che punta a profiles nasce con
-- `on update cascade` — o si riesegue questo script dopo.
-- ============================================================


-- ------------------------------------------------------------
-- 1. Le chiavi seguono il profilo (stesso giro del 24)
-- ------------------------------------------------------------
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
-- 2. I movimenti dei manager: passa solo il cambio di persona
-- ------------------------------------------------------------
-- Come `blocca_modifica_registro` del 25: se tutta la riga è identica
-- tranne chi la tiene (`am_id`, `da_pr`), è la stessa persona che
-- rientra da un accesso nuovo. Qualunque altra modifica, e ogni
-- cancellazione, resta respinta come prima.
create or replace function public.proteggi_am_movimenti()
returns trigger
language plpgsql
as $$
begin
  if TG_OP = 'UPDATE'
     and (new.am_id is distinct from old.am_id or new.da_pr is distinct from old.da_pr)
     and (to_jsonb(new) - 'am_id' - 'da_pr') = (to_jsonb(old) - 'am_id' - 'da_pr') then
    return new;
  end if;

  raise exception 'I movimenti dei manager non si modificano né si cancellano: usa admin_am_storna';
end;
$$;


-- ============================================================
-- Controllo
-- ============================================================
-- Deve dire 0.
select count(*) as "chiavi che NON seguono il profilo (deve essere 0)"
  from pg_constraint c
  join pg_class     rt on rt.oid = c.confrelid
  join pg_namespace rn on rn.oid = rt.relnamespace
 where c.contype = 'f'
   and rn.nspname = 'public'
   and rt.relname = 'profiles'
   and c.confupdtype <> 'c';
