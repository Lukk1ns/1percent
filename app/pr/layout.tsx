import type { Metadata } from "next";

// L'area PR non si cerca su Google: ci si arriva solo sapendo l'indirizzo,
// e dentro comanda comunque il controllo sul database.
export const metadata: Metadata = {
  title: "Area PR · 1%",
  robots: { index: false, follow: false },
};

export default function PrLayout({ children }: { children: React.ReactNode }) {
  return children;
}
