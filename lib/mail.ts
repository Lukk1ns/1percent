/**
 * Le mail scritte male (13 nov 2026).
 *
 * Luka riceveva "Indirizzo non trovato" per i codici di accesso: gente
 * che scriveva `nome@gmail` senza `.com` (il campo `type="email"` del
 * telefono lo accetta), o `gmail.con`, `gmial.com`. Il codice partiva
 * verso il nulla e la persona restava fuori.
 *
 * Qui: pulizia, controllo che la mail sia completa, e la correzione
 * probabile da proporre con un tocco ("Intendevi …?").
 */

/** Spazi via, minuscole, virgola al posto del punto, punto finale via. */
export function pulisciMail(s: string): string {
  return s
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "")
    .replace(/,/g, ".")
    .replace(/\.+$/, "");
}

/** nome@dominio.estensione, con l'estensione di almeno due lettere. */
export function mailCompleta(m: string): boolean {
  return /^[^\s@]+@[^\s@.]+(\.[^\s@.]+)*\.[a-z]{2,}$/.test(m);
}

// I fornitori più usati qui, con le estensioni che esistono davvero.
const FORNITORI: Record<string, string[]> = {
  gmail: ["com"],
  googlemail: ["com"],
  icloud: ["com"],
  hotmail: ["it", "com"],
  outlook: ["it", "com"],
  libero: ["it"],
  yahoo: ["it", "com"],
  virgilio: ["it"],
  tiscali: ["it"],
  alice: ["it"],
  live: ["it", "com"],
  me: ["com"],
  // esistono davvero: non vanno "corretti" in gmail
  email: ["it"],
  mail: ["com"],
  tin: ["it"],
  inwind: ["it"],
  aruba: ["it"],
  msn: ["com"],
  aol: ["com"],
  protonmail: ["com"],
};

// Estensioni sbagliate che si scrivono per sbaglio.
const QUASI_COM = new Set(["con", "cm", "co", "om", "comm", "coom", "cim", "vom", "xom", "ocm", "clm", "cpm", "cmo", "c0m", "comn"]);
const QUASI_IT = new Set(["ti", "itt", "iy", "ot", "ut", "i", "t"]);

function distanza(a: string, b: string): number {
  const d = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)]);
  for (let j = 1; j <= b.length; j++) d[0][j] = j;
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      d[i][j] = Math.min(
        d[i - 1][j] + 1,
        d[i][j - 1] + 1,
        d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1),
      );
      // due lettere scambiate (gmial → gmail) contano come un errore solo
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) {
        d[i][j] = Math.min(d[i][j], d[i - 2][j - 2] + 1);
      }
    }
  }
  return d[a.length][b.length];
}

/** Il fornitore che probabilmente intendeva (gmial → gmail), o null. */
function fornitore(nome: string): string | null {
  if (FORNITORI[nome]) return nome;
  if (nome.length < 4) return null;
  let migliore: string | null = null;
  let min = 99;
  for (const f of Object.keys(FORNITORI)) {
    if (f.length < 5) continue; // "me", "live": troppo corti per indovinare
    const dist = distanza(nome, f);
    if (dist < min) {
      min = dist;
      migliore = f;
    }
  }
  return min <= (migliore && migliore.length >= 7 ? 2 : 1) ? migliore : null;
}

/**
 * La mail giusta da proporre, se questa sembra scritta male. Null se va
 * bene così o se non si sa indovinare (allora decide `mailCompleta`).
 */
export function correggiMail(m: string): string | null {
  const at = m.lastIndexOf("@");
  if (at < 1 || at === m.length - 1) return null;
  const utente = m.slice(0, at);
  const dominio = m.slice(at + 1);
  const pezzi = dominio.split(".");
  const nome = pezzi[0];
  const est = pezzi.slice(1).join(".");

  const f = fornitore(nome);
  if (f) {
    const valide = FORNITORI[f];
    let estGiusta: string | null = valide.includes(est) ? est : null;
    if (!estGiusta && QUASI_COM.has(est) && valide.includes("com")) estGiusta = "com";
    if (!estGiusta && QUASI_IT.has(est) && valide.includes("it")) estGiusta = "it";
    if (!estGiusta && valide.length === 1) estGiusta = valide[0];
    if (!estGiusta) return null;
    const giusta = `${utente}@${f}.${estGiusta}`;
    return giusta === m ? null : giusta;
  }

  // Dominio sconosciuto (mail di lavoro, di scuola…): si tocca solo
  // un'estensione che è quasi certamente ".com".
  if (pezzi.length >= 2) {
    const ultima = pezzi[pezzi.length - 1];
    if (["con", "comm", "coom", "cim", "vom", "xom", "ocm", "cpm", "cmo", "c0m"].includes(ultima)) {
      return `${utente}@${pezzi.slice(0, -1).join(".")}.com`;
    }
  }
  return null;
}

/**
 * Cosa dire prima di mandare. Null = si può mandare.
 * `confermata` = la mail che la persona ha detto essere giusta così.
 */
export function problemaMail(m: string, confermata: string | null = null): string | null {
  if (!m) return "Scrivi la tua email.";
  if (!m.includes("@")) return "Manca la @ nella mail.";
  if (!mailCompleta(m)) {
    const giusta = correggiMail(m);
    return giusta
      ? `La mail non è completa: intendevi ${giusta}?`
      : "La mail non è completa: manca il finale, tipo .com o .it.";
  }
  const giusta = correggiMail(m);
  if (giusta && m !== confermata) return `Controlla la mail: intendevi ${giusta}?`;
  return null;
}
