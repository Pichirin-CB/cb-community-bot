export const DISCORD_REASON_MAX = 512;
export const EMBED_TITLE_MAX = 256;
export const EMBED_DESCRIPTION_MAX = 4096;

export function cleanReason(reason: string | null | undefined, fallback = "Sin motivo indicado"): string {
  const value = (reason ?? "").trim();
  if (!value) return fallback;
  if (value.length > DISCORD_REASON_MAX) {
    throw new Error(`El motivo no puede superar ${DISCORD_REASON_MAX} caracteres.`);
  }
  return value;
}

export function assertUrl(value: string | null | undefined, fieldName: string): string | null {
  const raw = (value ?? "").trim();
  if (!raw) return null;
  try {
    const url = new URL(raw);
    if (!["http:", "https:"].includes(url.protocol)) {
      throw new Error();
    }
    return url.toString();
  } catch {
    throw new Error(`${fieldName} debe ser una URL http(s) valida.`);
  }
}

export function assertEmbedText(title: string, description: string): void {
  if (title.length > EMBED_TITLE_MAX) {
    throw new Error(`El titulo no puede superar ${EMBED_TITLE_MAX} caracteres.`);
  }
  if (description.length > EMBED_DESCRIPTION_MAX) {
    throw new Error(`La descripcion no puede superar ${EMBED_DESCRIPTION_MAX} caracteres.`);
  }
}
