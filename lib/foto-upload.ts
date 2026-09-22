/**
 * Preparare le foto nel browser, prima di spedirle.
 *
 * Una foto che esce da una reflex pesa 8-15 MB. Mandarla così com'è
 * significa tre cose, tutte brutte: la connessione del locale ci mette
 * un minuto a foto, Vercel rifiuta le richieste sopra ~4,5 MB, e il
 * server deve comunque rimpicciolirla — quindi quei megabyte li abbiamo
 * spediti per buttarli.
 *
 * Qui la foto viene ridotta a 2400px **dentro il browser**: è già la
 * misura che serve per il download in alta qualità, e il file scende
 * intorno al mezzo megabyte. Trecento foto passano da 3 GB a 150 MB.
 *
 * Il lavoro lo fa la scheda grafica con createImageBitmap; se Safari
 * fa i capricci con qualche formato, si ripiega su <img> + canvas.
 * In entrambi i casi il browser applica da sé la rotazione EXIF, e
 * ridisegnando l'immagine i dati nascosti (modello della macchina,
 * posto dello scatto) restano fuori.
 */

/** Il lato lungo massimo: è anche la misura del file scaricabile. */
export const LATO_MASSIMO = 2400;

/** Quante ne spediamo insieme. */
export const IN_PARALLELO = 4;

async function daElemento(file: File): Promise<HTMLImageElement> {
  const url = URL.createObjectURL(file);
  const img = new Image();
  img.decoding = "async";
  img.src = url;
  await img.decode();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
  return img;
}

/**
 * Riduce la foto e la restituisce pronta da spedire.
 * Se qualcosa va storto torna l'originale: meglio lenta che persa.
 */
export async function preparaFoto(file: File, lato = LATO_MASSIMO): Promise<Blob> {
  try {
    let larghezza = 0;
    let altezza = 0;
    let sorgente: CanvasImageSource;

    try {
      const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
      larghezza = bitmap.width;
      altezza = bitmap.height;
      sorgente = bitmap;
    } catch {
      const img = await daElemento(file);
      larghezza = img.naturalWidth;
      altezza = img.naturalHeight;
      sorgente = img;
    }

    if (!larghezza || !altezza) return file;

    // Una foto già piccola non si tocca: ingrandirla la peggiorerebbe.
    const scala = Math.min(1, lato / Math.max(larghezza, altezza));
    const w = Math.max(1, Math.round(larghezza * scala));
    const h = Math.max(1, Math.round(altezza * scala));

    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    if (!ctx) return file;
    ctx.drawImage(sorgente, 0, 0, w, h);
    if (sorgente instanceof ImageBitmap) sorgente.close();

    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, "image/jpeg", 0.9),
    );
    return blob && blob.size > 0 ? blob : file;
  } catch {
    return file;
  }
}

export type EsitoFoto = { nome: string; ok: boolean; errore?: string };

/**
 * Carica una lista di foto, a gruppi.
 *
 * Quattro alla volta e non tutte insieme: la rete di casa non regge
 * trecento richieste in parallelo, le manderebbe comunque in coda e in
 * più qualcuna andrebbe in timeout. Quattro tengono il collegamento
 * pieno senza intasarlo.
 *
 * `onAvanzamento` viene chiamata a ogni foto finita, così la barra si
 * muove davvero invece di stare ferma e poi saltare alla fine.
 */
export async function caricaFoto(
  files: File[],
  albumId: string,
  onAvanzamento: (fatte: number, totali: number) => void,
): Promise<EsitoFoto[]> {
  const esiti: EsitoFoto[] = [];
  let fatte = 0;

  async function unaFoto(file: File): Promise<EsitoFoto> {
    try {
      const pronta = await preparaFoto(file);
      const fd = new FormData();
      fd.append("file", new File([pronta], file.name, { type: pronta.type }));
      fd.append("album_id", albumId);

      const res = await fetch("/api/foto/upload", { method: "POST", body: fd });
      if (!res.ok) {
        const j = await res.json().catch(() => null);
        return { nome: file.name, ok: false, errore: String(j?.error ?? res.status) };
      }
      return { nome: file.name, ok: true };
    } catch {
      return { nome: file.name, ok: false, errore: "connessione persa" };
    } finally {
      fatte += 1;
      onAvanzamento(fatte, files.length);
    }
  }

  // Quattro "corsie" che pescano dalla stessa fila: appena una finisce
  // prende la prossima, senza aspettare le altre tre.
  let prossima = 0;
  async function corsia() {
    for (;;) {
      const mia = prossima++;
      if (mia >= files.length) return;
      esiti[mia] = await unaFoto(files[mia]);
    }
  }

  await Promise.all(
    Array.from({ length: Math.min(IN_PARALLELO, files.length) }, () => corsia()),
  );

  return esiti;
}
