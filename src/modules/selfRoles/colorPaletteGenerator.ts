import { AttachmentBuilder, type Guild, type Role } from "discord.js";
import { mkdirSync, existsSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import sharp from "sharp";
import { logger } from "../../logger.js";
import type { SelfRoleRepository } from "../../repositories/selfRoleRepository.js";
import {
  colorGroupKeys,
  isColorGroupKey,
  selfRoleGroups,
  type ColorSelfRoleGroupKey,
} from "./selfRolePresentation.js";

export interface ColorPaletteEntry {
  roleId: string;
  label: string;
  hex: string;
}

interface PaletteManifest {
  groupKey: ColorSelfRoleGroupKey;
  entries: ColorPaletteEntry[];
}

const paletteFilenames: Record<ColorSelfRoleGroupKey, string> = {
  COLOR_CLASSIC: "classic-palette.png",
  COLOR_PASTEL: "pastel-palette.png",
  COLOR_DARK: "dark-palette.png",
};

const paletteTitles: Record<ColorSelfRoleGroupKey, string> = {
  COLOR_CLASSIC: "COLORES CLASICOS",
  COLOR_PASTEL: "COLORES PASTEL",
  COLOR_DARK: "COLORES OSCUROS",
};

function paletteDir(guildId: string): string {
  return path.resolve(process.cwd(), "assets", "self-roles", "palettes", guildId);
}

export function palettePath(guildId: string, groupKey: ColorSelfRoleGroupKey): string {
  return path.join(paletteDir(guildId), paletteFilenames[groupKey]);
}

function manifestPath(guildId: string, groupKey: ColorSelfRoleGroupKey): string {
  return palettePath(guildId, groupKey).replace(/\.png$/, ".json");
}

export function roleColorToHex(color: number): string {
  return `#${Math.max(0, color).toString(16).padStart(6, "0").slice(-6).toUpperCase()}`;
}

export function hexToRgb(hex: string): { r: number; g: number; b: number } {
  const value = hex.replace("#", "");
  return {
    r: Number.parseInt(value.slice(0, 2), 16),
    g: Number.parseInt(value.slice(2, 4), 16),
    b: Number.parseInt(value.slice(4, 6), 16),
  };
}

export function relativeLuminance(hex: string): number {
  const { r, g, b } = hexToRgb(hex);
  const channel = (value: number) => {
    const normalized = value / 255;
    return normalized <= 0.03928 ? normalized / 12.92 : ((normalized + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}

export function readableTextColor(hex: string): "#111827" | "#F8FAFC" {
  return relativeLuminance(hex) > 0.55 ? "#111827" : "#F8FAFC";
}

function swatchBorder(hex: string): string {
  const luminance = relativeLuminance(hex);
  if (luminance < 0.08) return "#CBD5E1";
  if (luminance > 0.86) return "#475569";
  return "rgba(255,255,255,0.20)";
}

function escapeXml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function manifestEquals(current: PaletteManifest, previous: PaletteManifest | null): boolean {
  if (!previous || previous.groupKey !== current.groupKey || previous.entries.length !== current.entries.length) return false;
  return current.entries.every((entry, index) => {
    const old = previous.entries[index];
    return old?.roleId === entry.roleId && old.label === entry.label && old.hex === entry.hex;
  });
}

function readManifest(guildId: string, groupKey: ColorSelfRoleGroupKey): PaletteManifest | null {
  const file = manifestPath(guildId, groupKey);
  if (!existsSync(file)) return null;
  try {
    return JSON.parse(readFileSync(file, "utf8")) as PaletteManifest;
  } catch {
    return null;
  }
}

async function roleById(guild: Guild, roleId: string): Promise<Role | null> {
  return guild.roles.cache.get(roleId) ?? (await guild.roles.fetch(roleId).catch(() => null));
}

export async function paletteEntriesForGroup(
  guild: Guild,
  repo: SelfRoleRepository,
  groupKey: ColorSelfRoleGroupKey,
): Promise<ColorPaletteEntry[]> {
  const options = repo.listOptionsByGroup(guild.id, groupKey).slice(0, 25);
  const entries: ColorPaletteEntry[] = [];
  for (const option of options) {
    const role = await roleById(guild, option.role_id);
    if (!role) {
      logger.warn({ guildId: guild.id, groupKey, roleId: option.role_id }, "Rol de paleta eliminado; se omite de la imagen");
      continue;
    }
    entries.push({
      roleId: option.role_id,
      label: option.label || role.name,
      hex: roleColorToHex(role.color),
    });
  }
  return entries;
}

function paletteSvg(groupKey: ColorSelfRoleGroupKey, entries: ColorPaletteEntry[]): string {
  const columns = groupKey === "COLOR_CLASSIC" ? 4 : 4;
  const tileWidth = 230;
  const tileHeight = 92;
  const gap = 18;
  const padding = 34;
  const titleHeight = 74;
  const rows = Math.max(1, Math.ceil(entries.length / columns));
  const width = padding * 2 + columns * tileWidth + (columns - 1) * gap;
  const height = padding * 2 + titleHeight + rows * tileHeight + (rows - 1) * gap;

  const tiles = entries
    .map((entry, index) => {
      const column = index % columns;
      const row = Math.floor(index / columns);
      const x = padding + column * (tileWidth + gap);
      const y = padding + titleHeight + row * (tileHeight + gap);
      const textColor = readableTextColor(entry.hex);
      const border = swatchBorder(entry.hex);
      return `
        <g>
          <rect x="${x}" y="${y}" width="${tileWidth}" height="${tileHeight}" rx="12" fill="#111827" stroke="#243041" stroke-width="1"/>
          <rect x="${x + 14}" y="${y + 14}" width="62" height="62" rx="10" fill="${entry.hex}" stroke="${border}" stroke-width="3"/>
          <text x="${x + 45}" y="${y + 51}" text-anchor="middle" font-size="13" font-weight="700" fill="${textColor}">${entry.hex === "#000000" ? "CB" : ""}</text>
          <text x="${x + 88}" y="${y + 38}" font-size="20" font-weight="700" fill="#F8FAFC">${escapeXml(entry.label)}</text>
          <text x="${x + 88}" y="${y + 64}" font-size="15" font-weight="500" fill="#A7B0BF">${entry.hex}</text>
        </g>
      `;
    })
    .join("");

  return `
    <svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
      <defs>
        <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stop-color="#0B1117"/>
          <stop offset="100%" stop-color="#162119"/>
        </linearGradient>
      </defs>
      <rect width="100%" height="100%" fill="url(#bg)"/>
      <rect x="14" y="14" width="${width - 28}" height="${height - 28}" rx="18" fill="none" stroke="#2F3D2F" stroke-width="2"/>
      <text x="${padding}" y="${padding + 28}" font-family="Arial, Helvetica, sans-serif" font-size="30" font-weight="800" fill="#D6B15E">${escapeXml(selfRoleGroups[groupKey].emoji)} ${paletteTitles[groupKey]}</text>
      <text x="${padding}" y="${padding + 56}" font-family="Arial, Helvetica, sans-serif" font-size="16" font-weight="500" fill="#CBD5E1">Muestras generadas desde el color real de los roles de Discord.</text>
      <g font-family="Arial, Helvetica, sans-serif">${tiles}</g>
    </svg>
  `;
}

export async function generateColorPalette(input: {
  guildId: string;
  groupKey: ColorSelfRoleGroupKey;
  entries: ColorPaletteEntry[];
}): Promise<string> {
  mkdirSync(paletteDir(input.guildId), { recursive: true });
  const file = palettePath(input.guildId, input.groupKey);
  await sharp(Buffer.from(paletteSvg(input.groupKey, input.entries))).png().toFile(file);
  writeFileSync(manifestPath(input.guildId, input.groupKey), JSON.stringify({ groupKey: input.groupKey, entries: input.entries }, null, 2));
  return file;
}

export async function ensureColorPalette(
  guild: Guild,
  repo: SelfRoleRepository,
  groupKey: ColorSelfRoleGroupKey,
  force = false,
): Promise<string> {
  const entries = await paletteEntriesForGroup(guild, repo, groupKey);
  if (entries.length === 0) throw new Error("No hay colores disponibles para esta paleta.");
  const manifest = { groupKey, entries };
  const file = palettePath(guild.id, groupKey);
  if (!force && existsSync(file) && manifestEquals(manifest, readManifest(guild.id, groupKey))) return file;
  return generateColorPalette({ guildId: guild.id, groupKey, entries });
}

export async function regenerateColorPalettes(guild: Guild, repo: SelfRoleRepository): Promise<Record<ColorSelfRoleGroupKey, string | null>> {
  const result: Record<ColorSelfRoleGroupKey, string | null> = {
    COLOR_CLASSIC: null,
    COLOR_PASTEL: null,
    COLOR_DARK: null,
  };
  for (const groupKey of colorGroupKeys) {
    result[groupKey] = await ensureColorPalette(guild, repo, groupKey, true).catch((error) => {
      logger.warn({ error, guildId: guild.id, groupKey }, "No se pudo regenerar paleta de colores");
      return null;
    });
  }
  return result;
}

export async function paletteAttachmentForGroup(
  guild: Guild,
  repo: SelfRoleRepository,
  groupKey: string,
): Promise<{ file: AttachmentBuilder; title: string } | null> {
  if (!isColorGroupKey(groupKey as any)) return null;
  const key = groupKey as ColorSelfRoleGroupKey;
  const filePath = await ensureColorPalette(guild, repo, key);
  return {
    file: new AttachmentBuilder(filePath, { name: paletteFilenames[key] }),
    title: `${selfRoleGroups[key].emoji} ${paletteTitles[key]}`,
  };
}
