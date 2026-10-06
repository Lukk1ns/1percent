import type { Metadata } from "next";

// La pagina personale non finisce su Google: chi ha il link è lei.
export const metadata: Metadata = {
  title: "Il tuo ingresso · MALDITA",
  robots: { index: false, follow: false },
};

export default function MiaLayout({ children }: { children: React.ReactNode }) {
  return children;
}
