-- ============================================================
-- 34 — UN MANAGER NON RITIRA DA SE STESSO
--
-- Trovato da Luka il 25 settembre 2026, provandolo con Leonardo:
-- *"ha venduto una prevendita, ha segnato di aver ritirato quei soldi, e
-- adesso a me non risultano nemmeno da ritirare"*.
--
-- Era vero, ed è colpa di come avevo scritto `am_incassa`: non vietava
-- nulla. Un manager poteva segnare come riscossi **i propri** incassi,
-- e da quel momento il suo debito da PR spariva dalla lista di Luka —
-- restava solo dentro il registro dei manager, dove lui non lo cercava.
-- Il risultato è che i soldi sembravano sistemati e invece erano ancora
-- nella tasca di qualcuno.
--
-- Le regole, dette da Luka:
--   · un manager ritira **solo da altri PR**;
--   · **mai da se stesso** e **mai da un altro manager** — quei soldi
--     li porta ognuno di persona;
--   · quello che ha raccolto resta scritto a suo nome **finché non lo
--     consegna**, e a Luka deve risultare fra le cose da ricevere.
--
-- Le prevendite invece restano come prima: un manager può consegnarne a
-- chiunque, anche a se stesso. Lì non ci sono soldi in ballo.
--
-- Da incollare nel SQL Editor. Si può rieseguire.
-- ============================================================


-- ------------------------------------------------------------
-- Il divieto
-- ------------------------------------------------------------
create or replace function public.am_incassa(
  p_event   uuid,
  p_pr      uuid,
  p_importo numeric,
  p_nota    text default null
)
returns table (esito text, attivati int, ancora_in_attesa int, mancante numeric, in_mano numeric)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_io    text := (auth.jwt() ->> 'email');
  v_alias text;
  v_att   int;
begin
  if not public.is_account_manager() then
    raise exception 'Non autorizzato';
  end if;
  if p_importo is null or p_importo <= 0 then
    raise exception 'Quanto hai ritirato?';
  end if;

  -- I propri incassi si portano a Luka di persona: segnarseli da soli
  -- vorrebbe dire cancellarsi un debito con un tocco.
  if p_pr = auth.uid() then
    raise exception 'I tuoi incassi li porti tu alla direzione: qui si ritira solo dagli altri PR';
  end if;

  -- E un manager non ritira da un altro manager: i soldi passerebbero
  -- di mano senza che nessuno se ne accorga.
  if exists (select 1 from public.account_managers m
              where m.profile_id = p_pr and m.attivo) then
    raise exception 'È un account manager: i suoi incassi li porta lui alla direzione';
  end if;

  select p.alias into v_alias
    from public.profiles p
   where p.id = p_pr and p.role = 'crew' and p.deleted_at is null;
  if v_alias is null then
    raise exception 'Questo non è un PR';
  end if;

  -- il PR ha pagato
  insert into public.pr_settlements (event_id, pr_id, importo, nota, created_by)
  values (p_event, p_pr, p_importo,
          coalesce(nullif(trim(p_nota), ''), 'ritirati dal manager'),
          coalesce(v_io, 'manager') || ' · manager');

  -- e adesso i soldi ce li ha il manager
  insert into public.am_movimenti (event_id, am_id, da_pr, importo, tipo, nota, created_by)
  values (p_event, auth.uid(), p_pr, p_importo, 'raccolta',
          coalesce(nullif(trim(p_nota), ''), 'ritirati da ' || v_alias), v_io);

  v_att := public._pr_applica_credito(p_event, p_pr, coalesce(v_io, 'manager') || ' (manager)');

  return query
    select 'ok'::text, v_att,
      (select count(*) from public.presales ps
        where ps.event_id = p_event and ps.pr_id = p_pr and ps.stato = 'in_attesa')::int,
      coalesce((select sum(ps.prezzo) from public.presales ps
                 where ps.event_id = p_event and ps.pr_id = p_pr and ps.stato <> 'annullata'), 0)
      - coalesce((select sum(st.importo) from public.pr_settlements st
                   where st.event_id = p_event and st.pr_id = p_pr), 0),
      coalesce((select sum(m.importo) from public.am_movimenti m
                 where m.am_id = auth.uid() and m.event_id = p_event), 0);
end;
$$;

revoke execute on function public.am_incassa(uuid, uuid, numeric, text) from public, anon;
grant execute on function public.am_incassa(uuid, uuid, numeric, text) to authenticated;


