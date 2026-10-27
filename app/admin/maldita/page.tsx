"use client";

import PannelloOmaggio from "@/components/PannelloOmaggio";
import { SLUG_MALDITA } from "@/lib/omaggio";

/** DONNA OMAGGIO · il pannello di Luka per MALDITA (script 42). */
export default function AdminMalditaPage() {
  return (
    <PannelloOmaggio
      slug={SLUG_MALDITA}
      sopra="donna omaggio · sabato 17/10"
      csv="donna-omaggio-maldita.csv"
      chi="ragazze"
    />
  );
}
