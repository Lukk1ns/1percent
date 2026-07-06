import type { Metadata, Viewport } from "next";
import { Anton, Inter, Caveat } from "next/font/google";
import { Backdrop } from "@/components/Backdrop";
import { Notifiche } from "@/components/Notifiche";
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

export const metadata: Metadata = {
  title: "1% — not for everyone",
  description: "Il 99% resterà a casa.",
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
      className={`${anton.variable} ${inter.variable} ${caveat.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col font-sans bg-background text-foreground">
        <Backdrop />
        <Notifiche />
        {children}
      </body>
    </html>
  );
}
