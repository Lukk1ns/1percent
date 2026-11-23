"use client";

import PannelloOmaggio from "@/components/PannelloOmaggio";
import { SLUG_AFRO } from "@/lib/omaggio";

/** LADIES FREE · DONNA OMAGGIO · il pannello di Luka per AFRO-MERICA, 27 novembre (script 68). */
export default function AdminAfroPage() {
  return (
    <PannelloOmaggio
      slug={SLUG_AFRO}
      sopra="donna omaggio · venerdì 27/11 · AFRO-MERICA"
      csv="donna-omaggio-afromerica-27-novembre.csv"
      chi="ragazze"
    />
  );
}
