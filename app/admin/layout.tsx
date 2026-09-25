import { BarraAdmin } from "@/components/BarraAdmin";

/**
 * Il pannello.
 *
 * Serve solo a mettere in cima la riga con "← pannello", la posta e il
 * collegamento al sito: prima da metà delle pagine non si tornava
 * indietro se non riscrivendo l'indirizzo a mano.
 */
export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <BarraAdmin />
      {children}
    </>
  );
}
