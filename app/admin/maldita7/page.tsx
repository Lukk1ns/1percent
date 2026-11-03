"use client";

import PannelloOmaggio from "@/components/PannelloOmaggio";
import { SLUG_MALDITA_7 } from "@/lib/omaggio";

/** SHOT OMAGGIO · il pannello di Luka per MALDITA del 7 novembre (script 53). */
export default function AdminMaldita7Page() {
  return (
    <PannelloOmaggio
      slug={SLUG_MALDITA_7}
      sopra="shot omaggio · sabato 7/11"
      csv="shot-omaggio-maldita-7-novembre.csv"
      chi="persone"
    />
  );
}
