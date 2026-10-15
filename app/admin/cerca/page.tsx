import { redirect } from "next/navigation";

/**
 * "Cerca una persona" è stata una pagina a sé per un giorno (15 ott).
 * Dal 16 sta nella dashboard, dentro la lista membri: chi ha ancora
 * questo indirizzo finisce lì.
 */
export default function Cerca() {
  redirect("/admin/dashboard");
}
