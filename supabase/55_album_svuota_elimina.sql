-- ============================================================
-- 55 — SVUOTARE O ELIMINARE UN ALBUM IN UN COLPO SOLO
--
-- Luka, 3 novembre 2026: *"stavo caricando le foto ma ho sbagliato
-- un album nuovo... manca un tasto per cancellare tutto insieme e
-- ricaricare poi"*. Prima si poteva solo "togliere" una foto alla
-- volta, e togliere la nasconde soltanto (la riga resta, il file pure).
--
-- admin_album_svuota(album, elimina):
--   · elimina = false → via TUTTE le foto (anche quelle già tolte),
--     l'album resta con nome e data, pronto per ricaricarle;
--   · elimina = true  → via l'album intero, foto comprese.
-- Le righe si cancellano davvero (le richieste di rimozione vanno con
-- loro). I file su Cloudflare R2 li cancella il sito subito dopo
-- (/api/foto/album), cartella dell'album intera.
-- Resta una riga in admin_log: chi, quale album, quante foto.
--
-- Da incollare dopo il 17 (e il 23). Si può rieseguire.
-- ============================================================

create or replace function public.admin_album_svuota(p_id uuid, p_elimina boolean)
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  v_nome text;
  v_n    int;
begin
  if not public.is_admin() then
    raise exception 'Non autorizzato';
  end if;

  select a.nome into v_nome from public.albums a where a.id = p_id;
  if not found then
    return -1;
  end if;

  select count(*)::int into v_n from public.photos p where p.album_id = p_id;

  if p_elimina then
    delete from public.albums a where a.id = p_id;   -- foto e richieste vanno in cascata
  else
    update public.albums a set cover_photo = null where a.id = p_id;
    delete from public.photos p where p.album_id = p_id;
  end if;

  insert into public.admin_log (actor, action, target, payload)
  values (coalesce(auth.jwt() ->> 'email', 'sql'),
          case when p_elimina then 'album_elimina' else 'album_svuota' end,
          p_id::text,
          jsonb_build_object('nome', v_nome, 'foto', v_n));

  return v_n;
end;
$$;

revoke execute on function public.admin_album_svuota(uuid, boolean) from public, anon;
grant execute on function public.admin_album_svuota(uuid, boolean) to authenticated;


-- ============================================================
-- Controllo: gli album che ci sono adesso, con le foto dentro.
-- ============================================================
select a.nome as "album",
       (select count(*) from public.photos p where p.album_id = a.id) as "foto",
       case when a.visibile_dal is null then 'no' else 'sì' end as "pubblicato"
  from public.albums a
 order by a.created_at desc;
