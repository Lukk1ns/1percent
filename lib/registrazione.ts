import { createClient } from "@/lib/supabase/client";

/**
 * Registrazione di un nuovo membro.
 *
 * Una sola porta d'ingresso per tutti. Chi si iscrive e basta entra
 * subito da /unisciti; chi si candida allo staff passa prima da
 * /candidatura e risponde alle 4 domande. In entrambi i casi si
 * finisce qui, così la logica di errore sta scritta in un posto solo.
 */

export type Bozza = {
  alias: string;
  avatarId: string | null;
  email: string;
  gender: "M" | "F" | null;
  refCode: string | null;
  /** true se ha spuntato "voglio entrare nello staff" */
  crewRequest: boolean;
  /** nome vero, chiesto solo a chi si candida */
  nome: string | null;
};

/** Le risposte al questionario staff, così come escono da Questionario. */
export type RisposteStaff = Record<string, string | { text?: string; tag?: string }>;

export type Esito =
  | { ok: true; membro: unknown }
  | { ok: false; messaggio: string; campo?: "alias" | "email" };

export async function registraMembro(
  bozza: Bozza,
  risposteStaff: RisposteStaff | null,
): Promise<Esito> {
  try {
    const supabase = createClient();

    const { error: signInError } = await supabase.auth.signInAnonymously();
    if (signInError) throw signInError;

    const { data, error } = await supabase.rpc("join_public", {
      p_alias: bozza.alias,
      p_avatar_id: bozza.avatarId,
      p_nome: bozza.nome,
      p_email: bozza.email,
      p_gender: bozza.gender,
      p_quiz_answers: null,
      p_referral_code: bozza.refCode,
      p_crew_request: bozza.crewRequest,
      p_crew_answers: risposteStaff,
    });

    if (error) {
      const m = error.message ?? "";
      if (m.includes("iscrizioni_chiuse")) {
        return { ok: false, messaggio: "Le iscrizioni sono chiuse. Riaprono al prossimo evento." };
      }
      if (m.includes("alias")) {
        return {
          ok: false,
          messaggio: "Questo alias è già preso. Scegline un altro.",
          campo: "alias",
        };
      }
      if (m.toLowerCase().includes("mail")) {
        return {
          ok: false,
          messaggio: 'Questa email è già dell\'1%. Usa "Rientra" dalla home per accedere.',
          campo: "email",
        };
      }
      throw error;
    }

    return { ok: true, membro: data };
  } catch (e) {
    console.error(e);
    return { ok: false, messaggio: "Qualcosa è andato storto. Riprova." };
  }
}
