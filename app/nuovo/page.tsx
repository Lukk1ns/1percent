import { redirect } from "next/navigation";

/**
 * Qui viveva l'anteprima della grafica "parete LED".
 *
 * Ora quella grafica È la home, quindi questa pagina non ha più niente
 * da mostrare: chi ha il vecchio indirizzo nei preferiti o in una scheda
 * aperta viene portato dritto in home.
 */
export default function AnteprimaSpostata() {
  redirect("/");
}
