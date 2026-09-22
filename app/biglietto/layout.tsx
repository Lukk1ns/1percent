import type { Metadata } from "next";

// I biglietti non finiscono su Google: l'unico indirizzo è il link
// che il cliente ha ricevuto.
export const metadata: Metadata = {
  title: "Biglietto · 1%",
  robots: { index: false, follow: false },
};

export default function BigliettoLayout({ children }: { children: React.ReactNode }) {
  return children;
}
