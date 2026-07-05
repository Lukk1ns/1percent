/**
 * Striscia ticker infinita in stile club: il contenuto è duplicato
 * due volte e l'animazione CSS trasla del 50% per un loop perfetto.
 */
export function Marquee({
  items,
  reverse = false,
  className = "",
}: {
  items: string[];
  reverse?: boolean;
  className?: string;
}) {
  const row = items.map((item, i) => (
    <span
      key={i}
      className="flex items-center gap-6 px-6 text-[11px] font-semibold uppercase tracking-[0.35em] whitespace-nowrap"
    >
      {item}
      <span className="text-brand-red" aria-hidden>◆</span>
    </span>
  ));

  return (
    <div
      className={`relative overflow-hidden border-y border-brand-red/15 bg-brand-red/[0.03] py-2.5 select-none ${className}`}
      aria-hidden
    >
      <div className={`marquee ${reverse ? "marquee-reverse" : ""}`}>
        <div className="flex">{row}</div>
        <div className="flex">{row}</div>
      </div>
    </div>
  );
}
