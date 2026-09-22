/**
 * Il guardiano della porta.
 *
 * Tiene in cassaforte la pagina dell'ingresso e i suoi pezzi, così
 * quando il campo sparisce la porta si apre lo stesso. Non tocca il
 * resto del sito: se un domani si rompesse qualcosa qui, il sito
 * pubblico non se ne accorge nemmeno.
 */

const CASSA = "porta-v1";

// Quando c'è rete si prende la versione fresca e si aggiorna la copia;
// quando non c'è, si serve la copia. Mai il contrario: una porta che
// mostra una versione vecchia del programma è peggio di una lenta.
self.addEventListener("install", (e) => {
  e.waitUntil(
    caches.open(CASSA).then((c) => c.addAll(["/admin/porta"])).then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches
      .keys()
      .then((nomi) => Promise.all(nomi.filter((n) => n !== CASSA).map((n) => caches.delete(n))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== "GET") return;
  if (url.origin !== self.location.origin) return;

  const miaPagina = url.pathname.startsWith("/admin/porta");
  const mieiPezzi = url.pathname.startsWith("/_next/static");
  if (!miaPagina && !mieiPezzi) return;

  e.respondWith(
    fetch(e.request)
      .then((risposta) => {
        if (risposta && risposta.ok) {
          const copia = risposta.clone();
          caches.open(CASSA).then((c) => c.put(e.request, copia));
        }
        return risposta;
      })
      .catch(() =>
        caches.match(e.request).then((c) => c || caches.match("/admin/porta")),
      ),
  );
});
