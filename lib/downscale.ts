// Comprime la foto NEL BROWSER prima di spedirla al server.
// Perché: le foto da telefono pesano anche 5-8 MB e Vercel taglia
// le richieste sopra ~4,5 MB → upload "riuscito a metà".
// Due strade: createImageBitmap (moderna) e, se Safari fa i capricci,
// il caro vecchio <img> + canvas. I browser moderni applicano da soli
// la rotazione EXIF quando disegnano su canvas.

async function loadViaImageElement(file: File): Promise<HTMLImageElement> {
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    img.decoding = "async";
    img.src = url;
    await img.decode();
    return img;
  } finally {
    // revoke dopo il draw: lo fa il chiamante tenendo il riferimento vivo
    setTimeout(() => URL.revokeObjectURL(url), 10_000);
  }
}

export async function downscaleImage(file: File, maxSide = 1024): Promise<Blob> {
  try {
    let width = 0;
    let height = 0;
    let source: CanvasImageSource;

    try {
      const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
      width = bitmap.width;
      height = bitmap.height;
      source = bitmap;
    } catch {
      // Safari/iOS con formati particolari: via classica
      const img = await loadViaImageElement(file);
      width = img.naturalWidth;
      height = img.naturalHeight;
      source = img;
    }

    if (!width || !height) return file;

    const scale = Math.min(1, maxSide / Math.max(width, height));
    const w = Math.max(1, Math.round(width * scale));
    const h = Math.max(1, Math.round(height * scale));

    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    if (!ctx) return file;
    ctx.drawImage(source, 0, 0, w, h);
    if (source instanceof ImageBitmap) source.close();

    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, "image/jpeg", 0.85),
    );
    // Se il browser non collabora, meglio l'originale che niente:
    // il server ha comunque i suoi controlli.
    return blob && blob.size > 0 ? blob : file;
  } catch {
    return file;
  }
}
