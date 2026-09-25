import { BarraAdmin } from "@/components/BarraAdmin";
import { GuardiaAdmin } from "@/components/GuardiaAdmin";

/**
 * Il pannello.
 *
 * Due cose per tutte le pagine che stanno qui sotto: il controllo dei
 * permessi (che prima mancava su metà di loro) e la riga in cima con il
 * ritorno, la posta e il collegamento al sito.
 */
export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <GuardiaAdmin>
      <BarraAdmin />
      {children}
    </GuardiaAdmin>
  );
}
