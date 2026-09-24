import type { Metadata, Viewport } from "next";
import { Anton, Inter, Caveat, JetBrains_Mono } from "next/font/google";
import { Analytics } from "@vercel/analytics/next";
import { Backdrop } from "@/components/Backdrop";
import { Notifiche } from "@/components/Notifiche";
import { StatoCrew } from "@/components/StatoCrew";
import { Torna } from "@/components/Torna";
import "./globals.css";

const anton = Anton({
  variable: "--font-anton",
  weight: "400",
  subsets: ["latin"],
});

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
});

const caveat = Caveat({
  variable: "--font-caveat",
  subsets: ["latin"],
});

/** La faccia tecnica: numeri, orari, etichette. Non è un font da titoli. */
const jetbrains = JetBrains_Mono({
  variable: "--font-jet",
  weight: ["400", "700"],
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "1% — not for everyone",
  description: "Pordenone eventi. Ogni festa ha un nome, sopra c'è sempre il nostro.",
};

export const viewport: Viewport = {
  themeColor: "#0a0a0a",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="it"
      className={`${anton.variable} ${inter.variable} ${caveat.variable} ${jetbrains.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col font-sans bg-background text-foreground">
        <Backdrop />
        <Notifiche />
        <StatoCrew />
        <Torna />
        {children}
        <Analytics />
      </body>
    </html>
  );
}
