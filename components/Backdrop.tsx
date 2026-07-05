/**
 * Sfondo atmosferico globale: aurore rosse in movimento lento,
 * griglia prospettica sottile e una scanline che scende ogni tanto.
 * Solo CSS (GPU-friendly), nessuna logica.
 */
export function Backdrop() {
  return (
    <div className="fixed inset-0 -z-10 overflow-hidden" aria-hidden>
      {/* Vignettatura per profondità */}
      <div
        className="absolute inset-0"
        style={{
          background:
            "radial-gradient(ellipse at 50% 30%, transparent 40%, rgba(0,0,0,0.55) 100%)",
        }}
      />
      <div className="aurora aurora-a" />
      <div className="aurora aurora-b" />
      <div className="bg-grid" />
      <div className="scan-sweep" />
    </div>
  );
}
