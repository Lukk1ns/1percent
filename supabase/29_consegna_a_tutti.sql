-- ============================================================
-- 29 — CONSEGNA A TUTTI, E LE SERATE SI VEDONO COMUNQUE
--
-- 24 settembre 2026, dai PR: *"non c'è il pulsante dove vendere le
-- prevendite"*. Non era un pulsante mancante: era che **solo uno di
-- loro aveva blocchetti in mano**, e `pr_eventi` mostrava soltanto le
-- serate in cui il PR ha dei movimenti. Chi era a zero apriva l'area e
-- trovava il vuoto — nessuna serata, quindi niente da aprire e niente
-- da vendere. Da fuori sembra un sito rotto.
--
-- Due cose, quindi:
--
-- 1. **Le serate future si vedono sempre.** Anche con zero blocchetti:
--    il PR vede che la serata esiste e che non ha niente in mano, e sa
--    cosa chiedere. Le serate passate restano visibili solo a chi ci ha
--    lavorato, se no si riempirebbe di roba vecchia.
--
-- 2. **`admin_pr_consegna_tutti`**: dà N blocchetti a tutti i PR in un
--    colpo, con l'opzione di darli **solo a chi è a zero** — che è il
--    caso di stasera. È l'opposto di `admin_pr_ritira_tutti` (26) e
--    scrive nel registro allo stesso modo, una riga per ognuno.
--
-- Da incollare nel SQL Editor. Si può rieseguire.
-- ============================================================


-- ------------------------------------------------------------
-- Le serate del PR
-- ------------------------------------------------------------
-- Stessa forma di prima (il sito non cambia), cambia solo chi entra
-- nell'elenco. Ogni colonna è scritta `tabella.colonna`: dentro una
-- funzione che dichiara `event_id` e `pr_id` fra i suoi ritorni, un
-- nome nudo è ambiguo — già pagato due volte in questo progetto.
create or replace function public.pr_eventi()
returns table (
  event_id    uuid,
  nome        text,
  slug        text,
  locale      text,
  starts_at   timestamptz,
  cover_key   text,
  assegnate   int,
  vendute     int,
  residue     int
)
language plpgsql
security definer
set search_path = public
stable
as $$
#variable_conflict use_column
begin
  if not public.is_pr() then
    raise exception 'Non autorizzato';
  end if;
  if not exists (select 1 from public.prevendite_config c where c.id = 1 and c.aperta)
     and not public.is_admin() then
    raise exception 'Prevendite non ancora aperte';
  end if;

  return query
    select e.id, e.name, e.slug, v.name, e.starts_at, e.cover_key,
           coalesce(a.tot, 0)::int,
           coalesce(p.tot, 0)::int,
           (coalesce(a.tot, 0) - coalesce(p.tot, 0))::int
    from public.events e
    left join public.venues v on v.id = e.venue_id
    left join lateral (
      select sum(al.delta)::int as tot
      from public.pr_allocations al
      where al.event_id = e.id and al.pr_id = auth.uid()
    ) a on true
    left join lateral (
      select count(*)::int as tot
      from public.presales ps
      where ps.event_id = e.id and ps.pr_id = auth.uid()
        and ps.stato <> 'annullata'
    ) p on true
    -- le serate che devono ancora succedere si vedono sempre;
    -- quelle finite solo se ci ha lavorato
    where e.starts_at > now() or a.tot is not null
    order by e.starts_at;
end;
$$;

grant execute on function public.pr_eventi() to authenticated;


-- ------------------------------------------------------------
-- Consegna a tutti in un colpo
-- ------------------------------------------------------------
-- `p_solo_a_zero` = true dà i blocchetti soltanto a chi non ne ha
-- nessuno per quella serata: è il modo di far partire una squadra
-- senza raddoppiare a chi ne ha già.
-- Torna una riga per PR servito, così il pannello dice chi e quanto.
create or replace function public.admin_pr_consegna_tutti(
  p_event       uuid,
  p_quante      int,
  p_solo_a_zero boolean default true
)
returns table (pr_id uuid, alias text, consegnate int)
language plpgsql
security definer
set search_path = public
as $$
#variable_conflict use_column
declare
  r     record;
  v_chi text := (auth.jwt() ->> 'email');
begin
  if not public.is_admin() then
    raise exception 'Non autorizzato';
  end if;
  if p_quante is null or p_quante <= 0 then
    raise exception 'Quante gliene dai? Serve un numero maggiore di zero';
  end if;

  for r in
    select pf.id    as id_pr,
           pf.alias as alias_pr,
           coalesce((select sum(al.delta)::int from public.pr_allocations al
                     where al.event_id = p_event and al.pr_id = pf.id), 0) as gia_date
      from public.profiles pf
     where pf.role = 'crew'
       and pf.deleted_at is null
     order by pf.alias
  loop
    if (not p_solo_a_zero) or r.gia_date = 0 then
      insert into public.pr_allocations (event_id, pr_id, delta, nota, created_by)
      values (p_event, r.id_pr, p_quante, 'consegna a tutti', v_chi);

      pr_id      := r.id_pr;
      alias      := r.alias_pr;
      consegnate := p_quante;
      return next;
    end if;
  end loop;
end;
$$;

revoke execute on function public.admin_pr_consegna_tutti(uuid, int, boolean) from public, anon;
grant execute on function public.admin_pr_consegna_tutti(uuid, int, boolean) to authenticated;


-- ============================================================
-- Controllo
-- ============================================================
-- Quanti PR ci sono e quanti hanno qualcosa in mano per la prossima
-- serata: se il secondo numero è basso, è il motivo per cui "non
-- vedono niente".
select
  (select count(*) from public.profiles p
    where p.role = 'crew' and p.deleted_at is null) as "PR approvati",
  (select count(distinct al.pr_id) from public.pr_allocations al
    where al.event_id = (select e.id from public.events e
                          where e.starts_at > now()
                          order by e.starts_at limit 1)) as "con blocchetti sulla prossima",
  coalesce((select e.name from public.events e
             where e.starts_at > now()
             order by e.starts_at limit 1), 'NESSUNA SERATA FUTURA') as "prossima serata";
