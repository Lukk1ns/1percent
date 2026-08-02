/**
 * Il segno della crew accanto al nome: `alias (1%)`.
 *
 * Chi viene approvato deve distinguersi dove si vedono i nomi — il Muro,
 * la sua pagina, la sua card. L'alias nel database NON cambia (è unico ed
 * è l'indirizzo di /u/<alias>): il segno lo aggiunge il sito, così si
 * cambia idea senza toccare i dati di nessuno.
 *
 * Se il ruolo non arriva (script SQL non ancora incollato) non si vede
 * niente: nessuno resta senza nome.
 */
export function SegnoCrew({ role }: { role?: string | null }) {
  if (role !== "crew") return null;
  return (
    <span className="ml-1.5 align-middle font-tech text-[0.62em] uppercase tracking-[0.15em] text-brand-red">
      (1%)
    </span>
  );
}
