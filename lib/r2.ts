/**
 * Cloudflare R2 — dove stanno le foto delle serate.
 *
 * Perché non Supabase: una galleria la guardano tutti, più volte, e
 * ogni volta i file escono dal server. Supabase fa pagare quella banda
 * (e sul piano gratuito la stacca dopo 5 GB); R2 non la fa pagare mai.
 * Con qualche centinaio di foto e un migliaio di persone è la
 * differenza fra "funziona" e "il sito non carica più le immagini".
 *
 * Il deposito è PRIVATO: nessun indirizzo pubblico esiste. Il sito
 * chiede una foto per volta e, solo se chi guarda è iscritto, riceve
 * un indirizzo firmato che scade.
 */

import { S3Client, PutObjectCommand, GetObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

export const R2_BUCKET = process.env.R2_BUCKET ?? "1percent-foto";

/** Le chiavi ci sono? Finché mancano, la galleria lo dice invece di rompersi. */
export function r2Configurato(): boolean {
  return Boolean(
    process.env.R2_ACCOUNT_ID &&
      process.env.R2_ACCESS_KEY_ID &&
      process.env.R2_SECRET_ACCESS_KEY,
  );
}

let client: S3Client | null = null;

function r2(): S3Client {
  if (!client) {
    client = new S3Client({
      region: "auto",
      endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
      credentials: {
        accessKeyId: process.env.R2_ACCESS_KEY_ID!,
        secretAccessKey: process.env.R2_SECRET_ACCESS_KEY!,
      },
    });
  }
  return client;
}

export async function caricaSuR2(key: string, corpo: Buffer, tipo: string): Promise<void> {
  await r2().send(
    new PutObjectCommand({
      Bucket: R2_BUCKET,
      Key: key,
      Body: corpo,
      ContentType: tipo,
    }),
  );
}

/**
 * Un indirizzo firmato, valido un'ora.
 *
 * La scadenza è arrotondata all'ora in corso, non "fra 60 minuti da
 * adesso": così due persone che guardano la stessa foto ricevono lo
 * stesso indirizzo, e la rete di Cloudflare può tenerselo in cache
 * invece di ripescare il file ogni volta.
 */
export async function urlFirmato(key: string): Promise<string> {
  const oraTonda = Math.floor(Date.now() / 3_600_000) * 3_600_000;
  const mancanti = Math.ceil((oraTonda + 3_600_000 - Date.now()) / 1000);

  return getSignedUrl(
    r2(),
    new GetObjectCommand({ Bucket: R2_BUCKET, Key: key }),
    // almeno cinque minuti, così a cavallo dell'ora non scade in mano
    { expiresIn: Math.max(mancanti, 300) },
  );
}

/** Dove finisce ogni formato di una foto. */
export function chiaviFoto(albumId: string, id: string) {
  return {
    thumb: `${albumId}/${id}_t.webp`,
    medium: `${albumId}/${id}_m.webp`,
    hd: `${albumId}/${id}_hd.webp`,
  };
}
