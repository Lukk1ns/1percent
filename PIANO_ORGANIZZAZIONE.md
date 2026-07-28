# 1% — Piano di migrazione: da serata a organizzazione

> Ramo di lavoro: `organizzazione` · `main` resta online e intatto
> Documenti di riferimento: `1percent-progetto-completo.md`, `1percent-prompt-claude-code.md`
> Redatto: 28 luglio 2026

---

## 0. Decisioni già prese (28 lug)

| Tema | Decisione |
|---|---|
| Blocco social (Volti, Poke, Legami, Messaggi) | **Resta acceso.** Solo il Mosaico è congelato in `app/_congelati/` |
| Chi può scriversi | Tutti con tutti, come a luglio: richiesta + accettazione, blocco e segnalazione |
| Ingresso nello staff | **Candidatura all'iscrizione**, approvata a mano dall'admin. Niente codici invito |
| Storage foto | **Cloudflare R2** (banda in uscita gratis) |
| Utenti esistenti (117) | **Cancellati** — si riparte da zero, numeri membro da #1 |
| Codice | Stesso repo, ramo `organizzazione`, merge su `main` solo al tuo ok |

---

## 1. Cosa si riusa, cosa si rifà, cosa si congela

### Si riusa così com'è
- Design system completo (`globals.css`, `Backdrop`, `Marquee`, bottoni ad angolo tagliato)
- Auth Supabase (anonima + magic link) e `app/auth/callback/route.ts` — incluso il fix admin-first
- `is_admin()` / `is_staff()` / tabella `operators` → diventano i tre ruoli del nuovo sistema
- Scanner QR (`html5-qrcode`, camera posteriore forzata, QR nero-su-bianco) — cuore dello Stand
- Sistema regali/estrazione istantanea → diventa il "premio istantaneo allo stand"
- Pipeline immagini con `sharp` (già collaudata: EXIF strip, resize, webp)
- Dominio, DNS, SMTP Gmail, Vercel Analytics, privacy GDPR

### Si rifà
| Cosa | Perché |
|---|---|
| `passes` (pass con status globale) | Serve QR **statico** sul profilo + presenze per evento |
| `lib/event.ts` (evento hardcoded) | Diventano tabelle `venues` / `events` |
| Homepage | Da landing-di-una-serata a hub multi-evento |
| `/admin/dashboard` | Da lista membri a vero pannello di gestione |
| Ogni testo che dice "mercoledì" o "la serata" | Il capitolo è chiuso |

### Si tiene acceso
Il blocco social costruito a luglio resta in funzione e convive col nuovo sistema:
`/membri` (il Muro) · `/profilo` (foto sfocata + bio) · `/u/[alias]` · `/legami` · `/messaggi`.

Sono un sistema solo, non pezzi separati: la foto è sfocata per tutti e diventa nitida
solo quando scatta un Legame (poke reciproco); il Muro è la rubrica da cui si trova
qualcuno per scrivergli; tra Legami la chat si apre subito, altrimenti serve richiesta
e accettazione. Blocco e segnalazione restano attivi.

Congelato solo `/mosaico`, in `app/_congelati/`: era un pezzo artistico legato alla
vecchia serata e dopo il reset ripartirebbe vuoto.

---

## 2. Nuovo schema database

Tutto in `supabase/organizzazione.sql`. RLS attiva ovunque; **nessuna scrittura diretta dal
client**: tutto passa da funzioni server con controllo di ruolo.

### 2.0 Come si entra nello staff

Una sola porta d'ingresso per tutti: `/unisciti`. Chi vuole entrare nello staff spunta
**"Voglio entrare nello staff"**, lascia il nome vero e risponde a 4 domande in più.

Si iscrive comunque come pubblico, con la candidatura **in attesa**. Nessuno diventa crew
da solo: dal pannello leggi le risposte e decidi. Chi approvi diventa crew; a chi ti
interessa scrivi tu. Chi rifiuti resta pubblico e non riceve nessuna notifica.

Le 4 domande della candidatura:

