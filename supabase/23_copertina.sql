-- ============================================================
-- 23 — LA COPERTINA DELL'ALBUM SI SCEGLIE
--
-- Chiesto da Luka il 23 settembre 2026, dopo il primo caricamento
-- vero: "vorrei poter selezionare quale foto mettere come copertina,
-- adesso le ho caricate ormai e non so come cambiarla".
--
-- Finora la copertina era la PRIMA foto arrivata e basta (17_galleria,
-- dentro admin_foto_aggiungi): con 119 foto spedite quattro alla
-- volta, quale fosse la prima è quasi un sorteggio.
--
-- Qui dentro tre cose:
--   · admin_album_copertina  → la scelgo io, quando voglio
--   · admin_album_foto       → dice anche QUALE foto è la copertina,
--                              se no il pannello non può mostrarlo
--   · admin_foto_togli       → se tolgo la foto che era in copertina,
--                              ne prende un'altra invece di lasciare
--                              l'album senza faccia
--
-- Da incollare nel SQL Editor. Si può rieseguire.
-- ============================================================


-- ------------------------------------------------------------
-- Scegliere la copertina
-- ------------------------------------------------------------
-- La foto deve stare in QUESTO album ed essere ancora al suo posto:
-- così non si finisce con la copertina di un'altra serata o con una
-- foto tolta su richiesta di chi ci stava dentro.
create or replace function public.admin_album_copertina(p_album uuid, p_foto uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare v_ok boolean;
begin
  if not public.is_admin() then
    raise exception 'Non autorizzato';
  end if;

  select exists (
    select 1 from public.photos p
     where p.id = p_foto
       and p.album_id = p_album
       and p.removed_at is null
  ) into v_ok;

  if not v_ok then
    raise exception 'Questa foto non è in questo album';
  end if;

  update public.albums a
     set cover_photo = p_foto
   where a.id = p_album;

  return p_foto;
end;
$$;

revoke execute on function public.admin_album_copertina(uuid, uuid) from public, anon;
grant execute on function public.admin_album_copertina(uuid, uuid) to authenticated;


-- ------------------------------------------------------------
-- Le foto di un album, con la copertina segnata
-- ------------------------------------------------------------
-- Cambia la forma di quello che torna (una colonna in più), e Postgres
-- non lascia cambiare la forma a una funzione che esiste già: prima si
-- butta, poi si rifà. Il resto è identico a 17_galleria.
drop function if exists public.admin_album_foto(text);

create or replace function public.admin_album_foto(p_slug text)
returns table (
  id         uuid,
  thumb      text,
  width      int,
  height     int,
  rimozioni  int,
  copertina  boolean
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
    select p.id, p.key_thumb, p.width, p.height,
           (select count(*) from public.photo_removal_requests r
             where r.photo_id = p.id and r.stato = 'aperta')::int,
           (a.cover_photo = p.id) as copertina
    from public.photos p
    join public.albums a on a.id = p.album_id
    where a.slug = p_slug and p.removed_at is null
    order by p.sort, p.created_at;
end;
$$;

grant execute on function public.admin_album_foto(text) to authenticated;


-- ------------------------------------------------------------
-- Togliere una foto senza lasciare l'album senza copertina
-- ------------------------------------------------------------
-- Uguale a prima, con in fondo una riga: se quella tolta era la
-- copertina, il posto lo prende la prima rimasta.
create or replace function public.admin_foto_togli(p_id uuid, p_motivo text)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare v_album uuid;
begin
  if not public.is_admin() then
    raise exception 'Non autorizzato';
  end if;

  select p.album_id into v_album from public.photos p where p.id = p_id;

  update public.photos p
     set removed_at = now(), removed_why = nullif(trim(p_motivo), '')
   where p.id = p_id;

  update public.photo_removal_requests r
     set stato = 'rimossa', handled_at = now(), handled_by = (auth.jwt() ->> 'email')
   where r.photo_id = p_id and r.stato = 'aperta';

  update public.albums a
     set cover_photo = (
           select p.id from public.photos p
            where p.album_id = v_album and p.removed_at is null
            order by p.sort, p.created_at
            limit 1
         )
   where a.id = v_album and a.cover_photo = p_id;

  return 'ok';
end;
$$;

grant execute on function public.admin_foto_togli(uuid, text) to authenticated;


-- ============================================================
-- Controllo
-- ============================================================
select a.nome,
       (select count(*) from public.photos p
         where p.album_id = a.id and p.removed_at is null) as "foto",
       case when a.cover_photo is null then 'nessuna' else 'scelta' end as "copertina"
  from public.albums a
 order by coalesce(a.data_serata, a.created_at::date) desc;
