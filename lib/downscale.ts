// Comprime la foto NEL BROWSER prima di spedirla al server.
// Perché: le foto da telefono pesano anche 5-8 MB e Vercel taglia
// le richieste sopra ~4,5 MB → upload "riuscito a metà".
// Qui ridimensioniamo a max 1024px e ricodifichiamo in JPEG:
// il server poi fa comunque crop 512 + blur.
// imageOrientation "from-image" applica la rotazione EXIF.

export async function downscaleImage(file: File, maxSide = 1024): Promise<Blob> {
  try {
    const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
    const scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height));
    const w = Math.max(1, Math.round(bitmap.width * scale));
    const h = Math.max(1, Math.round(bitmap.height * scale));

    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    if (!ctx) return file;
    ctx.drawImage(bitmap, 0, 0, w, h);
    bitmap.close();

    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, "image/jpeg", 0.85),
    );
    // Se il browser non collabora (formato strano), meglio l'originale
    // che niente: il server ha comunque i suoi controlli.
    return blob ?? file;
  } catch {
    return file;
  }
}
