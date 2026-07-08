-- ============================================================
-- FIX OPERATORI — il bottone Scanner non compariva ai collaboratori
-- Da incollare nel SQL Editor di Supabase e premere Run. Sicuro.
--
-- PERCHÉ: is_staff() controllava solo l'email della SESSIONE di
-- login (auth.jwt). Ma chi si iscrive dal sito ha una sessione
-- anonima: la sua email sta nel PROFILO, non nella sessione.
-- Quindi l'operatore risultava "anonimo" → niente Scanner.
--
-- FIX: is_staff() ora riconosce l'operatore anche dall'email del
-- suo profilo membro. È sicuro: ogni email vale un solo account
-- (fix email unica) e a iscrizioni chiuse nessuno può registrarsi
-- con l'email di un collaboratore.
-- ============================================================

create or replace function public.is_staff()
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select public.is_admin()
      or exists (
           select 1
             from public.operators o
            where o.email = lower(auth.jwt() ->> 'email')      -- login con email (magic link)
               or o.email in (                                  -- oppure: membro iscritto con quella email
                    select lower(p.email)
                      from public.profiles p
                     where p.id = auth.uid()
                       and p.email is not null
                  )
         );
$$;

grant execute on function public.is_staff() to authenticated;

-- ------------------------------------------------------------
-- DIAGNOSI: per ogni operatore abilitato dice se il sistema
-- lo può riconoscere. Se "iscritto_al_sito" è false, l'email
-- nel pannello non corrisponde a nessun membro → controlla
-- che sia scritta uguale a come si è iscritto lui.
-- ------------------------------------------------------------
select
  o.email,
  exists (select 1 from public.profiles p where lower(p.email) = o.email) as iscritto_al_sito,
  exists (select 1 from auth.users u where lower(u.email) = o.email)      as ha_login_con_email
from public.operators o
order by o.email;
