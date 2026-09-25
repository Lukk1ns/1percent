-- ============================================================
-- 33 — LA POSTA DEL PANNELLO
--
-- Chiesto da Luka il 25 settembre 2026: *"mi manca un tasto dove apro i
-- messaggi che arrivano dagli utenti, o chi si lamenta delle foto — un
-- posto dove si raccoglie tutto"*.
--
-- Il buco vero era un altro, e si vedeva solo cercandolo: **le richieste
-- di togliere una foto non si potevano leggere.** `chiedi_rimozione`
-- (script 17) le scriveva in `photo_removal_requests`, `admin_albums` ne
-- mostrava il numero accanto all'album, ma nessuna funzione le
-- restituiva: il motivo scritto dalla persona non era leggibile da
-- nessuna parte e la richiesta non si poteva chiudere. Uno chiedeva "in
-- questa foto ci sono io e non mi va" e non lo sapeva nessuno.
--
-- Qui dentro: l'elenco delle richieste, il modo per respingerle (toglierle
-- si fa già con `admin_foto_togli`, che le chiude da sé) e un contatore
-- unico per il pallino sul pannello.
--
-- Da incollare nel SQL Editor. Si può rieseguire.
-- ============================================================


-- ------------------------------------------------------------
-- Le richieste di togliere una foto
-- ------------------------------------------------------------
create or replace function public.admin_rimozioni()
returns table (
  id         uuid,
  photo_id   uuid,
  album      text,
  album_slug text,
  chi        text,
  numero     int,
  motivo     text,
  stato      text,
  quando     timestamptz,
  chiusa_da  text
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
    select r.id, r.photo_id, a.nome, a.slug, p.alias, p.member_number,
           r.motivo, r.stato, r.created_at, r.handled_by
      from public.photo_removal_requests r
      join public.photos f on f.id = r.photo_id
      join public.albums a on a.id = f.album_id
      left join public.profiles p on p.id = r.profile_id
     order by (r.stato = 'aperta') desc, r.created_at desc
     limit 200;
end;
$$;

grant execute on function public.admin_rimozioni() to authenticated;


-- "Ho guardato e la foto resta": la richiesta si chiude, non sparisce.
create or replace function public.admin_rimozione_respingi(p_id uuid)
returns text
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception 'Non autorizzato';
  end if;

  update public.photo_removal_requests r
     set stato = 'respinta',
         handled_at = now(),
         handled_by = (auth.jwt() ->> 'email')
   where r.id = p_id and r.stato = 'aperta';

  if not found then return 'gia_chiusa'; end if;
  return 'ok';
end;
$$;

grant execute on function public.admin_rimozione_respingi(uuid) to authenticated;


-- ------------------------------------------------------------
-- Il contatore: tutto quello che aspetta una risposta
-- ------------------------------------------------------------
-- Una chiamata sola, per il pallino rosso sul pannello. Ogni voce è un
-- numero di cose **aperte**, cioè che qualcuno sta aspettando.
create or replace function public.admin_notifiche()
returns table (
  rimozioni    int,
  segnalazioni int,
  candidature  int,
  bacheca      int,
  totale       int
)
language plpgsql
security definer
set search_path = public
stable
as $$
declare
  v_rim int := 0;
  v_seg int := 0;
  v_can int := 0;
  v_bac int := 0;
begin
  if not public.is_admin() then
    raise exception 'Non autorizzato';
  end if;

  -- Ogni pezzo dentro il suo controllo: se una tabella non c'è ancora
  -- (script non incollati, o social spento) il resto deve arrivare
  -- lo stesso, invece di far fallire tutta la chiamata.
  begin
    select count(*)::int into v_rim
      from public.photo_removal_requests r where r.stato = 'aperta';
  exception when others then v_rim := 0;
  end;

  begin
    select count(*)::int into v_seg
      from public.reports r where r.status = 'open';
  exception when others then v_seg := 0;
  end;

  begin
    select count(*)::int into v_can
      from public.profiles p
     where p.crew_request_status = 'in_attesa' and p.deleted_at is null;
  exception when others then v_can := 0;
  end;

  -- La bacheca si conta con la sua funzione: la tabella `posts` è nata
  -- fuori dal repo e i nomi delle colonne non si danno per scontati.
  begin
    select count(*)::int into v_bac from public.admin_pending_posts();
  exception when others then v_bac := 0;
  end;

  return query select v_rim, v_seg, v_can, v_bac, (v_rim + v_seg + v_can + v_bac);
end;
$$;

grant execute on function public.admin_notifiche() to authenticated;


-- ============================================================
-- Controllo
-- ============================================================
-- Quante cose aspettano una risposta, per tipo. Le richieste di
-- rimozione sono quelle che prima non si potevano nemmeno leggere.


-- Il controllo gira come padrone del database, dove `is_admin()` è
-- falso: quindi non si chiama `admin_notifiche()` (solleverebbe "Non
-- autorizzato" e, essendo tutto una transazione sola, annullerebbe
-- l'intero script). Si contano le righe.
create or replace function public.admin_notifiche_controllo()
returns table (foto_da_togliere int, segnalazioni int, candidature int)
language sql
security definer
set search_path = public
stable
as $$
  select
    (select count(*)::int from public.photo_removal_requests where stato = 'aperta'),
    (select count(*)::int from public.reports where status = 'open'),
    (select count(*)::int from public.profiles
      where crew_request_status = 'in_attesa' and deleted_at is null);
$$;

revoke execute on function public.admin_notifiche_controllo() from public, anon, authenticated;

select * from public.admin_notifiche_controllo();
