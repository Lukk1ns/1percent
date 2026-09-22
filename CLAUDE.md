# Progetto "1%" — Portale dell'organizzazione

> Ultimo aggiornamento: 22 settembre 2026

## ⚠️ Leggi prima di tutto

**PREVENDITE / PR — Fase 1 costruita (22 settembre 2026).** Il modulo che sostituisce Evently.
Piano completo in `~/Desktop/ClaudeLukkins/PROPOSTE/proposta_prevendite_pr.md`.
Decisioni di Luka del 22 set: **niente import dei PR da Evently** — i PR sono la crew già
approvata su questo sito (`profiles.role = 'crew'`), nessun ruolo nuovo; **tavoli, omaggi e
delega under 16 rimandati**; l'area resta **invisibile finché non è provata**.
L'interruttore è nel database (`prevendite_config.aperta`, parte a **false**): con l'area chiusa
`/pr` la apre **solo l'admin**, i PR sbattono sulla porta. Nessun link al modulo esiste nel sito
pubblico, e `/pr` e `/biglietto` sono `noindex`.
Rotte: **`/pr`** (le sue serate) · **`/pr/<event_id>`** (contatori, nuovo nominativo, invio
WhatsApp, lista clienti) · **`/biglietto/<token>`** (pagina pubblica del cliente, si aggiorna da
sola ogni 20s) · **`/admin/pr`** (interruttore, blocchetti, incassi, fasce di prezzo, biglietti).
La regola che regge tutto: il biglietto nasce **in attesa** e diventa valido **solo quando Luka
segna che i contanti sono arrivati** (`admin_pr_incassa` attiva i biglietti dal più vecchio finché
l'importo li copre); in porta c'è "attiva al volo" per chi salda a serata iniziata.
Prezzo e fascia vengono **copiati dentro il biglietto** alla vendita: cambiare i prezzi dopo non
tocca quelli già fatti. **PENDING Luka: incollare `supabase/09_prevendite.sql`** — finché non lo
fa, `/pr` e `/admin/pr` dicono che il modulo non è installato e il resto del sito non cambia.
Restano da fare: **Fase 2** scanner porta offline (oggi `/admin/scan` non legge ancora i token
delle prevendite) e **Fase 3** tavoli, omaggi, stampe di fine serata.
Il biglietto mostra la locandina **sfocata** come sfondo: la nitida è riservata ai membri dalle
policy dello storage, servirebbe una route dedicata per darla a chi ha un token.

Il progetto è in **migrazione da serata a organizzazione**. Il piano completo, con
schema database, schermate e ordine di lavorazione, è in
[PIANO_ORGANIZZAZIONE.md](PIANO_ORGANIZZAZIONE.md). Leggilo prima di toccare qualsiasi cosa.

Lavoro sul ramo `organizzazione`. `main` è la vecchia versione, ancora online.

**Step 1 completato (28 lug):** ruoli crew/pubblico, candidatura staff all'iscrizione con
questionario dedicato e approvazione a mano, QR statico, tracciamento click referral,
registro azioni admin. Il blocco social (Muro, profilo, poke, Legami, messaggi) **resta
acceso**; congelato solo il Mosaico.

**FILIGRANA SULLA LOCANDINA (2 ago).** Fino allo svelamento dell'ospite solo i membri vedono
la locandina nitida, e devono tenere il segreto. Gli screenshot **non si possono bloccare** (sul
web non esiste, punto); si può risalire a chi li fa. `app/api/locandina/vista/route.tsx` scarica
la nitida **con la sessione di chi chiede** (quindi il permesso resta quello del deposito) e ci
fonde dentro alias + numero di tessera, inclinati di 30° e ripetuti su tutta l'immagine. Lo staff
senza profilo membro viene firmato con l'email. `Locandina.tsx` punta lì invece che all'URL
firmato; niente cache condivisa, ogni copia è personale.
**⚠️ GOTCHA COSTATO UN'ORA — non riscrivere la filigrana come SVG con dentro del `<text>`:** il
motore SVG dentro sharp cerca i font nel **sistema**, e sui server di Vercel non c'è installato
**nessun font**. Il testo non viene disegnato e **non arriva nessun errore**: l'immagine esce
identica all'originale. Verificato facendo disegnare la stessa funzione in locale (scriveva) e in
produzione (foglio bianco). La scritta la compone **`next/og`**, che il font se lo porta dietro
(Geist) e non chiede niente al sistema; poi sharp inclina il riquadro e lo ripete con `tile: true`.
Due copie sovrapposte, una scura e una chiara, perché la locandina ha zone nere **e** una fascia
bianca. Vale per qualunque immagine con testo generata dal server, non solo per questa.

**DA FARE DOPO IL 5 SETTEMBRE — link d'invito monouso.** Deciso con Luka il 2 ago, **non
costruito**: oggi resta il blocco attuale. Quando si farà: un codice per persona, si brucia al
primo uso, controllo **nel database** (non nel browser come `SOLO_SU_INVITO`, che è aggirabile);
li genera **la crew approvata**, non solo l'admin; il `?ref=` **resta** accanto agli inviti perché
è quello che dice chi ha portato chi (tessera crew e statistiche). Serve una tabella `invites` +
il controllo dentro `join_public`, quindi uno script da incollare.

**CANDIDATURE E SEGNO DELLA CREW (2 ago).** Tre correzioni volute da Luka.
1. **Chi si candida fa solo le sue 6 domande.** Prima faceva 4 (pubblico) + 6 (crew) = 10, ed
   erano troppe: ora `/unisciti` manda dritto a `/candidatura` chi sceglie "Voglio collaborare",
   e `/domande` (le 4 del pubblico) resta solo per i clienti. Conseguenza voluta: chi si candida
   **non ha archetipo**, perché l'archetipo nasce dal quiz del pubblico.
2. **L'approvazione si annuncia.** `components/StatoCrew.tsx`, montato nel layout: la prima volta
   che un approvato riapre il sito gli esce a tutto schermo "SEI DELLA CREW" con il bottone per la
   tessera. Il "già visto" sta in `localStorage` (chiave `crew_approvazione_vista` = id utente),
   non nel database: se cambia telefono lo rivede una volta, ed è meglio che non vederlo mai.
   Chi è stato **rifiutato non vede niente**, per scelta di Luka. Su `/card` chi è ancora
   `in_attesa` trova la striscia "candidatura in attesa", così lo sa anche giorni dopo.
3. **Il segno `(1%)` accanto al nome** (`components/SegnoCrew.tsx`). **L'alias nel database NON
   viene toccato**: resta unico ed è ancora l'indirizzo di `/u/<alias>`; il segno lo disegna il
   sito. Si vede su `/card` (anche nel PNG salvato, e in alto a sinistra c'è "Crew" invece di
   "Membro") **senza bisogno di SQL**; per vederlo **sul Muro e sulla pagina di un membro** serve
   **`supabase/07_crew_visibile.sql`** — aggiunge `role` a `members_wall()` e `public_profile()`
   (le due funzioni cambiano forma, quindi lo script le elimina e le ricrea identiche più una
   colonna). **PENDING Luka: incollarlo.** Finché non lo fa, sul Muro il segno semplicemente non
   compare: non si rompe niente.

**LA HOME NON CHIEDE PIÙ L'ISCRIZIONE A CHI È GIÀ DENTRO (2 ago).** Segnalato da Luka: loggato,
vedeva la locandina nitida e accanto "Iscriviti". Due cause, tutte e due sistemate in
`app/page.tsx`: (a) finché il controllo del profilo non era finito (`sonoMembro === null`) la
pagina mostrava già il blocco da visitatore → ora aspetta; (b) **l'account admin non ha una riga
in `profiles`**, quindi risultava "fuori" → ora `am_i_staff` conta quanto il profilo (`haAccesso`),
e allo staff senza profilo membro la home mostra il **pannello** (scanner, eventi, candidature,
regali, dashboard) invece dei bottoni da membro che non potrebbe usare.

**LA HOME È LA PARETE LED (2 ago).** La grafica "LEDWALL" non è più un'anteprima: è
`app/page.tsx`, cioè quello che si vede su unpercento.it. `/nuovo` ora rimanda alla home
(vecchi preferiti e schede aperte non restano indietro). Fuori sono rimaste, su decisione di
Luka, la **sequenza d'ingresso** (`EntrySequence`) e la **bacheca dei post-it**
(`PostitBoard`/`PostForm`): i componenti sono ancora nel repo, non li chiama più nessuno.
La **locandina sfocata del prossimo evento sta subito sotto la parete**, con lucchetto e
bottone d'iscrizione: è la prima cosa che si incontra scorrendo, ed è il motivo per iscriversi.
Ritrovata anche la barra in alto a destra di chi è già dentro (alias, scanner dello staff, esci).
**Taratura per il telefono:** la parete era stata calibrata su schermo largo e sul cellulare
il "1%" si sbriciolava — il filmato è verticale, quindi su uno schermo stretto si vede quasi
tutta la scena e la folla arrivava a toccare le lettere. In `LedWall.tsx` sotto i 560px il LED
scende da 8 a 6 px, il marchio prende l'86% della larghezza invece del 70%, e la sala accende
i LED fuori dal marchio a 0.19 invece di 0.34 (variabile `ambiente`). Sopra i 560px non cambia
niente.

**Anteprima grafica "LEDWALL" (30 lug):** direzione scelta da Luka per il restyling. La firma
è `components/LedWall.tsx`: una parete di
LED su canvas, la luminosità di ogni LED viene da `public/media/sala.mp4` (spezzone del locale,
muto e in bianco e nero, 600 KB) campionato a un pixel per LED — la serata si intravede ma
nessuno è riconoscibile. Il marchio è acceso a potenza piena con la sala visibile dentro le
lettere; il dito accende un alone. Esposizione automatica per frame, così il "1%" resta il
più luminoso con qualunque fotogramma; si spegne fuori schermo, a scheda nascosta e con
"riduci movimento". Font tecnico nuovo: **JetBrains Mono** (`font-tech`) per numeri, orari ed
etichette. Classi `.led-*` in fondo a `globals.css`. Su quella pagina le aurore/glitch/griglia
dello sfondo globale restano coperte da un fondo pieno.

**Step 3 — LOCANDINE (30 lug):** ogni evento può avere la sua locandina, **formato storia
1080×1920**. Due depositi come per i volti: `locandine` (nitida, PRIVATO) e `locandine-blur`
(sfocata a 180px, pubblico). **La nitida la vedono solo i membri** (e lo staff): il controllo è
nelle policy dello storage, il browser non c'entra. Chi non è iscritto vede la sfocata con il
lucchetto e l'invito a iscriversi. Upload da `/admin/eventi` (slot "Locandina" su ogni evento)
→ `app/api/locandina/route.ts` (sharp, EXIF strippati, niente tagli: `fit: inside`). Si mostra
su `/eventi/[slug]` e in home. Componente: `components/Locandina.tsx`.
**PENDING Luka: incollare `supabase/04_locandine.sql`** — finché non lo fa, il caricamento
risponde errore. Deciso di NON usare Cloudflare R2 per le locandine (una immagine per evento,
banda irrilevante): R2 resta per la galleria foto delle serate, dove le immagini sono centinaia.

**Step 4 — TESSERA DELLA CREW (30 lug):** la card del PR ora ha una funzione. Nuova pagina
**`/tessera`** (solo `role='crew'`, gli altri rimbalzano su `/card`, e da `/card` c'è il bottone).
È una **costellazione generata dall'alias** (`components/Costellazione.tsx`, canvas, seme FNV-1a
+ mulberry32 → sigillo con lati/rotazione/segni suoi e mai uguali): una stella per ogni persona
portata, **accesa solo se quella persona ha fatto il check-in a una serata**; puntini spenti =
iscritti che non si sono presentati. Anelli = livello (10/30/100 portati: nebulosa/stella/
costellazione/galassia), tacche = serate fatte da lui, in alto l'edizione della serata, il retro
si gira ed è il **QR del suo link invito**. Sotto: posizione del mese fra la crew.
**Le PRESENZE sono nuove**: tabella `checkins` (profilo+evento, una sola per serata), RPC
`registra_presenza(token)` chiamata dallo scanner **in parallelo a `draw_prize`** (se manca lo
script il regalo funziona lo stesso), `evento_in_corso()` trova da sola la serata (da 5h prima
a 6h dopo la fine), `my_crew_card()` costruisce tutta la tessera in una chiamata, `admin_presenze()`
per il pannello. **PENDING Luka: incollare `supabase/05_carta_crew.sql`.** Punti del mese =
presenze della gente che ha portato + le sue presenze.

**Step 5 — LO STAND UNPERCENTO (30 lug):** chiarito il modello e scritto ovunque. Lo stand è il
banchetto **dentro il locale**, non la porta: all'ingresso si entra normalmente. Allo stand si fa
scansionare il QR → **estrazione + presenza in un solo scan**. Si gioca **una volta per serata**
(prima era una volta per sempre): `supabase/06_estrazione_per_evento.sql` lega `prize_draws` a
`event_id` (nuova PK `id` + unique (profile,event)), `draw_prize` v2 registra da sé anche il
checkin e ritorna `evento`/`senza_evento`/`ruolo`, `my_prize` mostra la giocata della serata in
corso (fuori serata l'ultima, con `passata:true`), `admin_reset_prize` annulla solo quella della
serata. **Anche i PR giocano**, ogni evento. Le frasi stanno in `lib/event.ts`
(`STAND_NAME`/`STAND_FRASE`/`STAND_NON_INGRESSO`), usate da `/pass`, `/regalo`, `/tessera`,
`/invita` e dalla banda "LO STAND" in home. **PENDING Luka: incollare `05_carta_crew.sql` e
`06_estrazione_per_evento.sql`** (in quest'ordine).
`/unisciti`: la scelta cliente / "voglio lavorarci" ora è **due riquadri grandi**, non più una
casellina. `/invita` rifatta per l'uso dal vivo: QR grande da far inquadrare, messaggio già
scritto che spiega lo stand, link da copiare, e in fondo **"cosa dirgli"** in tre passi.
Sistemati anche due difetti: la home nuova mostrava "Iscriviti" anche a chi era già dentro (ora
riconosce il membro e gli dà i suoi bottoni), e il lucchetto sulla locandina proponeva "iscriviti"
anche a chi era loggato (ora gli dice di ricaricare).

**Step 2 completato (28 lug):** locali ed eventi nel database, calendario pubblico, nuova
home. L'iscrizione pubblica non ha più domande: chi si iscrive entra dritto, le 4 domande
sono solo per chi si candida allo staff (`/candidatura`, che ha sostituito `/test`).
Tolto ogni riferimento al mercoledì e alla serata singola.

## Cos'è questo progetto

**1% non è più una serata: è il marchio dell'organizzazione** che fa eventi in più locali.
Ogni festa tiene il proprio nome e la propria identità, 1% è la firma sopra tutte
("MALDITA by 1%"). Il portale è l'hub di tutti gli eventi.

Il mercoledì al Papi on the Beach è un capitolo chiuso: non va più nominato da nessuna parte.

Due livelli di utenza:

- **Crew** (PR, DJ, staff, fotografi) — ci si candida all'iscrizione, entra solo chi viene
  approvato a mano dall'admin
- **Pubblico** — si registra tramite il link personale di un membro crew, e resta attribuito
  a quel membro per sempre

---

## Stack tecnico

| Cosa | Strumento |
|---|---|
| Frontend | Next.js 16 (App Router) + TypeScript + Tailwind CSS v4 |
| Database + Auth | Supabase (Postgres + Auth anonima + Realtime) |
| Deploy | Vercel (auto-deploy ad ogni git push) |
| QR generazione | libreria `qrcode` (lato client) |
| QR scan admin | `html5-qrcode` (fotocamera browser) |
| Salvataggio card | `html2canvas` → PNG condivisibile |

---

## Credenziali e URL importanti

- **Sito live**: https://1percent-xi.vercel.app
- **GitHub repo**: https://github.com/Lukk1ns/1percent.git
- **Supabase project**: https://qlzyyzqgcdnicesfbkhh.supabase.co
- **Cartella locale**: `~/Desktop/ClaudeLukkins/1percent`

Le chiavi Supabase sono in `.env.local` (non versionato su GitHub).

---

## Identità visiva (NON modificare)

- Colori: **rosso #E0181F** su **nero #0A0A0A**. Testi secondari: grigio #A3A3A3
- Font display (wordmark "1%"): **Anton** (Google Fonts)
- Font corpo: **Inter** (Google Fonts)
- Estetica: dark, misteriosa, premium. Grain noise overlay su tutto. Glitch animato sul logo.
- Tono di voce: secco, sicuro, arrogante. Frasi corte. Sfida ("ci sei o no?"), non vende.

---

## Concept evento

- **Nome**: 1% · **Payoff**: "not for everyone"
- **Idea**: esclusività di attitudine, non di soldi. Il 99% resta a casa, l'1% si presenta.
- **Target**: 18-25 anni, musica urban/latino/reggaeton, infrasettimanale estivo
- **Locale**: Papi on the Beach, Roveredo in Piano (PN) — società QFB SRL
- **Contatto/titolare dati**: papionthebeach22@gmail.com

---

## Flusso utente (Fase 1 — costruita)

```
Landing (/) → "Ci sei o no?" → /unisciti (alias + avatar + consenso)
→ /test (quiz 4 domande) → /benvenuto (reveal animato)
→ /card (card membro, salva come immagine) → /pass (QR ingresso)
→ /invita (link referral personale)
```

**Login utente esistente**: Landing → "Già dell'1%? Rientra →" → /login (magic link email) → /card

**Admin check-in all'ingresso**: /admin/login → /admin/scan (fotocamera QR scanner)

---

## Tutte le rotte

| Route | Descrizione |
|---|---|
| `/` | Home: parete LED, locandina sfocata del prossimo evento, stand, contatore |
| `/nuovo` | Vecchio indirizzo dell'anteprima: rimanda a `/` |
| `/unisciti?ref=CODE` | Registrazione in un passo solo: alias + avatar + email + privacy + **casella "voglio entrare nello staff"** (con nome vero). Chi non si candida entra subito, senza domande |
| `/candidatura` | Le 4 domande di chi si candida allo staff. Ha sostituito `/test` |
| `/eventi` | Calendario: in programma e già successe. I non svelati compaiono come `?????` |
| `/eventi/[slug]` | Scheda di un evento svelato: nome, locale, data, countdown, descrizione |
| `/benvenuto` | Reveal animato "Benvenuto nell'1%" |
| `/card` | Card membro digitale (screenshottabile, salvabile) |
| `/pass` | QR pass ingresso |
| `/invita` | Link referral personale + contatore inviti |
| `/membri` | Il Muro: volti sfocati di tutti i membri, classifica poke 👊, poke 1/giorno |
| `/profilo` | Il proprio profilo: upload foto (sfocata per gli altri), bio |
| `/u/[alias]` | Profilo pubblico di un membro (solo per membri) |
| `/legami` | Chi ti ha ricambiato il poke: foto nitide |
| `/messaggi` · `/messaggi/[id]` | Inbox e chat, con richiesta+accettazione, blocco e segnalazione |
| `/login` | Accesso per membri esistenti (magic link email) |
| `/privacy` | Privacy policy GDPR + cancellazione dati |
| `/admin/login` | Login staff |
| `/admin/dashboard` | Lista membri, modifica alias, elimina (solo admin) |
| `/admin/crew` | **Staff**: candidature in attesa con le risposte, approva/rifiuta, Missione 150, crew attuale |
| `/admin/eventi` | **Eventi e locali**: crea locali, crea eventi, decidi quando svelarli, pubblica |
| `/admin/regali` | Scorte premi, pesi, vincitori, operatori |
| `/admin/scan` | Scanner QR per validare ingressi |
| `/auth/callback` | Handler redirect magic link email |

### Come si entra nello staff

Una sola porta d'ingresso: `/unisciti`. Chi spunta **"Voglio entrare nello staff"** lascia
il nome vero e, dopo il quiz del pubblico, risponde a 4 domande in più (`CREW_QUESTIONS` in
`lib/quiz.ts`). Si iscrive comunque come **pubblico**, con `crew_request_status = 'in_attesa'`.
Nessuno diventa crew da solo: si approva a mano da `/admin/crew`. Chi viene rifiutato resta
pubblico e non riceve nessuna notifica — è Luka che scrive a chi gli interessa.

Il questionario è renderizzato dal componente condiviso `components/Questionario.tsx`, che
gestisce tre tipi di domanda: `choice` (solo opzioni), `hybrid` (tag obbligatorio + testo
libero) e `text` (solo testo libero, si può saltare).

### Rotte congelate

Solo `/mosaico`, in `app/_congelati/`. Next.js ignora le cartelle che iniziano con `_`:
il codice resta, la pagina non esiste online. Per riaccenderla basta rimettere la cartella
al suo posto.

---

## Database Supabase — tabelle

| Tabella | Cosa contiene |
|---|---|
| `profiles` | Ogni membro: alias, avatar, numero progressivo, email, referral_code, referred_by + **role** (`public`/`crew`), **nome** (vero, chiesto solo a chi si candida), **qr_token** (QR statico), **crew_request_status** (`nessuna`/`in_attesa`/`approvata`/`rifiutata`), crew_request_at, crew_answers, crew_since, crew_decided_at/by |
| `passes` | Pass d'ingresso. Il suo `qr_token` è **identico** a `profiles.qr_token`: allo step 4 lo scanner passa a leggere il profilo senza invalidare nessun QR già in giro |
| `pokes` | Poke 👊 tra membri, 1 al giorno per coppia. RLS: solo il ricevente legge i propri |
| `venues` | I locali in cui organizziamo: nome, città, indirizzo |
| `events` | Le feste: nome proprio, data, locale, `reveal_at` (fino a quando resta nascosta), `teaser`, `published` |
| `referral_clicks` | Un record per click su un link invito. Serve a distinguere "visto" da "iscritto" da "entrato" |
| `admin_log` | Registro di chi ha fatto cosa nel pannello |
| `admins` | Email degli amministratori |
| `operators` | Email di chi può solo scansionare (nessun accesso ai dati) |

### Ripartenza da zero

Un file solo: **`supabase/RESET.sql`**. Cancella tutti i dati (admin e operatori esclusi) e
subito dopo costruisce le fondamenta: ruoli, QR statico, candidature staff, click, log.
Prima di eseguirlo vanno svuotati a mano i bucket `volti` e `volti-blur` (Storage → ⋯ →
Empty bucket): i file non si cancellano da SQL, Supabase lo vieta.

`supabase/backup_prima_del_reset.sql` è opzionale: 4 query da eseguire una alla volta,
scaricando il CSV di ognuna, se si vogliono conservare i vecchi iscritti.

Poi **`supabase/03_eventi.sql`** per locali ed eventi.

### Il reveal degli eventi

`events.reveal_at` decide se una festa è già svelata. Finché quella data non è passata,
le funzioni pubbliche (`next_event`, `events_list`, `event_by_slug`) **non restituiscono
nome, locale, descrizione né slug**: esce solo la data e il teaser, e il sito mostra
`?????`. Il nome non arriva mai al browser, quindi non si può sbirciare dal codice della
pagina. `reveal_at` a null = già svelato. Il bottone "Svela adesso" nel pannello lo azzera.

### Identità del marchio

Sta tutta in `lib/event.ts`: `BRAND_CLAIM` è la riga sotto il wordmark in home
(oggi "Pordenone eventi"), `BRAND_AREA` la zona nel footer, `LEGAL_NAME` il titolare
privacy. Le singole feste non stanno qui: stanno nel database.

Gli script del social (`pokes.sql`, `volti.sql`, `legami.sql`, `messaggi.sql`, `volti_fix.sql`)
erano già stati eseguiti a luglio: il reset cancella le righe, non le tabelle. Se una pagina
social dà errore, ricontrolla che quel file sia stato incollato.

### Funzioni RPC nuove (step 1)

`my_profile()` · `crew_count()` · `my_referral_stats()` · `track_referral_click(code)` ·
`join_public(...)` · `admin_crew_requests()` · `admin_approve_crew(profile)` ·
`admin_reject_crew(profile)` · `admin_set_role(profile, role)` · `admin_crew_answers()`

`join_one_percent()` è sostituita da `join_public()`, che aggiunge `p_nome`,
`p_crew_request` e `p_crew_answers`. La vecchia viene eliminata dallo script.

**Storage** (SQL in `supabase/volti.sql`): bucket `volti` (foto nitide, PRIVATO) + `volti-blur` (foto sfocate generate dal server, PUBBLICO). Path sempre `<uuid>/volto.webp`. Il blur è fatto con sharp nell'API route `/api/volto` (mai CSS), EXIF strippati. Livello blur: `BLUR_SIGMA` in `lib/volto.ts`.

### Funzioni RPC (chiamate dal sito)
- `join_one_percent(...)` — crea profilo + pass in un colpo solo
- `member_count()` — numero totale membri (per il contatore live)
- `recent_members(limit)` — ultimi N alias+avatar (per il feed live)
- `referral_count()` — quante persone ha portato l'utente corrente
- `checkin(token)` — valida un QR all'ingresso (solo admin)
- `delete_my_profile()` — cancella i dati dell'utente (GDPR)
- `is_admin()` — controlla se chi chiama è nello staff
- `admin_members()` — tutti i membri (id, alias, avatar_id, member_number, created_at, email)
- `admin_delete_member(uuid)` — elimina un membro e il suo pass
- `admin_update_alias(uuid, text)` — modifica l'alias di un membro
- `send_poke(member_number)` — lascia un poke (ritorna ok/already/self/not_found/not_member)
- `members_wall()` — tutti i membri con conteggio poke + già-pokato-oggi (solo membri)
- `my_pokes_received(limit)` — chi mi ha pokato (solo il ricevente)
- `unseen_pokes_count()` / `mark_pokes_seen()` — badge notifiche poke
- `set_my_photo()` / `clear_my_photo()` — registra/rimuove la foto profilo (file inclusi)
- `update_my_bio(text)` — bio max 120 char
- `public_profile(alias)` — dati per /u/[alias] (solo membri, niente PII)
- `admin_remove_photo(uuid)` — staff rimuove una foto inappropriata
- `members_wall()` v2 — ora include photo_blur_path/photo_updated_at

---

## Come aggiornare il sito (deploy)

```bash
cd ~/Desktop/ClaudeLukkins/1percent
# ... modifica i file ...
git add -A
git commit -m "descrizione modifica"
git push
```
Vercel rideploya automaticamente in ~2 minuti.

---

## Come avviarlo in locale

```bash
cd ~/Desktop/ClaudeLukkins/1percent
npm run dev
# Apri http://localhost:3000
```

---

## Fase 2 — da costruire (quando sei pronto)

- Galleria foto/video della serata sul profilo
- Gamification: punti, badge, leaderboard
- Premi reali per i top (saltafila, drink, guest list)
- "Muro dei membri" — pagina esplorabile con tutti gli alias
- Badge "Founding Member" per chi si iscrive prima del 1 luglio
- Easter egg nascosti (digiti "1%" sulla tastiera → accesso segreto)

## Fase 3 — futuro (richiede moderazione)

- Messaggi privati tra membri
- Follow / profili pubblici
- Community con verifica età e segnalazioni

---

## Decisioni prese (non rimettere in discussione)

- Avatar: set curato di 12 emoji/simboli, NO upload foto (privacy/minori)
- Admin check-in: un solo account staff, scanner in-browser (no app nativa)
- Titolare dati GDPR: Papi on the Beach / QFB SRL
- Sessione: anonima Supabase con opzione email per persistenza cross-device
- Nessun messaggio privato in Fase 1 (sicurezza minori)

---

## Fase A social "I Volti" (6 luglio 2026) — SUPERA due decisioni Fase 1

Progetto completo in `~/Desktop/ClaudeLukkins/PROPOSTE/proposta_social_1percent.md`.
Foto profilo OPZIONALE e sfocata (consenso esplicito + autodichiarazione 16+ al caricamento).
La foto nitida non lascia mai il server verso terzi: bucket privato + URL firmati (solo proprietario; in Fase B i "Legami" da poke reciproco).
⚠️ Dopo il deploy serve incollare `supabase/volti.sql` nel SQL Editor (colonne profiles: photo_blur_path, photo_updated_at, photo_consent_at, bio). Finché non è fatto: /profilo rimbalza a /unisciti (colonne mancanti), /u/[alias] dà "Nessuno qui", il muro resta a emoji.
Prossime fasi: B = Legami (reveal foto con poke reciproco), C = messaggi richiesta+accetta.
