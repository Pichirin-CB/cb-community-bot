const allowedVariableNames = new Set(["username", "displayname", "user_id", "counter"]);

export type NameTemplateInput = {
  username: string;
  displayname: string;
  globalName?: string | null;
  userId: string;
  counter: number;
};

const maxDiscordChannelNameLength = 100;

export function sanitizeChannelName(value: string): string {
  const withoutControlCharacters = [...value]
    .filter((character) => {
      const code = character.codePointAt(0) ?? 0;
      return code > 31 && code !== 127;
    })
    .join("");
  const cleaned = withoutControlCharacters
    .replace(/[\r\n\t]+/g, " ")
    .trim()
    .replace(/\s+/g, " ")
    .replace(/[/\\]/g, "-")
    .replace(/@everyone/gi, "everyone")
    .replace(/@here/gi, "here");
  return truncateChannelName(cleaned).replace(/^[.\-_ ]+|[.\-_ ]+$/g, "");
}

export function fallbackRoomName(input: NameTemplateInput): string {
  const candidates = [input.displayname, input.globalName ?? "", input.username];
  for (const candidate of candidates) {
    const sanitized = sanitizeChannelName(candidate);
    if (sanitized) return sanitized;
  }
  return `user-${input.userId.slice(-6)}`;
}

export function truncateChannelName(value: string, maxLength = maxDiscordChannelNameLength): string {
  return [...value].slice(0, maxLength).join("");
}

export function validateNameTemplate(template: string): string | null {
  if (!template.trim()) return "El template no puede estar vacio.";
  if (template.length > 80) return "El template no puede superar 80 caracteres.";
  const variables = [...template.matchAll(/\{([^}]+)\}/g)].map((match) => match[1]);
  const invalid = variables.find((name) => name !== undefined && !allowedVariableNames.has(name));
  if (invalid) return `Variable no soportada: {${invalid}}.`;
  return null;
}

export function renderNameTemplate(template: string, input: NameTemplateInput): string {
  const safeDisplayName = fallbackRoomName(input);
  const safeUsername = sanitizeChannelName(input.username) || safeDisplayName;
  const raw = template
    .replaceAll("{username}", safeUsername)
    .replaceAll("{displayname}", safeDisplayName)
    .replaceAll("{user_id}", input.userId)
    .replaceAll("{counter}", String(input.counter));
  const rendered = sanitizeChannelName(raw);
  return rendered || `user-${input.userId.slice(-6)}`;
}

export function fallbackRenderedNames(template: string, input: NameTemplateInput): string[] {
  const candidates = [input.displayname, input.globalName ?? "", input.username]
    .map((candidate) => sanitizeChannelName(candidate))
    .filter(Boolean);
  candidates.push(`user-${input.userId.slice(-6)}`);
  const names: string[] = [];
  for (const candidate of candidates) {
    const rendered = sanitizeChannelName(
      template
        .replaceAll("{username}", candidate)
        .replaceAll("{displayname}", candidate)
        .replaceAll("{user_id}", input.userId)
        .replaceAll("{counter}", String(input.counter)),
    );
    if (rendered && !names.includes(rendered)) names.push(rendered);
  }
  return names.length ? names : [`user-${input.userId.slice(-6)}`];
}

export function uniqueChannelName(baseName: string, existingNames: Iterable<string>, maxLength = maxDiscordChannelNameLength): string {
  const existing = new Set([...existingNames].map((name) => name.toLocaleLowerCase()));
  const base = sanitizeChannelName(baseName) || "sala";
  if (!existing.has(base.toLocaleLowerCase())) return base;

  for (let index = 2; index < 1000; index += 1) {
    const suffix = `-${index}`;
    const candidate = `${truncateChannelName(base, maxLength - suffix.length)}${suffix}`;
    if (!existing.has(candidate.toLocaleLowerCase())) return candidate;
  }
  return `${truncateChannelName(base, maxLength - 7)}-${Date.now().toString(36).slice(-6)}`;
}