-- ------------------------------------------------------------
-- La lista dice chi è manager, così il tasto non compare nemmeno
-- ------------------------------------------------------------
-- Il divieto sta nel database, che è la difesa vera; ma un tasto che
-- si preme e poi dà errore è un tasto scritto male.
drop function if exists public.am_pr_lista(uuid);

create function public.am_pr_lista(p_event uuid)
returns table (
  pr_id      uuid,
  alias      text,
  nome       text,
  numero     int,
  telefono   text,
  vendute    int,
  in_mano    int,
  dovuto     numeric,
  raccolto   numeric,
  da_ritirare numeric,
  manager    boolean,
  sono_io    boolean
)
language plpgsql
security definer
set search_path = public
stable
as $$
#variable_conflict use_column
begin
  if not (public.is_account_manager() or public.is_admin()) then
    raise exception 'Non autorizzato';
  end if;

  return query
    select p.id, p.alias, p.nome, p.member_number, p.phone,
           coalesce(s.vendute, 0)::int,
           greatest(coalesce(a.tot, 0) - coalesce(s.vendute, 0), 0)::int,
           coalesce(s.dovuto, 0),
           coalesce(t.raccolto, 0),
           coalesce(s.dovuto, 0) - coalesce(t.raccolto, 0),
           exists (select 1 from public.account_managers m
                    where m.profile_id = p.id and m.attivo),
           p.id = auth.uid()
    from public.profiles p
    left join lateral (
      select sum(al.delta)::int as tot
      from public.pr_allocations al
      where al.event_id = p_event and al.pr_id = p.id
    ) a on true
    left join lateral (
      select count(*) filter (where ps.stato <> 'annullata') as vendute,
             sum(ps.prezzo) filter (where ps.stato <> 'annullata') as dovuto
      from public.presales ps
      where ps.event_id = p_event and ps.pr_id = p.id
    ) s on true
    left join lateral (
      select sum(st.importo) as raccolto
      from public.pr_settlements st
      where st.event_id = p_event and st.pr_id = p.id
    ) t on true
    where p.role = 'crew' and p.deleted_at is null
    order by (coalesce(s.dovuto, 0) - coalesce(t.raccolto, 0)) desc,
             coalesce(s.vendute, 0) desc, p.alias;
end;
$$;

revoke execute on function public.am_pr_lista(uuid) from public, anon;
grant execute on function public.am_pr_lista(uuid) to authenticated;


-- ------------------------------------------------------------
-- Il conto della serata, con dentro anche i manager
-- ------------------------------------------------------------
-- "A me deve sempre risultare anche quella consegna da ricevere, e
-- ovviamente da avere nel totale."
create or replace function public.admin_da_ricevere(p_event uuid)
returns table (
  dai_pr       numeric,   -- quello che i PR non hanno ancora portato
  dai_manager  numeric,   -- quello che i manager hanno raccolto e non consegnato
  totale       numeric
)
language plpgsql
security definer
set search_path = public
stable
as $$
declare
  v_pr numeric := 0;
  v_am numeric := 0;
begin
  if not public.is_admin() then
    raise exception 'Non autorizzato';
  end if;

  select coalesce(sum(x.mancante), 0) into v_pr
    from (
      select coalesce(sum(ps.prezzo) filter (where ps.stato <> 'annullata'), 0)
             - coalesce((select sum(st.importo) from public.pr_settlements st
                          where st.event_id = p_event and st.pr_id = ps.pr_id), 0) as mancante
        from public.presales ps
       where ps.event_id = p_event and ps.pr_id is not null
       group by ps.pr_id
    ) x
   where x.mancante > 0;

  select coalesce(sum(m.importo), 0) into v_am
    from public.am_movimenti m
   where m.event_id = p_event;

  return query select v_pr, v_am, v_pr + v_am;
end;
$$;

grant execute on function public.admin_da_ricevere(uuid) to authenticated;


-- ============================================================
-- Controllo
-- ============================================================
-- Deve stampare 0: nessun manager si è segnato i propri soldi. Se non è
-- 0, quelle righe vanno stornate a mano dal pannello (scheda Soldi per
-- l'incasso, scheda Manager per il movimento): il registro non si
-- cancella, si corregge con un movimento contrario.
select count(*) as "auto-incassi da correggere"
  from public.am_movimenti m
 where m.da_pr = m.am_id;
