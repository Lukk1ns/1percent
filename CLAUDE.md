# Progetto "1%" — Portale dell'organizzazione

> Ultimo aggiornamento: 28 luglio 2026

## ⚠️ Leggi prima di tutto

Il progetto è in **migrazione da serata a organizzazione**. Il piano completo, con
schema database, schermate e ordine di lavorazione, è in
[PIANO_ORGANIZZAZIONE.md](PIANO_ORGANIZZAZIONE.md). Leggilo prima di toccare qualsiasi cosa.

Lavoro sul ramo `organizzazione`. `main` è la vecchia versione, ancora online.

**Step 1 completato (28 lug):** ruoli crew/pubblico, candidatura staff all'iscrizione con
questionario dedicato e approvazione a mano, QR statico, tracciamento click referral,
registro azioni admin. Il blocco social (Muro, profilo, poke, Legami, messaggi) **resta
acceso**; congelato solo il Mosaico.

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
| `/` | Landing: glitch 1%, countdown, feed live iscritti |
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
