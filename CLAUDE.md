# Progetto "1%" — Portale dell'organizzazione

> Ultimo aggiornamento: 25 settembre 2026

## ⚠️ Leggi prima di tutto

**L'APP DALLA SCHERMATA HOME RESTAVA SCOLLEGATA (25 set, `/login`, `/admin/login`,
`supabase/TEMPLATE_EMAIL_CODICE.html`).** Luka: *"ho fatto aggiungi alla schermata Home e ora l'app
me la dà disconnessa; se clicco il link della mail mi apre Safari, entro lì, ma l'app resta fuori —
tanto vale cancellarla. E i PR si scazzano."* Ha ragione ed è una trappola di iOS, non un bug:
**una web app aggiunta alla Home ha un contenitore di cookie e storage separato da Safari.** Il
magic link apre il browser, quindi la sessione nasce dalla parte sbagliata e dentro l'icona non
arriva mai. Nessun "ricordami" può risolverlo: la sessione giusta deve **nascere dentro l'app**.
Fatto: la mail adesso porta **un codice di 6 cifre** oltre al link, e le due pagine di accesso hanno
il campo per scriverlo (`verifyOtp`, con ripiego su `type: 'signup'` per chi non aveva mai
confermato). Se la pagina gira in modalità app (`display-mode: standalone`, o `navigator.standalone`
su iOS) lo dice esplicitamente: *usa il codice, il link ti butterebbe fuori*.
**PENDING Luka: incollare `supabase/TEMPLATE_EMAIL_CODICE.html`** in Supabase → Authentication →
Emails, in **due** template: *Magic Link* e *Confirm signup*. Finché non lo fa, nella mail il codice
non c'è (il campo sì) e si entra solo dal link. La variabile è `{{ .Token }}`; il link con
`{{ .TokenHash }}` resta identico a prima.

**⚠️ GOTCHA POSTGRES: `min()` non esiste per gli uuid** (visto il 25 set sullo script 32, che si è
fermato lì e — SQL Editor = una transazione sola — ha annullato tutto il resto). Per prendere "uno
qualsiasi" da un gruppo si usa `(array_agg(x))[1]`.

**GLI ACCOUNT MANAGER (25 set, `supabase/32_account_manager.sql`, `/manager`).** Luka ha nominato
**Leonardo Ceolin, Samuele Chezzi e Marco Florean**: PR come gli altri, con tre poteri in più e
**nient'altro**. (1) Stanno in **porta** — le funzioni `porta_*` ora accettano `is_staff()` **oppure**
`is_account_manager()`, `porta_forza` resta solo di Luka. (2) **Consegnano prevendite** a chiunque,
anche a se stessi, **senza tetto** (deciso da lui: "nessun limite"). (3) **Ritirano i contanti** dai
PR, tutti o in parte.
**Il ritiro è un giroconto, ed è il cuore della cosa.** `am_incassa` scrive due righe: una in
`pr_settlements` (il PR risulta saldato e i suoi biglietti **si attivano subito**, scelta di Luka) e
una in **`am_movimenti`**, il registro nuovo, dove quei soldi restano **a carico del manager** finché
non li porta alla direzione. Luka li scarica dalla scheda **Manager** del pannello ("me li ha
portati"), che scrive il movimento negativo. Come `pr_settlements` (19), `am_movimenti` **rifiuta
UPDATE e DELETE**: si corregge solo con `admin_am_storna`, che scrive la riga contraria.
**Cosa NON vedono, per decisione esplicita di Luka:** omaggi, tavoli, annullamenti, cruscotto,
percentuali, scorte rimaste, classifica. `am_pr_lista` dà solo alias/nome/tessera/telefono, vendute,
ancora in mano e **quanto c'è da ritirare**. Torna tutta la crew (anche chi è a zero, se no non lo
si potrebbe rifornire) e la pagina tiene quelli fermi dietro un interruttore.
**Un manager può segnare anche i propri soldi** (in `am_incassa` non è vietato): è coerente — i
contanti sono in mano sua e il debito resta suo — ma va saputo.
Il ruolo sta nella tabella `account_managers`; lo script prova a nominare i tre cercandoli per nome
fra la crew e, se un nome non combacia, lo dice nel controllo finale: si nomina dal pannello.
**PENDING Luka: incollare `32_account_manager.sql`.**

**LA DELEGA PARTE DA SOLA (25 set, `supabase/31_delega_automatica.sql`, `lib/event.ts`).**
Luka: *"quando il PR vende a uno del 2010 in su, il link della delega dev'essere mandato in
automatico — così non ci devono pensare loro"*. Adesso il messaggio WhatsApp che il PR manda
(sia appena venduta, sia col tasto "rimanda") si porta dietro da solo il modulo:
*"⚠️ SE HAI MENO DI 16 ANNI ti serve anche la delega firmata da un genitore…"* più il link
assoluto al PDF. Il PR non deve ricordarsi niente e non deve avere il file.
**La regola è prudente, e questo è il punto.** Del cliente si sa solo l'ANNO di nascita: con
"anno di oggi meno anno di nascita" un nato nel 2010 a settembre 2026 risulta già sedicenne, ma
se compie gli anni a dicembre alla serata del 31 ottobre ne ha 15 e in porta resta fuori. Quindi
si sbaglia dalla parte giusta: **avvisati tutti i nati dall'anno di confine in poi**
(`forse_under16` nel database, `forseUnder16()` in `lib/event.ts`) — per una serata del 2026 sono
i 2010 in su, cioè esattamente quello che ha chiesto Luka. A chi i 16 li ha già compiuti non
costa niente: il messaggio dice *se*. `minorenne` (i 18 anni) resta la regola di prima.
Lo script tocca anche `porta_checkin`, così **in porta la delega la chiedono alle stesse
persone** a cui l'abbiamo promessa, e `pr_eventi` per portare al PR il modulo della serata.
**Quale modulo:** quello scelto per la serata (scheda Grafica); finché non è scelto lo si
riconosce dal nome del locale (`delegaPerLocale`), perché PAPI è QFB SRL e PR1ME è EXO SRLS e
l'informativa privacy sbagliata non vale niente.
**PENDING Luka: incollare `31_delega_automatica.sql`** — dentro c'è anche tutto il 22, che non era
mai stato incollato (senza, nella scheda Grafica il modulo under-16 e la posizione del QR non si
salvano). Finché non lo fa, il messaggio del PR funziona lo stesso col modulo indovinato dal locale.

