# Progetto "1%" — Portale interattivo evento

> Ultimo aggiornamento: 24 giugno 2026

## Cos'è questo progetto

Sito web interattivo per la serata **"1%"** di Luka Rebec al **Papi on the Beach**, Roveredo in Piano (PN).
Opening: **mercoledì 1 luglio 2026**.

Il sito non è una pagina Instagram — è un "mondo digitale" esplorabile: registrazione anonima, card membro, QR pass per l'ingresso gratuito, feed live degli iscritti.

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
| `/unisciti?ref=CODE` | Registrazione: alias + avatar + email opzionale + privacy |
| `/test` | Quiz 4 domande cinematografico |
| `/benvenuto` | Reveal animato "Benvenuto nell'1%" |
| `/card` | Card membro digitale (screenshottabile, salvabile) |
| `/pass` | QR pass ingresso |
| `/invita` | Link referral personale + contatore inviti |
| `/membri` | Il Muro: tutti i membri, classifica poke 👊, poke 1/giorno |
| `/login` | Accesso per membri esistenti (magic link email) |
| `/privacy` | Privacy policy GDPR + cancellazione dati |
| `/admin/login` | Login staff |
| `/admin/dashboard` | Lista membri, modifica alias, elimina (solo admin) |
| `/admin/scan` | Scanner QR per validare ingressi |
| `/auth/callback` | Handler redirect magic link email |

---

## Database Supabase — tabelle

| Tabella | Cosa contiene |
|---|---|
| `profiles` | Ogni membro: alias, avatar, numero progressivo, email, referral_code, referred_by |
| `passes` | QR token univoco per ingresso, status (valid/checked_in) |
| `admins` | Email degli staff autorizzati a validare QR |
| `pokes` | Poke 👊 tra membri: from/to, 1 al giorno per coppia (unique su data IT), flag seen. RLS: solo il ricevente legge i propri. SQL in `supabase/pokes.sql` |

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
