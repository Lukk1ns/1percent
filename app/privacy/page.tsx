"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { VENUE_NAME } from "@/lib/event";

export default function PrivacyPage() {
  const router = useRouter();
  const [deleting, setDeleting] = useState(false);
  const [deleted, setDeleted] = useState(false);

  async function handleDelete() {
    if (!confirm("Sei sicuro? Il tuo profilo e il tuo pass verranno cancellati. Azione irreversibile.")) return;
    setDeleting(true);
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (user) {
      // Le foto vanno rimosse via Storage API (Supabase vieta il
      // delete SQL sulle tabelle storage); poi la RPC pulisce il resto.
      await Promise.all([
        supabase.storage.from("volti").remove([`${user.id}/volto.webp`]),
        supabase.storage.from("volti-blur").remove([`${user.id}/volto.webp`]),
      ]).catch(() => {});
      await supabase.rpc("delete_my_profile");
      await supabase.auth.signOut();
    }
    setDeleted(true);
    setDeleting(false);
    setTimeout(() => router.push("/"), 2000);
  }

  if (deleted) {
    return (
      <main className="flex-1 flex flex-col items-center justify-center px-6 text-center">
        <p className="text-brand-gray text-sm">Profilo cancellato. Arrivederci.</p>
      </main>
    );
  }

  return (
    <main className="flex-1 flex flex-col px-6 py-12 max-w-xl mx-auto">
      <h1 className="font-display text-brand-red text-4xl mb-8">Privacy</h1>

      <div className="prose prose-sm prose-invert text-brand-gray space-y-4 text-sm leading-relaxed">
        <h2 className="text-white text-base font-semibold">Titolare del trattamento</h2>
        <p>
          {VENUE_NAME} — <strong className="text-white">QFB SRL</strong>,{" "}
          <strong className="text-white">Via XX Settembre 289, Roveredo in Piano (PN)</strong>.{" "}
          Email: <strong className="text-white">papionthebeach22@gmail.com</strong>.
        </p>

        <h2 className="text-white text-base font-semibold mt-6">Dati raccolti</h2>
        <p>
          Raccogliamo i seguenti dati, forniti volontariamente al momento della
          registrazione: alias (pseudonimo), avatar selezionato, risposte al quiz,
          indirizzo email e/o numero di telefono (opzionali). I dati sono memorizzati
          su server Supabase (EU-West, Irlanda) con misure di sicurezza adeguate.
        </p>

        <h2 className="text-white text-base font-semibold mt-6">Finalità</h2>
        <p>
          I dati sono usati esclusivamente per: gestire l&apos;accesso all&apos;evento
          tramite pass digitale; inviare comunicazioni sull&apos;evento se hai fornito
          email o telefono; mostrare il contatore pubblico anonimo dei membri.
        </p>

        <h2 className="text-white text-base font-semibold mt-6">Conservazione</h2>
        <p>
          I dati vengono conservati per la durata della stagione estiva 2026, salvo
          richiesta di cancellazione anticipata. Puoi richiedere la cancellazione
          in qualsiasi momento tramite il bottone qui sotto.
        </p>

        <h2 className="text-white text-base font-semibold mt-6">I tuoi diritti (GDPR)</h2>
        <p>
          Hai il diritto di accedere, rettificare, cancellare, limitare il trattamento
          dei tuoi dati e di opporti al trattamento (artt. 15–21 GDPR). Puoi esercitare
          questi diritti scrivendo all&apos;email sopra indicata o usando il bottone
          di cancellazione qui sotto.
        </p>

        <h2 className="text-white text-base font-semibold mt-6">Cookie</h2>
        <p>
          Usiamo solo cookie tecnici necessari al funzionamento dell&apos;autenticazione.
          Nessun cookie di profilazione o tracciamento di terze parti.
        </p>
      </div>

      {/* Cancellazione dati */}
      <div className="mt-12 pt-8 border-t border-white/10">
        <h2 className="text-white text-base font-semibold mb-2">
          Cancella il mio profilo
        </h2>
        <p className="text-brand-gray text-sm mb-6">
          Rimuove alias, avatar, contatti e pass. Il tuo numero membro viene
          anonimizzato. Azione irreversibile.
        </p>
        <button
          onClick={handleDelete}
          disabled={deleting}
          className="border border-brand-red text-brand-red px-6 py-3 text-sm uppercase tracking-widest hover:bg-brand-red hover:text-white transition-all disabled:opacity-50"
        >
          {deleting ? "Cancellazione…" : "Cancella i miei dati"}
        </button>
      </div>
    </main>
  );
}