**IL TASTO PER ANDARSENE (25 set, `app/profilo/page.tsx`).** Luka: *"nel profilo di tutti anche il
tasto ELIMINA IL MIO ACCOUNT, così ognuno si può cancellare quando vuole"*. C'era già, ma era una
scrittina grigia al 40% di opacità in fondo alla pagina: nessuno la trovava. Ora è un bottone
bordato di rosso, con scritto cosa sparisce. **E se il database rifiuta, adesso lo dice**: prima
la pagina faceva `signOut` e rimbalzava in home comunque, quindi uno usciva convinto di essersi
cancellato mentre il profilo era ancora lì. `delete_my_profile` (in `volti_fix.sql`) anonimizza il
profilo e cancella il pass, non tocca la contabilità dei PR: un PR con soldi a suo nome riesce a
cancellarsi e il registro resta intero.

**STATO DEL DATABASE AL 25 SET, verificato uno per uno.** Si controlla senza essere admin e senza
service key: `POST /rest/v1/rpc/<nome>` con la chiave anon e i **parametri giusti** — `PGRST202`
significa che la funzione non c'è, "Non autorizzato"/`42501` significa che c'è (chiamarla senza
parametri dà PGRST202 anche se esiste: è il trabocchetto). Risultato: **26, 27, 28, 29, 30 sono
dentro** (ritiri in blocco, dotazione iniziale, consegna a tutti, ingresso PR, fix lista).
**Mancano `22_delega_per_serata.sql`** (ora inglobato nel 31) **e `iscrizioni.sql`**
(`signups_open`/`admin_set_signups`: l'interruttore iscrizioni non esiste e il sito tira dritto —
va bene finché le iscrizioni devono restare aperte a tutti).

**L'INGRESSO DEL PR SE LO GUADAGNA (24 set, `supabase/30_ingresso_pr.sql`).** Luka: *"un QR che si
attiva solo quando il PR vende il numero richiesto, fissato a 10; poi io posso fare eccezione e
attivarglielo anche a 8, ma decido io; lui vede ATTIVO o NON ANCORA ATTIVO e lo sa"*. È il patto
scritto invece che a voce: niente più discussioni in porta.
Tabella **`pr_ingressi`** (un pass **per PR e per serata** — quello di sabato non apre venerdì), il
token nasce alla prima occhiata e non cambia più, così chi se l'è salvato in galleria lo ritrova.
**Attivo** a `prevendite_config.ingresso_soglia` (10 di serie, si cambia dal pannello) **oppure**
acceso a mano con `admin_pr_ingresso_forza` — e resta scritto chi l'ha deciso. Vale **una volta
sola**: in porta si brucia come un biglietto.
⚠️ **Si conta il VENDUTO, non il saldato** (`stato <> 'annullata'`): chi ha fatto i nominativi ha
fatto il suo lavoro anche se i contanti arrivano domani. Per legarlo ai soldi incassati basta
aggiungere `and ps.stato in ('attiva','usata')` — la riga è segnata nello script.
`porta_checkin` ora, se il codice non è di un biglietto, guarda fra i pass PR: **`pr_ok`** (verde
"PASSA · PR"), **`pr_non_attivo`** (ambra, con scritto a quanto sta) e `gia_usato`. Nel pannello ogni
PR mostra lo stato del suo ingresso col tasto per l'eccezione; nella sua pagina il PR vede il QR
(spento finché non è attivo) e **quante gliene mancano**.
**PENDING Luka: incollare `30_ingresso_pr.sql`.**

**ALL'AREA PR NON CI ARRIVAVA NESSUN LINK (24 set, `app/page.tsx`, `components/NavBasso.tsx`).**
Il PR: *"non c'è proprio il pulsante, non so dove accedere al portale delle prevendite — zero, c'è
eventi foto il muro privacy il tuo profilo qr code la tua tessera crew e basta"*. Aveva ragione:
`/pr` era nata **volutamente invisibile** a settembre ("nessun link porta qui finché non è provata")
e quando l'area è stata aperta nessuno ha rimesso la porta. Si entrava solo scrivendo l'indirizzo.
Ora: bottone **"Le tue prevendite"** in home per chi è `crew` (solo se l'area è aperta, se no
sbatterebbe su "Non ancora") e voce **PR** nella barra in fondo, che `prevendite_stato` accende solo
per chi è PR. **Lezione: quando una cosa nasce nascosta, il giorno che la si accende va rimesso il
link — l'interruttore nel database non crea la strada per arrivarci.**

