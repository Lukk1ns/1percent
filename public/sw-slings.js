/**
 * La pagina personale di CULTURE · SLINGS 13/11 anche senza campo (copia di sw-maldita7.js).
 *
 * In fila davanti al locale la rete va e viene: chi è in fila deve poter
 * aprire la sua icona e mostrare il QR lo stesso. Stessa idea della
 * porta (sw-porta.js): con la rete si prende la versione fresca e si
 * aggiorna la copia, senza rete si serve la copia. Lavora solo dentro
 * /slings/ e sui pezzi del sito che quelle pagine usano.
 * I dati (stato e QR) li tiene la pagina stessa, in localStorage.
 */

const CASSA = "slings-v1";

self.addEventListener("install", () => self.skipWaiting());

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches
      .keys()
      .then((nomi) =>
        Promise.all(
          nomi.filter((n) => n.startsWith("slings-") && n !== CASSA).map((n) => caches.delete(n)),
        ),
      )
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== "GET") return;
  if (url.origin !== self.location.origin) return;

  const pagina = url.pathname.startsWith("/slings/");
  const pezzi = url.pathname.startsWith("/_next/static") || url.pathname.startsWith("/_next/image");
  if (!pagina && !pezzi) return;

  e.respondWith(
    fetch(e.request)
      .then((risposta) => {
        if (risposta && risposta.ok) {
          const copia = risposta.clone();
          caches.open(CASSA).then((c) => c.put(e.request, copia));
        }
        return risposta;
      })
      .catch(() => caches.match(e.request).then((c) => c || Response.error())),
  );
});
