-- ============================================================
-- 47 — IL RIENTRO SCAVALCA I PROFILI CANCELLATI
--
-- 16 ottobre 2026. Ludovica (alias `ludo_rob`, PR approvata, 13
-- biglietti venduti) mette mail e codice e il sito le dice che non
-- risulta iscritta.
--
-- COSA SUCCEDEVA. Sul suo accesso con la mail c'era già un profilo,
-- ma CANCELLATO (un doppione eliminato: la cancellazione non toglie la
-- riga, la svuota e le mette `deleted_at`). `link_email_account()`
-- trovava il profilo vero dalla mail e provava a spostarlo su quel
-- posto — occupato dal morto. Postgres rifiuta (chiave doppia), la
-- funzione va in errore e il sito lo legge come "non ti conosco".
-- Da quando c'è "elimina" nella scheda di una persona (46, 15 ott)
-- può succedere a chiunque abbia avuto un doppione.
--
-- COSA CAMBIA. Se sul posto c'è un profilo cancellato, i due si
-- scambiano: quello vero va sull'accesso con la mail, il morto finisce
-- sull'accesso vecchio (lo scambio passa da un accesso di passaggio,
-- creato e tolto dentro la stessa chiamata). Non si cancella niente.
-- Tutto il resto è identico al 24.
--
-- È lo stesso scambio fatto a mano su Ludovica il 16 ott (riuscito).
-- Da incollare nel SQL Editor. Si può rieseguire.
-- ============================================================

create or replace function public.link_email_account()
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_email text;
  v_id    uuid;
  v_tmp   uuid;
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

  -- Sul posto c'è un profilo cancellato (uno vivo l'avremmo visto
  -- sopra): si scambiano, passando da un accesso di passaggio.
  if exists (select 1 from public.profiles p where p.id = auth.uid()) then
    v_tmp := gen_random_uuid();
    insert into auth.users (id, instance_id, aud, role, is_anonymous, created_at, updated_at)
    values (v_tmp, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
            true, now(), now());
    update public.profiles set id = v_tmp      where id = auth.uid();  -- il morto si sposta
    update public.profiles set id = auth.uid() where id = v_id;        -- il vero sulla mail
    update public.profiles set id = v_id       where id = v_tmp;       -- il morto sul vecchio
    delete from auth.users where id = v_tmp;
    return true;
  end if;

  update public.profiles set id = auth.uid() where id = v_id;
  return true;
end;
$$;

revoke execute on function public.link_email_account() from public, anon;
grant execute on function public.link_email_account() to authenticated;


-- ============================================================
-- Controllo: chi oggi è bloccato come Ludovica
-- ============================================================
-- Entrati con la mail, con un profilo cancellato sul loro accesso e
-- quello vero altrove. Con lo script dentro si sbloccano da soli al
-- prossimo accesso: basta che riaprano il sito.
select p.alias as profilo_vero, au.email as mail,
       to_char(au.last_sign_in_at, 'DD/MM HH24:MI') as ultimo_tentativo,
       'si sblocca al prossimo accesso' as esito
  from auth.users au
  join public.profiles morto on morto.id = au.id and morto.deleted_at is not null
  join public.profiles p
    on lower(trim(p.email)) = lower(trim(au.email))
   and p.deleted_at is null and p.id <> au.id
 where coalesce(au.email, '') <> ''
union all
select '— controllo finito —', '', '', '47 dentro'
order by 1;