**CHI DIVENTA PR PARTE CON I SUOI BLOCCHETTI (24 set, `supabase/28_dotazione_iniziale.sql`).**
Luka: *"ogni volta che attivo un PR mettigli le prime 5 prevendite di default"*. Prima un approvato
restava a zero, apriva `/pr`, non vedeva niente e scriveva "non funziona" — successo davvero.
`_pr_dotazione_iniziale()` consegna `prevendite_config.blocchetti_iniziali` (5 di serie, si cambia
dal pannello, 0 = spento) sulla **prossima serata in programma**; niente serate future = niente
consegna, e la funzione lo dice invece di far finta. **Non raddoppia**: se quel PR ha già movimenti
su quella serata non tocca nulla, quindi riapprovare qualcuno non gli regala blocchetti ogni volta.
Aggangiata alle due porte per diventare PR: `admin_approve_crew` (che ora torna `ok:<quanti>:<serata>`
e il pannello lo dice a schermo) e `admin_set_role(.., 'crew')`. Con più serate in parallelo va solo
sulla prima. **PENDING Luka: incollare `28_dotazione_iniziale.sql`.**

**RIPARAZIONE del 24 set (`supabase/27_fix_lista_pr.sql`) — E LA LEZIONE.** `/admin/pr` si apriva su
*"column reference pr_id is ambiguous"*: per aggiungere il numero di tessera avevo riscritto
`admin_pr_lista` copiandola da `09_prevendite.sql` invece che dalla sua correzione in
`11_prevendite_fix.sql`. **Regola: prima di rifare una funzione, cercarla in TUTTI gli script, non
solo in quello che la crea** — l'ultima definizione vince, e in questo progetto le correzioni stanno
in file separati e numerati più avanti. Le funzioni con `returns table` che dichiarano `pr_id` o
`alias` ora hanno `#variable_conflict use_column`, così l'equivoco non può più nascere.
**Nello stesso giro: il pannello non aveva i collegamenti** a Prevendite, Porta e Foto — né in home
né nella dashboard, dove non c'era nessun link. Ecco perché "il PR non si trovava": l'indirizzo
andava scritto a mano. Ora ci sono in tutte e due.
**Controllo fatto sulle 122 RPC chiamate dal sito: 118 esistono.** Mancano solo quelle di due script
mai incollati — `22_delega_per_serata.sql` (`admin_set_event_delega`, `admin_set_event_qr`: nella
scheda Grafica il modulo under-16 e la posizione del QR non si salvano) e `iscrizioni.sql`
(`signups_open`, `admin_set_signups`: l'interruttore iscrizioni non esiste, e il sito tira dritto).
Il controllo si rifà con lo script in `~/.../scratchpad` o riestraendo i nomi con una regex da
`app/` e `lib/`: vale la pena rifarlo dopo ogni tornata di script.

**SEI CORREZIONI ALL'AREA PR (24 settembre 2026, `supabase/26_ritiri_in_blocco.sql`).** Chieste da
Luka mentre provava il modulo con un PR vero.
1. **Consegna parziale**: accanto a "ho ricevuto i soldi" c'è il quadratino della cifra. Vuoto =
   tutto il dovuto; con un numero dentro si segna quello e diventano validi solo i biglietti che
   copre (`admin_pr_incassa` lo sapeva già fare, mancava il campo). Il tasto "attiva al volo" ora
   si chiama **"attiva lo stesso · resta a debito"**, che è quello che fa.
2. **Ritiri in blocco**: `admin_pr_ritira_tutto` (un PR) e `admin_pr_ritira_tutti(event, tranne[])`
   (tutti, con la lista di chi resta acceso). Serve a chiudere le vendite lasciando lavorare due o
   tre persone **senza spegnere l'interruttore generale**, che fermerebbe anche loro. Si ritira solo
   ciò che è **in mano**: le prevendite già vendute non si toccano, e ogni ritiro resta una riga nel
   registro. Il conto delle residue lo rifà il server, non lo schermo.
3. **Tasto "← indietro" ovunque** (`components/Torna.tsx`, montato nel layout): sta nel flusso e non
   sopra la pagina, e si nasconde da solo dove il ritorno c'è già (l'elenco è nel file). Se la pagina
   è stata aperta da un link di WhatsApp non c'è storia dietro, quindi va in home.
