"use client";

import PannelloOmaggio from "@/components/PannelloOmaggio";
import { SLUG_BACK_TO_2010 } from "@/lib/omaggio";

/** SHOT OMAGGIO · il pannello di Luka per BACK TO 2010 (script 51). */
export default function AdminBackTo2010Page() {
  return (
    <PannelloOmaggio
      slug={SLUG_BACK_TO_2010}
      sopra="shot omaggio · venerdì 30/10"
      csv="shot-omaggio-back-to-2010.csv"
      chi="persone"
    />
  );
}
