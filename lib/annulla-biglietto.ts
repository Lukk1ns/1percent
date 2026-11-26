import { createClient } from "@/lib/supabase/client";

/**
 * Annulla un biglietto: solo Luka (admin_presale_annulla, script 35, ha
 * is_admin() in testa). Chiede il motivo, annulla e, se il PR aveva già
 * portato i soldi, dice quanto è stato rimesso a posto.
 * Uguale in tutti i posti dove si vede un biglietto: pannello prevendite,
 * pagina di vendita della direzione, scheda della persona.
 * Torna true se il biglietto è stato annullato (la pagina si rilegge).
 */
export async function annullaBiglietto(b: {
  id: string;
  nome: string;
  cognome: string;
  pr_alias?: string | null;
}): Promise<boolean> {
  const chi = b.pr_alias ? ` (${b.pr_alias})` : "";
  const motivo = window.prompt(
    `Annullare il biglietto di ${b.nome} ${b.cognome}${chi}?\n\nMotivo:`,
    "",
  );
  if (motivo === null) return false;

  const supabase = createClient();
  const { data, error } = await supabase.rpc("admin_presale_annulla", {
    p_id: b.id,
    p_motivo: motivo,
  });
  if (error) {
    // Un errore senza codice è la rete, non il database.
    window.alert(error.code ? error.message : "Niente connessione: riprova tra un attimo.");
    return false;
  }

  const r = data?.[0] as
    | { esito: string; rimborso: number | string; manager_da_sistemare: string | null }
    | undefined;
  if (r?.esito === "non_trovato") {
    window.alert("Non si può annullare: è già entrato, oppure il biglietto non c'è più.");
    return false;
  }
  if (r && Number(r.rimborso) > 0) {
    window.alert(
      `Biglietto annullato e ${Number(r.rimborso).toFixed(0)} € rimessi a posto: ` +
        `${b.pr_alias ?? "il PR"} non li deve più.` +
        (r.manager_da_sistemare
          ? `\n\n⚠️ Quei contanti risultano in mano a ${r.manager_da_sistemare}. ` +
            "Se li ha restituiti al cliente, storna anche il suo movimento dalla scheda Manager."
          : ""),
    );
  }
  return true;
}