4. **La pagina del PR dice i suoi conti**, grande e sopra il modulo: prevendite fatte, **da
   consegnare**, ancora in mano, quanto ha già portato — più la riga sul **giorno della consegna**
   ("te lo comunichiamo noi, comunque prima della serata; quelle non saldate non vengono
   convalidate").
5. **Ricerca PR per nome o numero** nel pannello. `admin_pr_lista` ha la colonna `numero`
   (member_number) — cambia forma, quindi lo script la butta e la rifà.
6. **Le serate passate non si scelgono per sbaglio**: restano nell'elenco marcate "GIÀ FATTA" ma
   disabilitate, con una spunta che le sblocca per rivedere i conti.
**PENDING Luka: incollare `26_ritiri_in_blocco.sql`** — finché non lo fa, ricerca e ritiri in blocco
dicono cosa manca; il resto (cifra parziale, tasto indietro, conti del PR) funziona già.

**LA PORTA SI APRE A TUTTI, E CHI È DENTRO RIENTRA (24 settembre 2026, `lib/event.ts`,
`supabase/24_rientro.sql`).** Deciso da Luka: *"il sito adesso può essere aperto a chiunque, non
serve più la storia dell'invito, più utenti facciamo ora meglio è — e i PR devono essere
approvati"*. Quindi **`SOLO_SU_INVITO = false`** e **`SOLO_STAFF = false`**: da `/unisciti` entra
chiunque, i due percorsi (cliente / staff) sono tutti e due aperti. **Non cambia niente per i PR:**
chi sceglie "iscrizione come staff" fa le 6 domande e resta `in_attesa` finché non lo approvi da
`/admin/crew` — quella è una regola del database. I link `?ref=` continuano a segnare chi porta chi.
**E il bug sotto:** un PR scriveva *"mi ha fatto uscire e non riesco a rientrare"* e finiva sulla
schermata dell'invito. Il muro era solo dove cadeva. Chi si iscrive entra con una sessione anonima e
il profilo porta quell'id; al rientro dalla mail l'accesso è un altro e `link_email_account()` deve
riattaccare il profilo cambiandogli l'id — ma **nessuna delle 22 chiavi che puntano a `profiles`
aveva `on update cascade`**, quindi Postgres rifiutava, la funzione andava in errore e il sito
concludeva "non ti conosco". **Più uno aveva fatto sul sito, meno riusciva a rientrare: un PR con
biglietti assegnati non ce la faceva mai.** `24_rientro.sql` insegna a tutte le chiavi a seguire il
cambio di id (con un ciclo, così vale anche per le tabelle che nasceranno) e riscrive
`link_email_account()`: confronto della mail senza maiuscole né spazi, "sì" anche quando non c'è
niente da spostare, e i cancellati restano cancellati. **PENDING Luka: incollare `24_rientro.sql`.** **E non bastava: il secondo muro era il trigger dei soldi**
(`supabase/25_rientro_e_registro.sql`). `proteggi_consegne`/`proteggi_incassi` (19) rifiutano *ogni*
update su `pr_allocations` e `pr_settlements`; quando il rientro cambia l'id del profilo, la cascata
tocca quelle righe per aggiornare `pr_id` e il trigger la ferma. **Chi ha biglietti o soldi a suo
nome non rientrava mai** — trovato su Leonardo (`ceo`, crew approvata, 5 biglietti, profilo vivo e
mail giusta: la diagnosi "sarà la mail sbagliata" era falsa). Ora il trigger lascia passare **solo**
la riga in cui `to_jsonb(new) - 'pr_id' = to_jsonb(old) - 'pr_id'`: cambia la persona nominata, non
un centesimo della contabilità. Tutto il resto resta vietato, e lo script se lo verifica da solo
provando a cambiare un importo. **Lezione:** quando si blinda una tabella con un trigger, ricordarsi
che gli update non arrivano solo dalle mani di qualcuno — arrivano anche dalle cascate.
In fondo allo script c'è il controllo: deve stampare **0**.

**LE FOTO NON SI CARICAVANO — sharp senza binario (23 settembre 2026, `next.config.ts`).** Primo
caricamento vero della galleria: 119 foto su 119 respinte con **500**. Non erano le foto. Una
chiamata a `/api/foto/upload` **senza nessuna sessione** rispondeva 500 invece di 401: la route
moriva alla prima riga, prima ancora di guardare chi fosse. L'unica differenza fra le route rotte
(`/api/foto/upload`, `/api/volto`, `/api/locandina`) e quelle sane era `import sharp`.
**sharp non è JavaScript**: è un binario compilato per il sistema che lo ospita
(`@img/sharp-linux-x64` su Vercel, `darwin-arm64` sul Mac), e lo sceglie a runtime — quindi chi
prepara il pacchetto della funzione non lo vede e non se lo porta dietro. In locale il Mac trovava
il suo, su Vercel la funzione partiva senza. Fix: `serverExternalPackages: ["sharp"]` (fuori dal
bundler) + `outputFileTracingIncludes` con `./node_modules/@img/**` per le quattro route che lo
usano. **Come si controlla in mezzo minuto, senza log e senza essere admin:** `curl -X POST` sulla
route da fuori — se torna **401/403 in JSON** il modulo si carica, se torna **500 con una pagina
HTML** è morta all'avvio. Stesso trucco per ogni route che importa qualcosa di nativo.

**LA PORTA — Fase 2 delle prevendite, 22 settembre 2026 (`supabase/20_porta.sql`, `/admin/porta`).**
Il QR del biglietto adesso lo legge qualcuno. **Non è `/admin/scan`**: quello è lo scanner dello
STAND (i regali dentro il locale) ed è un altro mestiere — mescolarli avrebbe fatto estrarre un
regalo a chi entra. Pagina nuova, separata.
**Chi la usa:** admin **e operatori** (`is_staff()`), perché in porta ci stanno i collaboratori.
Una cosa sola resta di Luka: **far entrare un biglietto non pagato** (`porta_forza`, solo
`is_admin()`), e resta scritto in `entrata_da` che è passato così.
**La regola dura:** un biglietto entra **una volta sola**. L'`update ... where stato = 'attiva'`
è anche la difesa contro il doppio scan simultaneo: se due telefoni leggono lo stesso QR insieme,
il secondo trova zero righe aggiornate e riceve "già entrato".
Sei esiti, ognuno col suo colore a tutto schermo e **il suo suono** (`lib/suoni.ts`, generati dal
browser con Web Audio — nessun file da scaricare, funzionano con la linea a singhiozzo): passa /
già entrato / non pagato / annullato / **altra serata** (con due serate in parallelo è l'errore
più facile) / non è un biglietto. In più la **vibrazione** diversa per esito: in porta con la musica
alta si sente in mano.
**Pensata per chi ci sta davvero:** in piedi, al freddo, una mano sola. Esito a tutto schermo che si
legge da lontano, e il bottone grande **"cerca per nome"** per il telefono scarico o lo screenshot
cancellato. In testa il conto "entrati / attesi", in fondo l'avviso di quanti biglietti non sono
ancora stati pagati dai PR.
**E funziona senza rete (`supabase/21_porta_offline.sql`, `lib/porta-offline.ts`, `public/sw-porta.js`).**
Come Evently, e per lo stesso motivo: in porta il campo va e viene. **Prima** della serata si preme
"scarica lista" (`porta_lista`, che manda solo nome/cognome/fascia/stato/età — niente telefono né
prezzo: quel telefono può finire in mano a chiunque); durante la serata, se `navigator.onLine` è
falso **o se il server non risponde**, si valida contro la lista in `localStorage` e l'ingresso va in
coda; appena torna la rete la coda parte da sola (`porta_sync`, che scrive **l'orario vero della
porta**, non quello della sincronizzazione). Un service worker limitato a `/admin/porta` e a
`_next/static` tiene la pagina apribile offline — **network-first**, perché una porta che mostra una
versione vecchia è peggio di una lenta — e non tocca il resto del sito.
**Il limite, da conoscere:** due telefoni offline non si parlano, quindi lo stesso biglietto può
passare due volte. Non è evitabile; `porta_sync` però **lo dice**, con nome e ora, e la pagina lo
mostra in un avviso invece di nasconderlo. La lista scade da sé dopo 3 giorni e c'è "fine serata ·
cancella la lista dal telefono", perché dentro ci sono nomi di persone.
**PENDING Luka: incollare `20_porta.sql` e `21_porta_offline.sql`.**

**I SOLDI NON SI CANCELLANO (22 set, `supabase/19_soldi_al_sicuro.sql`).** Richiesta di Luka dopo il
controllo di sicurezza: *"non posso rischiare di perdere traccia dei soldi raccolti e da chi"* —
gli sforamenti di una prevendita e i link condivisi li accetta, la contabilità no.
`pr_settlements` e `pr_allocations` hanno un **trigger che rifiuta UPDATE e DELETE**: sono un
registro, si scrive in fondo e basta. Le correzioni si fanno con un **movimento contrario**
(`admin_pr_storna`, che scrive `-importo` con la nota "STORNO di <data>"), come in contabilità:
resta l'errore e resta la correzione. **Conseguenza voluta: una serata con dei soldi registrati
non si può più cancellare** — prima si storna.
`admin_registro_soldi(event)` = chi ha portato quanto, quando e chi l'ha segnato (incassi +
consegne/ritiri + vendite della direzione, in ordine di tempo). `admin_controllo_conti(event)`
**rifà le somme da zero partendo dalle righe**, non da un totale salvato, e segnala col ⚠️ chi ha
portato più di quanto ha venduto o ha biglietti validi senza soldi dietro (gli "attiva al volo").
Nel pannello è la scheda **Soldi**, con il bottone **scarica il registro** (CSV con `;` e BOM, per
Excel italiano): va scaricato dopo ogni serata e tenuto fuori dal sito, perché è l'unica copia che
non dipende da Supabase.

