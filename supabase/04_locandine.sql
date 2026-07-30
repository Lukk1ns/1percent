-- ============================================================
-- 1% — LOCANDINE DEGLI EVENTI (step 3)
--
-- Da eseguire DOPO 03_eventi.sql. Incollalo tutto e premi Run.
-- È idempotente: rilanciarlo non rompe niente.
--
-- Cosa introduce:
--   · due depositi per le locandine: una nitida (PRIVATA) e una
--     sfocata (pubblica), come già facciamo per i volti
--   · la locandina nitida la vedono SOLO i membri iscritti.
--     Chi non è dentro vede la versione sfocata e un lucchetto.
--   · la sfocata è generata dal server a 180px e poi sfocata:
--     non è un filtro CSS da togliere, i pixel non ci sono più.
--
-- Il formato di riferimento è la storia di Instagram: 1080x1920.
-- ============================================================

-- ============================================================
-- 1. I DUE DEPOSITI
-- ============================================================

insert into storage.buckets (id, name, public)
values ('locandine', 'locandine', false)
on conflict (id) do update set public = false;

insert into storage.buckets (id, name, public)
values ('locandine-blur', 'locandine-blur', true)
on conflict (id) do update set public = true;


-- ============================================================
-- 2. CHI PUÒ VEDERE COSA
-- ============================================================

-- La nitida: solo chi ha un profilo, cioè chi si è iscritto (e lo staff).
drop policy if exists "locandina_membri_leggono" on storage.objects;
create policy "locandina_membri_leggono"
on storage.objects for select to authenticated
using (
  bucket_id = 'locandine'
  and (
    exists (select 1 from public.profiles p where p.id = auth.uid())
    or public.is_admin()
  )
);

-- La sfocata: chiunque, anche chi passa di là per caso.
drop policy if exists "locandina_sfocata_pubblica" on storage.objects;
create policy "locandina_sfocata_pubblica"
on storage.objects for select to anon, authenticated
using (bucket_id = 'locandine-blur');

-- Scrivere e cancellare: solo lo staff.
drop policy if exists "locandina_admin_carica" on storage.objects;
create policy "locandina_admin_carica"
on storage.objects for insert to authenticated
with check (bucket_id in ('locandine', 'locandine-blur') and public.is_admin());

drop policy if exists "locandina_admin_sostituisce" on storage.objects;
create policy "locandina_admin_sostituisce"
on storage.objects for update to authenticated
using (bucket_id in ('locandine', 'locandine-blur') and public.is_admin())
with check (bucket_id in ('locandine', 'locandine-blur') and public.is_admin());

drop policy if exists "locandina_admin_cancella" on storage.objects;
create policy "locandina_admin_cancella"
on storage.objects for delete to authenticated
using (bucket_id in ('locandine', 'locandine-blur') and public.is_admin());


-- ============================================================
-- 3. QUANDO È STATA CARICATA
--
-- Serve a forzare i browser a riscaricarla dopo una sostituzione:
-- senza, resta in cache la vecchia.
-- ============================================================

alter table public.events add column if not exists cover_updated_at timestamptz;


-- ============================================================
-- 4. LETTURE PUBBLICHE — la locandina esce solo se svelato
--
-- Un evento nascosto non manda NIENTE: né nome, né locandina.
-- La locandina dice il nome della festa, quindi va protetta come lui.
-- ============================================================

create or replace function public.evento_pubblico(e public.events, v public.venues)
returns jsonb
language sql
stable
as $$
  select case
    when public.evento_svelato(e.reveal_at) then jsonb_build_object(
      'svelato',     true,
      'id',          e.id,
      'slug',        e.slug,
      'nome',        e.name,
      'locale',      v.name,
      'citta',       v.city,
      'indirizzo',   v.address,
      'descrizione', e.descrizione,
      'cover_key',   e.cover_key,
      'cover_v',     coalesce(extract(epoch from e.cover_updated_at)::bigint, 0),
      'starts_at',   e.starts_at,
      'ends_at',     e.ends_at,
      'passato',     coalesce(e.ends_at, e.starts_at) < now()
    )
    else jsonb_build_object(
      'svelato',   false,
      'teaser',    e.teaser,
      'reveal_at', e.reveal_at,
      'starts_at', e.starts_at,
      'ends_at',   e.ends_at,
      'passato',   false
    )
  end;
$$;


-- ============================================================
-- 5. PANNELLO ADMIN
-- ============================================================

-- admin_events cambia forma (due colonne in più), quindi va rifatta.
drop function if exists public.admin_events();

create or replace function public.admin_events()
returns table (
  id uuid, name text, slug text, venue_id uuid, locale text,
  starts_at timestamptz, ends_at timestamptz, reveal_at timestamptz,
  teaser text, descrizione text, published boolean, svelato boolean,
  cover_key text, cover_v bigint
)
language plpgsql
security definer
set search_path = public
stable
as $$
begin
  if not public.is_admin() then raise exception 'Non autorizzato'; end if;

  return query
  select e.id, e.name, e.slug, e.venue_id, v.name,
         e.starts_at, e.ends_at, e.reveal_at,
         e.teaser, e.descrizione, e.published,
         public.evento_svelato(e.reveal_at),
         e.cover_key,
         coalesce(extract(epoch from e.cover_updated_at)::bigint, 0)
  from public.events e
  left join public.venues v on v.id = e.venue_id
  order by e.starts_at desc;
end;
$$;

revoke execute on function public.admin_events() from anon;
grant execute on function public.admin_events() to authenticated;


-- Registra (o cancella) la locandina di un evento.
-- I file li carica il sito via Storage API: qui si scrive solo dove sono.
create or replace function public.admin_set_event_cover(p_id uuid, p_key text)
returns bigint
language plpgsql
security definer
set search_path = public
as $$
declare
  v_quando timestamptz;
begin
  if not public.is_admin() then raise exception 'Non autorizzato'; end if;

  if coalesce(trim(p_key), '') = '' then
    update public.events
    set cover_key = null, cover_updated_at = null
    where id = p_id;

    perform public.log_admin('rimuovi_locandina', p_id::text, null);
    return 0;
  end if;

  v_quando := now();
  update public.events
  set cover_key = trim(p_key), cover_updated_at = v_quando
  where id = p_id;

  if not found then raise exception 'Evento non trovato'; end if;

  perform public.log_admin('carica_locandina', p_id::text,
                           jsonb_build_object('file', trim(p_key)));
  return extract(epoch from v_quando)::bigint;
end;
$$;

revoke execute on function public.admin_set_event_cover(uuid, text) from anon;
grant execute on function public.admin_set_event_cover(uuid, text) to authenticated;


-- ============================================================
-- VERIFICA
-- ============================================================
select
  (select count(*) from storage.buckets where id in ('locandine', 'locandine-blur')) as depositi,
  (select count(*) from public.events where cover_key is not null) as eventi_con_locandina;
