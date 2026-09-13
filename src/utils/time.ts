const UNITS: Array<[RegExp, number]> = [
  [/^(\d+)\s*s(?:eg(?:undo)?s?)?$/i, 1000],
  [/^(\d+)\s*m(?:in(?:uto)?s?)?$/i, 60 * 1000],
  [/^(\d+)\s*h(?:ora)?s?$/i, 60 * 60 * 1000],
  [/^(\d+)\s*d(?:ia|ias|ía|ías)?$/i, 24 * 60 * 60 * 1000],
];

export const DISCORD_TIMEOUT_MAX_MS = 28 * 24 * 60 * 60 * 1000;

export function parseDuration(input: string): number {
  const value = input.trim();
  for (const [pattern, multiplier] of UNITS) {
    const match = value.match(pattern);
    if (match?.[1]) {
      const ms = Number(match[1]) * multiplier;
      if (!Number.isSafeInteger(ms) || ms <= 0) {
        throw new Error("La duracion debe ser mayor a cero.");
      }
      return ms;
    }
  }

  throw new Error("Usa una duracion como 30m, 2h o 7d.");
}

export function formatDuration(ms: number | null): string {
  if (!ms) return "No aplica";
  const minutes = Math.round(ms / 60_000);
  if (minutes < 60) return `${minutes} minuto${minutes === 1 ? "" : "s"}`;
  const hours = Math.round(minutes / 60);
  if (hours < 48) return `${hours} hora${hours === 1 ? "" : "s"}`;
  const days = Math.round(hours / 24);
  return `${days} dia${days === 1 ? "" : "s"}`;
}

export function nowIso(): string {
  return new Date().toISOString();
}

export function todayIsoDate(): string {
  return new Date().toISOString().slice(0, 10);
}