**CONTROLLO DI SICUREZZA del 22 settembre 2026 (`supabase/18_sicurezza.sql`).** Fatto attaccando il
sito da fuori con la sola chiave pubblica. **Reggono:** RLS su tutte le tabelle (nessuna riga esce
in lettura diretta), tutte le RPC `admin_*` respingono chi non è admin, `members_wall`/
`public_profile`/`my_profile`/`admin_stats` non danno niente agli sconosciuti, i depositi privati
sono chiusi. **Due buchi trovati e chiusi:**
1. **`_pr_applica_credito` era chiamabile da chiunque.** ⚠️ **In Postgres una funzione nasce
   eseguibile da PUBLIC**: `revoke ... from anon, authenticated` **non serve a niente** se non si
   toglie prima il permesso a `public`. Vale per ogni funzione interna: `revoke ... from public,
   anon, authenticated`. Le altre `admin_*` con lo stesso revoke incompleto sono salve solo perché
   hanno `is_admin()` in testa — la riga di difesa vera è quella, il revoke è la seconda.
2. **La percentuale del countdown si ribaltava.** `soglia_countdown()` era pubblica e diceva 13;
   sapendo il punto di partenza e che la scala era una riga dritta, da "91%" si ricavava "restano 5"
   — cioè esattamente ciò che Luka voleva impedire. Ora: `soglia_countdown`, `percentuale_countdown`
   e `scarto_fascia` sono **revocate a tutti** (le funzioni `security definer` che le usano girano
   come owner, quindi continuano a funzionare), `prevendite_stato` dà la soglia **solo all'admin**,
   e la scala ha **uno sfasamento per fascia** (da -3 a +3, da `md5(seme_segreto || tier_id)`, seme
   in `prevendite_config.countdown_seme`) più **scatti di 4 punti**: la stessa percentuale copre 2-3
   numeri diversi e due fasce mostrano percentuali diverse a parità di rimanenze.
Tolta anche `/api/diag/filigrana`, aperta a chiunque e non più utile da agosto.
**PENDING Luka: incollare `18_sicurezza.sql`.**