1. Cosa porti all'1%? → gente · musica · la mia bellissima presenza · TUTTO
2. Se inviti qualcuno alla festa, quanti si muovono davvero solo grazie a te? → sotto 10 · 10-30 · 30-100 · oltre 100
3. Quando una serata è riuscita davvero? → 4 risposte + testo libero facoltativo
4. Cosa non funziona nelle serate qui in zona? → solo testo libero

### 2.1 Identità e ruoli

```
profiles
  id              uuid  PK → auth.users
  member_number   serial unique          -- #0042, riparte da 1
  alias           text unique
  nome            text                   -- nome vero, serve allo stand
  email           text unique (lower)
  phone           text
  gender          text
  role                text  'public' | 'crew'   -- admin resta nella tabella admins
  qr_token            text unique         -- QR PERSONALE STATICO, mai cambia
  referral_code       text unique         -- link invito personale
  referred_by         uuid → profiles     -- attribuzione permanente
  crew_request_status text                -- nessuna | in_attesa | approvata | rifiutata
  crew_request_at     timestamptz
  crew_answers        jsonb               -- le 4 risposte della candidatura
  crew_since          timestamptz
  crew_decided_at, crew_decided_by        -- chi ha deciso e quando
  consent_privacy_at, created_at, deleted_at

admins              (esistente) email degli amministratori
operators           (esistente) email di chi può solo scansionare
```

`role` è una colonna sola perché crew e pubblico condividono tutto (profilo, QR, XP);
cambiano solo il menu XP e la classifica. Fasi 2-3 aggiungeranno `level` e `badges` qui
senza toccare altro.

### 2.2 Locali ed eventi

```
venues    id, name, slug, city, address, created_at
events    id, venue_id, name, slug, starts_at, ends_at, descrizione,
          cover_key, status 'draft'|'published', created_at
```

"MALDITA by 1%": `events.name` = MALDITA, la firma 1% è nel layout, non nel dato.

### 2.3 Presenze

```
event_checkins
  id, event_id, profile_id, scanned_by, scanned_at
  client_scan_id  uuid UNIQUE     -- generato dal telefono: rende il replay innocuo
  UNIQUE (event_id, profile_id)   -- una presenza sola per evento
```

Le due chiavi uniche sono la difesa contro il doppio accredito della coda offline.

### 2.4 Punti — due valute, una sola verità

```
seasons              id, name, starts_at, ends_at        -- trimestri
point_rules          code PK, label, xp, scope 'crew'|'public'|'both',
                     weekly_cap, active                  -- TUTTO editabile da admin
point_transactions
  id, profile_id, rule_code, xp, event_id, note,
  counts_season boolean default true,   -- false per i riscatti premi
  created_by, created_at,
  client_scan_id uuid UNIQUE            -- idempotenza scan offline
```

- **XP Wallet** = somma di tutte le transazioni del profilo
- **Punti Stagione** = somma delle transazioni con `counts_season = true` dentro le date della stagione

Un solo dato, due letture: non possono divergere. Il reset stagionale non cancella niente,
cambia solo la finestra. Riscattare un premio scrive una transazione negativa che **non**
tocca la classifica.

Regole iniziali caricate dal seed (poi le tari dal pannello):

| code | chi | xp |
|---|---|---|
| `crew_ingresso_portato` | crew | 80 |
| `crew_primo_ingresso` | crew | +40 |
| `crew_tavolo` | crew | 300-800 (a mano) |
| `crew_serata_lavorata` | crew | 50 |
| `crew_contenuto` | crew | 30 (tetto settimanale) |
| `crew_streak` | crew | moltiplicatore ×1,3 |
| `pub_presenza` | pubblico | 200 |
| `pub_voto` | pubblico | 20 |
| `pub_contenuto` | pubblico | 50 |
| `pub_amico_entrato` | pubblico | 150 |

Lo streak è una transazione bonus separata, così nello storico si legge da dove arriva.
Nessun punto negativo, mai — solo i riscatti.

### 2.5 Premi

```
reward_types        code, label, cost_xp, stock, active   -- 1000 XP = 1 consumazione, editabile
reward_redemptions  id, profile_id, reward_code, cost_xp,
                    redeemed_at, delivered_at, delivered_by
```

