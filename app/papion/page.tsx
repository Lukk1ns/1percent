/**
 * Il menu è la grafica di Luka (`Menu Papion 2026:27`), così com'è:
 * per cambiarlo si sostituisce `public/papion/menu-bottiglie.webp`.
 * Lo zoom col pollice resta libero, le scritte sono piccole.
 */
export default function PapionMenuPage() {
  return (
    <main className="mx-auto w-full max-w-[640px] px-3 pb-10 pt-4">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src="/papion/menu-bottiglie.webp"
        alt="PAPI-ON Music Club — menu bottiglie: vodka, cognac, gin, whisky, tequila, bollicine, rum, amari"
        width={1024}
        height={1536}
        className="block w-full"
        style={{ height: "auto" }}
      />
    </main>
  );
}