**GALLERIA FOTO — costruita il 22 settembre 2026 (`supabase/17_galleria.sql`).** Nata da una
richiesta di Luka: "ho le foto dell'ultimo evento che nessuno ha visto e tutti le vogliono vedere".
È la funzione che porta gente nuova nel sito.
**Decisioni sue:** le foto le vedono **solo gli iscritti, sempre** (non la preview 24h che
prevedeva il piano di luglio) · **download in alta qualità solo per gli iscritti** · storage
**Cloudflare R2**, come deciso a luglio, perché "sono tante foto che pesano" e spera in 1000
visitatori: su Supabase la banda del piano gratuito (5 GB) finirebbe in una sera, su R2 la banda
in uscita **non si paga mai**.
**Come regge il muro:** il deposito R2 è privato e nessun indirizzo pubblico esiste. Il sito chiede
una foto per volta a `/api/foto/[id]?f=thumb|medium|hd`, che interroga `foto_chiave()`: se chi
guarda non ha un profilo la risposta è `null` e la route dà 403. Chi ha diritto viene rimandato a
un URL firmato **con scadenza arrotondata all'ora**, così due persone che guardano la stessa foto
ricevono lo stesso indirizzo e la CDN può tenerlo in cache.
Tre formati generati all'upload (sharp, EXIF via — dentro c'è anche il luogo dello scatto):
thumb 500px per la griglia, medium 1400px per lo schermo pieno, 2400px per il download.
**L'upload** (`lib/foto-upload.ts`): le foto vengono **rimpicciolite nel browser a 2400px** prima di
partire — una reflex fa 10 MB, ne arriva mezzo, e 300 scatti passano da 3 GB a 150 MB; è anche la
misura del file scaricabile, quindi non si butta niente. Poi vanno **quattro alla volta**, con
quattro "corsie" che pescano dalla stessa fila: non tutte insieme (la rete di casa non regge 300
richieste e Vercel taglia sopra ~4,5 MB), non una per volta (troppo lento). La barra avanza a ogni
foto finita e i falliti sono elencati per nome, così si sa cosa rimandare.
Rotte: **`/foto`** (vetrina, aperta a tutti: nomi e numeri, non le immagini) · **`/foto/[album]`**
(la porta per chi non è iscritto, griglia + schermo pieno + download per chi lo è) ·
**`/admin/foto`**. C'è anche `chiedi_rimozione()`: "in questa foto ci sono io e non mi va" —
con le foto di una serata è il minimo.
**⚠️ LA PORTA ERA CHIUSA:** `SOLO_SU_INVITO` e `SOLO_STAFF` (impostazioni di agosto, per reclutare
i PR) impedivano a chiunque di iscriversi come cliente, il che avrebbe reso la galleria inutile.
Nuova costante **`FOTO_APRONO_LA_PORTA`** in `lib/event.ts`: chi arriva su `/unisciti?next=/foto/...`
entra come cliente senza link d'invito; **per tutti gli altri ingressi non cambia niente**.
Il `next` viaggia nella bozza in sessionStorage fino a `/benvenuto`, che rimanda alle foto.
**⚠️ GOTCHA — la firma nei `grant` deve combaciare alla virgola** con quella della funzione, tipi
e ordine: `grant execute on function f(uuid, text, uuid)` su una funzione `f(uuid, text, text, uuid)`
fa fallire lo script con *"function ... does not exist"*, e siccome il SQL Editor esegue tutto in
una transazione **annulla l'intero blocco**. Prima di consegnare uno script, controllare ogni grant
contro la sua funzione (si fa in venti righe di script, cercando le due forme con una regex).
**FATTO il 22 set, la galleria è accesa:** script incollato, **R2 configurato** (bucket
`1percent-foto`, Eastern Europe, **privato** — il *Public Development URL* va lasciato disabilitato,
accenderlo renderebbe le foto visibili senza iscrizione) e le quattro `R2_*` sono su Vercel in
All Environments. Verificato dal vivo: scrittura/lettura/cancellazione su R2 funzionano, e
`/api/foto/<id>` risponde **403** a chi non è iscritto.
**La copertina si sceglie (23 set, `supabase/23_copertina.sql`).** Era la prima foto arrivata:
con 119 foto spedite quattro alla volta, quale sia la prima è un sorteggio. Ora in `/admin/foto` la
miniatura si **apre** invece di togliere subito la foto (con 119 in griglia il colpo sbagliato era
troppo facile) e dalla scheda si sceglie *metti in copertina* o *togli dall'album*; la copertina ha
il bordo bianco. `admin_album_copertina` accetta solo una foto **di quell'album** e ancora al suo
posto, e `admin_foto_togli` ne prende un'altra se si toglie proprio quella in copertina.
**PENDING Luka: incollare `23_copertina.sql`** — finché non lo fa, il bottone dice cosa manca.
**Anche: la foto a schermo pieno non esce più dallo schermo.** `/foto/[album]` aveva la fascia
centrale senza `min-h-0`: in un flex verticale un figlio non si stringe sotto il proprio contenuto,
quindi la fascia cresceva fino alla foto intera (medium = lato lungo 1400px) e `max-h-full`
dell'immagine misurava quella, non la finestra. Su Mac la foto usciva dai bordi, sul telefono no
perché a limitare era la larghezza. Da ricordare per ogni visore a schermo pieno.
**Come si controlla senza fidarsi:** le RPC si interrogano dal terminale con la chiave anon —
`curl -X POST "$URL/rest/v1/rpc/<nome>" -H "apikey: $KEY" -d '<parametri veri>'`. Attenzione:
va passato il **parametro giusto**, con `{}` una funzione esistente risponde comunque
`PGRST202` e sembra mancante. `PGRST202` = non c'è · `P0001 Non autorizzato` = c'è e funziona.

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
**Le prevendite della direzione (22 set, `supabase/10_prevendite_direzione.sql`).** Voluto da
Luka dopo aver visto la Fase 1: l'admin entra su `/pr` anche senza profilo crew, **vende sempre**
(niente blocchetti, niente scorta esaurita, niente vendite chiuse) e quello che vende **nasce già
valido**, perché i soldi li ha in mano lui. `presales.pr_id` è diventata nullable — vuota significa
"venduta dalla direzione", e c'è `da_admin` a dirlo; nel pannello quelle righe si leggono
`DIREZIONE`, e i loro soldi entrano fra i raccolti della serata. **Annullare un biglietto resta
solo dell'admin**: i PR non hanno nessuna funzione per farlo.
**PENDING Luka: incollare `10_prevendite_direzione.sql` dopo il 09.**