Separato dal sistema estrazione istantanea, che resta com'è.

### 2.6 Galleria

```
albums   id, event_id, name,
         preview_at    -- da qui la vedono gli iscritti
         published_at  -- da qui la vede chiunque (= preview_at + 24h)
         cover_photo_id, created_at

photos   id, album_id, key_thumb, key_medium, key_hd,
         width, height, blurhash, sort, created_at, removed_at

photo_removal_requests
         id, photo_id, requester_profile_id, email, motivo,
         status 'aperta'|'rimossa'|'respinta', created_at, handled_at
```

Tre formati generati all'upload: **thumb 400px webp** (griglia), **medium 1200px webp**
(lightbox), **HD originale** (scaricabile solo con account). La griglia carica solo i thumb:
una serata da 500 foto pesa pochi MB, non gigabyte.

### 2.7 Sondaggi, materiali, log

```
polls           id, event_id, domanda, opens_at, closes_at, xp_award, active
poll_options    id, poll_id, label, sort
poll_votes      poll_id + profile_id PK, option_id, created_at   -- un voto per utente

materials       id, event_id, name, key, kind        -- locandine per la crew
referral_clicks id, referral_code, created_at, ua_hash   -- click sul link personale
admin_log       id, actor_email, action, target, payload, created_at
```

---

## 3. Storage foto — come funziona davvero

Bucket R2 **privato**. Il sito non espone mai un URL diretto: le immagini passano da URL
firmati generati dal server, con scadenza arrotondata all'ora — così restano stabili abbastanza
da essere messi in cache dalla CDN, ma non condivisibili all'infinito.

Il controllo dei 24h sta nel server, non nel flag:
- prima di `preview_at` → solo admin
- tra `preview_at` e `published_at` → solo utenti registrati
- dopo `published_at` → chiunque
- HD → solo utenti registrati, in qualsiasi fase

Costo stimato R2: primi 10 GB gratis, poi ~0,015 $/GB al mese. **Banda in uscita: zero.**
Diecimila foto costano meno di un caffè al mese.

**Serve da te:** account Cloudflare → R2 → crea bucket `1percent-foto` → API token
(Account ID, Access Key, Secret). Te lo scrivo passo passo quando arriviamo lì.

---

## 4. Schermate

### Pubblico
| Rotta | Cosa fa |
|---|---|
| `/` | Hub: prossimo evento, ultimi album, contatore crew, CTA |
| `/eventi` | Calendario di tutti gli eventi, in programma e passati |
| `/eventi/[slug]` | Scheda evento: locale, data, descrizione, album |
| `/foto` | Tutti gli album |
| `/foto/[album]` | Griglia veloce + lightbox + download HD + segnala foto |
| `/unisciti?ref=CODICE` | Registrazione attribuita al membro crew |
| `/profilo` | Numero membro, QR statico, XP wallet, punti stagione, storico eventi |
| `/premi` | Cosa puoi ritirare e a quanto sei |
| `/sondaggi` | Vota, risultati in tempo reale |
| `/privacy` | GDPR, cancellazione, rimozione foto |

### Crew
| Rotta | Cosa fa |
|---|---|
| `/crew` | Dashboard: XP, posizione, persone portate, storico |
| `/crew/classifica` | Classifica interna con reset stagionale |
| `/crew/invita` | Link personale + click / iscritti / **entrati davvero** |
| `/crew/materiali` | Locandine e contenuti da scaricare |

### Stand (staff)
| Rotta | Cosa fa |
|---|---|
| `/stand` | Scegli evento → scansiona → nome, livello, punti → conferma → accredita |
| `/stand/nuovo` | Registrazione lampo, 3 campi, meno di 30 secondi |

Schermo nero, testo enorme, un solo pulsante per volta, tutto usabile con una mano al buio.
Indicatore di coda offline sempre visibile: "3 scan in attesa di sincronizzazione".

