// I VOLTI — costanti e helper per la foto profilo sfocata.
//
// La foto nitida vive nel bucket PRIVATO "volti" (solo il proprietario,
// in futuro i Legami via URL firmati). La versione sfocata, generata
// SUL SERVER al momento dell'upload, vive nel bucket pubblico
// "volti-blur" ed è l'unica che circola: il blur non è mai solo CSS.

export const VOLTO_SIZE = 512;

// Livelli di blur (sigma su immagine 512px). Luka sceglie dalla
// pagina /profilo/prova; il livello attivo è BLUR_SIGMA.
export const BLUR_LEVELS = [
  { id: "leggero", sigma: 4 },
  { id: "medio", sigma: 6 },
  { id: "forte", sigma: 9 },
  { id: "extra", sigma: 11 },
  { id: "max", sigma: 14 },
] as const;

// Livello attivo, scelto da Luka: "ancora più sfocato" (7 lug 2026).
export const BLUR_SIGMA = 14;

// Iscritto prima dell'opening (8 luglio 2026) = Founding Member.
export const FOUNDING_CUTOFF = "2026-07-09T00:00:00+02:00";

// URL pubblico della foto sfocata (+ cache-busting quando viene ricaricata).
export function voltoBlurUrl(
  photoBlurPath: string,
  photoUpdatedAt?: string | null,
): string {
  const base = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/volti-blur/${photoBlurPath}`;
  const v = photoUpdatedAt ? new Date(photoUpdatedAt).getTime() : 0;
  return v ? `${base}?v=${v}` : base;
}

// Path (nei bucket) della foto di un membro: sempre <uuid>/volto.webp
export function voltoPath(userId: string): string {
  return `${userId}/volto.webp`;
}