**⚠️ GOTCHA — i nomi delle colonne di ritorno sono variabili (22 set, `11_prevendite_fix.sql`).**
In una funzione `plpgsql` con `returns table (...)`, ogni colonna dichiarata diventa una variabile:
se una tabella interrogata ha una colonna con lo stesso nome, Postgres si ferma con
*"column reference ... is ambiguous"*. È successo con `event_id`, `pr_id` e `vendite_on`, e
l'effetto era subdolo — `/pr` diceva "nessuna serata", il pannello "nessuna crew approvata",
la vendita non partiva: il sito **ignorava l'errore** e mostrava una lista vuota.
Regola: dentro queste funzioni **ogni colonna va scritta `tabella.colonna`**, alias compresi nei
`lateral`. Nel sito, mai `const { data } = await rpc(...)` senza guardare `error`.
Il cruscotto della serata (`admin_pr_cruscotto` + `admin_pr_per_fascia`) rifà quello che Luka
guardava su Evently: consegnate, vendute, in attesa, valide, entrate, incasso, già in cassa,
da ritirare, e la divisione per fascia. Tavoli e omaggi restano Fase 3.
**PENDING Luka: incollare `11_prevendite_fix.sql` dopo il 10.**
**Secondo gotcha, stessa giornata:** in coda a uno script da incollare **non si chiama mai una RPC
protetta da `is_admin()`** per verificare che funzioni — il SQL Editor esegue come padrone del
database, non come utente del sito, quindi `is_admin()` è false e la riga solleva "Non autorizzato".
Il SQL Editor esegue tutto in **una transazione sola**: quella riga fa **annullare l'intero script**,
funzioni comprese, e sembra che non sia stato incollato niente. I controlli in fondo leggono le
tabelle (`select count(*) from public.profiles ...`), mai le funzioni.

