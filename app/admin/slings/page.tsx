"use client";

import PannelloOmaggio from "@/components/PannelloOmaggio";
import { SLUG_SLINGS } from "@/lib/omaggio";

/** DONNA OMAGGIO · il pannello di Luka per CULTURE con gli SLINGS, 13 novembre (script 56). */
export default function AdminSlingsPage() {
  return (
    <PannelloOmaggio
      slug={SLUG_SLINGS}
      sopra="donna omaggio · venerdì 13/11 · SLINGS"
      csv="donna-omaggio-culture-slings-13-novembre.csv"
      chi="ragazze"
    />
  );
}
