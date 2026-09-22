/**
 * I tre suoni della porta.
 *
 * In mezzo alla musica non si legge niente: si sente. Tre suoni molto
 * diversi fra loro, così si capisce di spalle e senza guardare:
 *   passa   → due note che salgono, corte
 *   aspetta → una nota media ripetuta
 *   no      → una nota bassa lunga
 *
 * Generati dal browser, nessun file da scaricare: funzionano anche
 * quando la linea va a singhiozzo.
 */

let ctx: AudioContext | null = null;

function contesto(): AudioContext | null {
  if (typeof window === "undefined") return null;
  if (!ctx) {
    const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AC) return null;
    ctx = new AC();
  }
  // Su iPhone il suono parte solo dopo che l'utente ha toccato qualcosa
  if (ctx.state === "suspended") void ctx.resume();
  return ctx;
}

function nota(freq: number, inizio: number, durata: number, volume = 0.22) {
  const c = contesto();
  if (!c) return;
  const osc = c.createOscillator();
  const gain = c.createGain();
  osc.type = "sine";
  osc.frequency.value = freq;
  gain.gain.setValueAtTime(0, c.currentTime + inizio);
  gain.gain.linearRampToValueAtTime(volume, c.currentTime + inizio + 0.012);
  gain.gain.exponentialRampToValueAtTime(0.0001, c.currentTime + inizio + durata);
  osc.connect(gain);
  gain.connect(c.destination);
  osc.start(c.currentTime + inizio);
  osc.stop(c.currentTime + inizio + durata + 0.02);
}

/** Passa: due note che salgono. */
export function suonaOk() {
  nota(880, 0, 0.12);
  nota(1320, 0.1, 0.18);
}

/** Fermati un attimo: nota media, due colpi. */
export function suonaAttenzione() {
  nota(620, 0, 0.14, 0.26);
  nota(620, 0.2, 0.14, 0.26);
}

/** No: nota bassa e lunga. */
export function suonaNo() {
  nota(180, 0, 0.5, 0.3);
}

/** Sveglia l'audio al primo tocco: senza, iPhone resta muto. */
export function preparaAudio() {
  contesto();
}