**Il biglietto non parla di soldi (22 set, `12_biglietto_under16.sql`).** Luka, vedendolo dal vivo,
ha tolto "in attesa di conferma": per il cliente il biglietto è **valido dal momento in cui lo
riceve**, e gli unici stati che vede sono *valido* e *già usato* (rosso, "vale una volta sola: al
primo ingresso viene staccato" — serve a togliere l'idea di girare uno screenshot). Che il PR
abbia saldato resta **un fatto interno**, visibile solo nel pannello e nell'area PR.
**Conseguenza da tenere presente in porta:** un cliente può presentarsi convinto di essere a posto
mentre il suo PR non ha ancora consegnato i contanti — il controllo va fatto dal pannello, non dalla
faccia del cliente.
**Il QR si sposta sulla grafica (22 set, stesso script 22).** Luka: *"se si può mettere il quadrato
sotto la scritta halloween sarebbe top"*. Dove sta lo spazio libero dipende dalla locandina e non si
indovina dal codice, quindi `events.qr_pos` (0–100, distanza dal bordo alto) e un **cursore con
anteprima** nella scheda Grafica: si trascina guardando il risultato. Da 70 in su — e quando non è
impostato — il QR torna in fondo con la sfumatura nera; più in alto si appoggia su un velo scuro
sfocato, perché sopra una locandina chiara un QR bianco su bianco non si legge.

**Il modulo per gli under 16 è per serata (22 set, `22_delega_per_serata.sql`).** I due locali sono
**due società diverse** — PAPI ON THE BEACH è QFB SRL, PR1ME CLUB è EXO SRLS — quindi hanno due
moduli con due informative privacy diverse: un link unico per tutto il sito darebbe al cliente
l'informativa di un'altra società, che non vale niente. Colonna `events.delega_url`, si sceglie dalla
scheda **Grafica** di `/admin/pr`, e il biglietto usa quello della sua serata (`DELEGA_UNDER16_URL`
resta solo come ripiego). I PDF stanno in `public/moduli/`, sorgenti HTML in
`ClaudeLukkins/STAGIONE_INVERNALE_2026-27/PDF/` (si rigenerano con `weasyprint file.html file.pdf`).
**⚠️ Nel modulo PAPI-ON mancano P.IVA e PEC di QFB**, marcati in nero "DA INSERIRE" perché non
si possa stampare per sbaglio: nelle fatture c'era solo la partita IVA del fornitore.
**Il documento lo chiede a tutti**, non solo ai minorenni (correzione di Luka: "serve per chiunque"),
ed è ricordato anche nel messaggio WhatsApp che il PR manda al cliente; **sotto i 16 si aggiunge la
delega** firmata da chi accompagna, con il link preso da `DELEGA_UNDER16_URL` in `lib/event.ts` — **vuoto finché Luka non
manda il PDF**, e finché è vuoto la pagina dice di chiedere il modulo a chi ha venduto la prevendita.
**PENDING Luka: incollare `12_biglietto_under16.sql`, e mandare il link della delega.**

**La grafica del biglietto (22 set, `13_grafica_biglietto.sql`).** Luka la voleva come su Evently:
l'immagine della serata grande, col QR appoggiato sopra ("che la copra un po' non è un problema").
**Deposito nuovo e pubblico `biglietti`, separato dalle locandine**, perché la locandina nitida è
riservata ai membri e prima dello svelamento resta nascosta, mentre la grafica del biglietto finisce
su WhatsApp a centinaia di persone non iscritte: è pubblica per forza. Così Luka sceglie cosa far
girare senza scoprire la locandina. Colonne `events.ticket_key` / `ticket_updated_at`, RPC
`admin_set_event_ticket` e `admin_event_ticket`, upload da `/api/biglietto-grafica` (sharp, EXIF via,
`fit: inside` in 1080×1920), slot nella scheda **Grafica** di `/admin/pr` con l'anteprima di come
la vede il cliente. Senza grafica il biglietto esce col solo QR: funziona, ma è anonimo.
**PENDING Luka: incollare `13_grafica_biglietto.sql`.**

**IL COUNTDOWN DELLE ULTIME PREVENDITE (22 set, `14_countdown.sql`).** Regola voluta da Luka:
**il PR non deve mai sapere quante prevendite restano** — se sa che ne mancano 9 si organizza.
Le scorte residue sono sparite dalla sua schermata: `pr_fasce` restituisce i numeri veri (`stock`,
`rimaste`, `vendute`) **solo a chi è admin**, agli altri `null`. Al loro posto, quando Luka preme
**"ULTIME 13 · UOMO"** (un tasto per fascia, in cima a `/admin/pr`, il 13 è modificabile), parte
l'avviso: *"UOMO al 78%"* con la barra, sopra il modulo dei nuovi nominativi. La percentuale la
calcola `percentuale_countdown(base, rimaste)`: si parte da **75%** e si arriva a **99%** quando ne
resta una, 100% = finite. Accendere il countdown mette il tetto della fascia a `vendute + base`,
quindi a zero la fascia è chiusa **per i PR** (Luka continua a vendere, vedi il 10); spegnerlo
toglie tetto e avviso. Dalla percentuale non si ricava il numero: non sanno da quanti si parte né
con che passo sale.
**E parte anche da solo (`15_countdown_automatico.sql`).** Seconda richiesta di Luka, stessa sera:
"magari dormo e i PR continuano a vendere". Quindi l'avviso è acceso se `countdown_on` **oppure**
se la fascia ha un tetto e `rimaste <= soglia`: nessun job, è un calcolo fatto a ogni lettura, quindi
scatta anche alle quattro di notte. La soglia sta in `prevendite_config.soglia_countdown` (13 di
serie, si cambia dal pannello) e vale per tutte le fasce. Il tasto manuale funziona **con o senza
tetto**; se un tetto c'è già, accenderlo lo **abbassa** a `vendute + base`, e la conferma lo dice
esplicitamente perché è una decisione, non un incidente.
**PENDING Luka: incollare `14_countdown.sql` e poi `15_countdown_automatico.sql`.**

**Doppioni (22 set, `16_niente_doppioni.sql`).** Regole chieste da Luka: **stesso telefono sì**
(uno compra per tutto il gruppo e riceve lui i biglietti), **stesso nome+cognome nella stessa serata
no** (è la stessa persona due volte), **stesso solo cognome sì** (fratelli). Il confronto normalizza
maiuscole e spazi doppi, e i biglietti annullati non contano — quel nome torna libero. L'admin può
**forzare** con `p_forza`, perché gli omonimi veri esistono; il PR no, e gli si dice di chiedere a
Luka. `pr_vendi` ha un parametro in più, quindi la vecchia firma va eliminata (lo script lo fa).
**PENDING Luka: incollare `16_niente_doppioni.sql`.**

**Due serate insieme (22 set).** Luka: con la domenica pomeriggio in arrivo servono due serate in
parallelo. **Funzionava già**: prezzi, blocchetti, biglietti e incassi hanno tutti `event_id`, quindi
due serate sono due mondi separati e non serve un secondo sito. L'unico rischio vero era **umano** —
un PR di fretta che scrive il nominativo sulla serata sbagliata. Aggiunto: `giornoEData()` ("SAB 31
OTT", il giorno della settimana è ciò che distingue due serate vicine) e `accentoSerata(id)`, un
colore stabile per serata da una tavolozza che resta dentro il marchio (il rosso è sempre il primo).
Su `/pr/<serata>` c'è una **fascia sticky** che resta in alto mentre si scrive, il bottone dice
"Fai il biglietto · SAB 31 OTT" e la conferma ripete la serata; su `/pr` ogni serata ha la sua
striscia colorata; nel pannello il selettore è marcato con lo stesso colore e avvisa quando ci sono
più serate aperte. Nessuna modifica al database.

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