### Admin
`/admin` · `/admin/locali` · `/admin/eventi` · `/admin/album` (upload massivo drag&drop) ·
`/admin/utenti` · `/admin/crew` (candidature staff) · `/admin/punti` (regole + assegnazione manuale + log) ·
`/admin/premi` · `/admin/sondaggi` · `/admin/segnalazioni` (rimozione foto) · `/admin/export`

---

## 5. Coda offline — come non accreditare due volte

1. Il telefono genera un `client_scan_id` (UUID) **nel momento dello scan**, prima di provare a inviare
2. Lo scan finisce subito in una coda locale (IndexedDB) e la schermata risponde all'istante
3. Un worker prova a inviare; se non c'è rete, riprova da solo quando torna
4. Il server ha un vincolo unico su `client_scan_id`: il secondo invio dello stesso scan viene
   riconosciuto e ignorato, restituendo l'esito del primo

Risultato: il tablet può perdere il campo, ricaricare la pagina o essere spento — nessuno prende
punti doppi e nessuno resta senza.

---

## 6. Ordine di lavorazione

Ogni step si prova prima di passare al successivo.

| # | Step | Cosa vedi alla fine |
|---|---|---|
| 1 | Pulizia + fondamenta: azzeramento dati, ruoli, QR statico, congelamento social | Sito ripulito, database nuovo |
| 2 | Multi-evento + calendario | Crei locali ed eventi dal pannello, li vedi online |
| 3 | **Galleria foto** (R2, upload massivo, anteprima 24h, rimozione) | Carichi 300 foto e le sfogli dal telefono |
| 4 | Profilo + QR + Stand con coda offline | Scansioni un QR e registri una presenza |
| 5 | Link invito + attribuzione + statistiche | Un PR vede quanti ne ha portati davvero |
| 6 | Sistema punti (regole, transazioni, due valute, premi) | I punti si accreditano allo scan |
| 7 | Area crew + classifiche + Missione 150 | La crew vede la sua classifica |
| 8 | Sondaggi | Voti e vedi i risultati salire |
| 9 | Pannello admin completo + export | Gestisci tutto senza chiamarmi |
| 10 | Manuale stand + istruzioni deploy | Formi i collaboratori in 10 minuti |

Consegnabile minimo per la serata di lancio: **step 1-6**. Il resto può arrivare dopo.

---

## 7. Azzeramento dati — procedura

Hai chiesto di ripartire da zero. È irreversibile, quindi si fa in quest'ordine:

1. **Export di backup** completo (CSV: profili, email, referral, presenze) salvato fuori dal
   database, in `~/Desktop/ClaudeLukkins/1percent/_backup_pre_reset/`. Se domani cambi idea,
   i 117 contatti sono ancora lì.
2. Cancellazione utenti auth + profili + pass + poke + legami + messaggi
3. Svuotamento bucket storage (`volti`, `volti-blur`) — via Storage API, mai da SQL
4. Reset della sequenza `member_number` a 1
5. Verifica: contatore a zero, nessun file orfano

**Nota GDPR:** cancellare è legittimo (diritto all'oblio, e i dati non servono più alla
finalità raccolta). Ma le email raccolte per il vecchio evento **non vanno riusate** per
mandare comunicazioni sul nuovo senza un nuovo consenso. Il backup è per te, non è una lista
di invio.

Serve un tuo "vai" esplicito prima di eseguire questo step.

---

## 8. Cose che restano aperte (non bloccano l'inizio)

- **Premi a estrazione**: il vostro cap. 12 dice "premi certi o di valore minimo". Il sistema
  attuale estrae a sorte con dentro una Amazon da 50 €. Va deciso se togliere i premi di valore
  dall'estrazione o darli come premio certo a soglia XP.
- **Locali e date**: servono i nomi dei locali e la data del lancio con Artie 5ive per
  popolare il calendario.
- **Valore consumazione** e soglia definitiva: da tarare dopo le due serate di prova, come da
  cap. 11. Il pannello permette di cambiarlo senza toccare il codice.
- **Fotografo**: gli serve un accesso solo-upload? Se sì è un quarto ruolo, banale da aggiungere.
