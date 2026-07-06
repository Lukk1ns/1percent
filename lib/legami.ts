import type { SupabaseClient } from "@supabase/supabase-js";
import { voltoPath } from "@/lib/volto";

// I Legami: poke reciproco = vi vedete nitidi a vicenda.
// La policy storage "volto_link_read" permette gli URL firmati
// SOLO verso le foto dei propri legami: il server decide, non il client.

export type Legame = {
  profile_id: string;
  member_number: number;
  alias: string;
  avatar_id: string | null;
  photo_blur_path: string | null;
  photo_updated_at: string | null;
  bio: string | null;
  linked_at: string;
};

// Carica i legami + gli URL firmati (1h) delle loro foto nitide.
// Ritorna anche una mappa member_number → URL nitido, comoda per il Muro.
export async function fetchLegami(supabase: SupabaseClient): Promise<{
  legami: Legame[];
  clearUrls: Map<number, string>;
}> {
  const { data, error } = await supabase.rpc("my_links");
  const legami: Legame[] = !error && Array.isArray(data) ? (data as Legame[]) : [];
  const clearUrls = new Map<number, string>();

  const withPhoto = legami.filter((l) => l.photo_blur_path);
  if (withPhoto.length > 0) {
    const { data: signed } = await supabase.storage
      .from("volti")
      .createSignedUrls(withPhoto.map((l) => voltoPath(l.profile_id)), 3600);
    signed?.forEach((s, i) => {
      if (s.signedUrl) clearUrls.set(withPhoto[i].member_number, s.signedUrl);
    });
  }

  return { legami, clearUrls };
}
