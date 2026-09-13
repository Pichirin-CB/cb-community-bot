import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
  StringSelectMenuBuilder,
  type APISelectMenuOption,
} from "discord.js";
import { brand, embeds } from "../embeds/embedService.js";
import type { GuildConfig } from "../../repositories/guildConfigRepository.js";
import type { SelfRoleOptionRow } from "../../repositories/selfRoleRepository.js";

export const selfRoleCustomPrefix = "selfrole";

export const selfRoleGroupKeys = ["COLOR_CLASSIC", "COLOR_PASTEL", "COLOR_DARK", "PREFERENCES"] as const;
export type SelfRoleGroupKey = (typeof selfRoleGroupKeys)[number];
export type ColorSelfRoleGroupKey = Extract<SelfRoleGroupKey, "COLOR_CLASSIC" | "COLOR_PASTEL" | "COLOR_DARK">;

export interface SelfRoleGroupDefinition {
  key: SelfRoleGroupKey;
  type: "color" | "preferences";
  label: string;
  placeholder: string;
  sortOrder: number;
  emoji: string;
}

export const selfRoleGroups: Record<SelfRoleGroupKey, SelfRoleGroupDefinition> = {
  COLOR_CLASSIC: {
    key: "COLOR_CLASSIC",
    type: "color",
    label: "Colores clasicos",
    placeholder: "🎨 Colores clasicos",
    sortOrder: 10,
    emoji: "🎨",
  },
  COLOR_PASTEL: {
    key: "COLOR_PASTEL",
    type: "color",
    label: "Colores pastel",
    placeholder: "🌸 Colores pastel",
    sortOrder: 20,
    emoji: "🌸",
  },
  COLOR_DARK: {
    key: "COLOR_DARK",
    type: "color",
    label: "Colores oscuros",
    placeholder: "🌑 Colores oscuros",
    sortOrder: 30,
    emoji: "🌑",
  },
  PREFERENCES: {
    key: "PREFERENCES",
    type: "preferences",
    label: "Preferencias",
    placeholder: "⚙️ Preferencias",
    sortOrder: 40,
    emoji: "⚙️",
  },
};

export const colorGroupKeys: ColorSelfRoleGroupKey[] = ["COLOR_CLASSIC", "COLOR_PASTEL", "COLOR_DARK"];
export const preferenceGroupKey: SelfRoleGroupKey = "PREFERENCES";

export const selfRoleProtectedNameFragments = [
  "fundador",
  "admin",
  "moderador",
  "soporte",
  "valle de titanes core",
  "dino lover",
  "streamer",
  "tier 1",
  "tier 2",
  "tier 3",
  "tier 4",
  "tier 5",
  "server booster",
  "free pack",
];

export const classicColorNames = [
  "Negro",
  "Gris",
  "Blanco",
  "Rosa",
  "Morado",
  "Azul",
  "Cian",
  "Verde",
  "Amarillo",
  "Naranja",
  "Coral",
  "Rojo",
  "Fucsia",
  "Magenta",
  "Violeta",
  "Cielo",
  "Aguamarina",
  "Lima",
  "Mostaza",
  "Cafe",
];

export const pastelColorNames = [
  "Rosa Pastel",
  "Morado Pastel",
  "Azul Pastel",
  "Cian Pastel",
  "Verde Pastel",
  "Amarillo Pastel",
  "Naranja Pastel",
  "Rojo Pastel",
];

export const darkColorNames = [
  "Rojo Oscuro",
  "Rosa Oscuro",
  "Morado Oscuro",
  "Azul Oscuro",
  "Cian Oscuro",
  "Verde Oscuro",
  "Amarillo Oscuro",
  "Naranja Oscuro",
];

export const preferenceRoleNames = ["Herbivoro", "Omnivoro", "Carnivoro"];

export function isSelfRoleGroupKey(value: string): value is SelfRoleGroupKey {
  return selfRoleGroupKeys.includes(value as SelfRoleGroupKey);
}

export function isColorGroupKey(value: SelfRoleGroupKey): value is ColorSelfRoleGroupKey {
  return colorGroupKeys.includes(value as ColorSelfRoleGroupKey);
}

export function normalizeSelfRoleName(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim()
    .replace(/\s+/g, " ")
    .toLowerCase();
}

export function protectedSelfRoleIds(config: GuildConfig, botRoleId?: string | null): Set<string> {
  return new Set(
    [
      config.founder_role_id,
      config.administrator_role_id,
      config.developer_role_id,
      config.support_role_id,
      config.customer_role_id,
      config.member_role_id,
      config.server_booster_role_id,
      config.bots_role_id,
      botRoleId,
    ].filter((roleId): roleId is string => Boolean(roleId)),
  );
}

export function isProtectedSelfRole(input: {
  roleId: string;
  roleName: string;
  config: GuildConfig;
  botRoleId?: string | null;
  managed?: boolean;
}): boolean {
  if (input.managed) return true;
  if (protectedSelfRoleIds(input.config, input.botRoleId).has(input.roleId)) return true;
  const normalized = normalizeSelfRoleName(input.roleName);
  return selfRoleProtectedNameFragments.some((fragment) => normalized.includes(fragment));
}

export function plannedColorRoleChanges(
  currentRoleIds: Iterable<string>,
  configuredColorRoleIds: Iterable<string>,
  selectedRoleId: string | null,
): { add: string[]; remove: string[] } {
  const current = new Set(currentRoleIds);
  const colors = new Set(configuredColorRoleIds);
  const remove = [...current].filter((roleId) => colors.has(roleId) && roleId !== selectedRoleId);
  const add = selectedRoleId && !current.has(selectedRoleId) ? [selectedRoleId] : [];
  return { add, remove };
}

export function plannedMultiRoleChanges(
  currentRoleIds: Iterable<string>,
  configuredRoleIds: Iterable<string>,
  selectedRoleIds: Iterable<string>,
): { add: string[]; remove: string[] } {
  const current = new Set(currentRoleIds);
  const configured = new Set(configuredRoleIds);
  const selected = new Set(selectedRoleIds);
  return {
    add: [...selected].filter((roleId) => configured.has(roleId) && !current.has(roleId)),
    remove: [...current].filter((roleId) => configured.has(roleId) && !selected.has(roleId)),
  };
}

export function selfRolePanelAttachments() {
  return embeds.officialBannerFiles();
}

export function buildSelfRolePanelEmbed(): EmbedBuilder {
  const embed = embeds.official(
    "🎨 PERSONALIZA TU PERFIL",
    [
      "Dale tu propio estilo a tu perfil dentro de CB Studios.",
      "",
      "🎨 **COLOR**",
      "Elige como quieres que se vea tu nombre.",
      "Solo puedes tener un color activo.",
      "",
      "⚙️ **PREFERENCIAS**",
      "Selecciona que tipo de tecnologias prefieres jugar.",
      "Puedes elegir una o varias opciones.",
      "",
      "🌿 Herbivoro",
      "🐟 Omnivoro",
      "🥩 Carnivoro",
    ].join("\n"),
    "welcome",
    true,
  );
  return embed.setFooter({ text: brand.footer });
}

function optionToSelectOption(option: SelfRoleOptionRow): APISelectMenuOption {
  return {
    label: option.label.slice(0, 100),
    value: option.role_id,
  };
}

export function optionsByGroup(options: SelfRoleOptionRow[]): Map<SelfRoleGroupKey, SelfRoleOptionRow[]> {
  const grouped = new Map<SelfRoleGroupKey, SelfRoleOptionRow[]>();
  for (const key of selfRoleGroupKeys) grouped.set(key, []);
  for (const option of options) {
    if (!isSelfRoleGroupKey(option.group_key)) continue;
    grouped.get(option.group_key)!.push(option);
  }
  return grouped;
}

export function buildSelfRolePanelComponents(
  options: SelfRoleOptionRow[],
): Array<ActionRowBuilder<StringSelectMenuBuilder> | ActionRowBuilder<ButtonBuilder>> {
  const grouped = optionsByGroup(options);
  const rows: Array<ActionRowBuilder<StringSelectMenuBuilder> | ActionRowBuilder<ButtonBuilder>> = [];
  let hasColorOptions = false;

  for (const key of colorGroupKeys) {
    const groupOptions = grouped.get(key) ?? [];
    if (groupOptions.length === 0) continue;
    hasColorOptions = true;
    rows.push(
      new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
        new StringSelectMenuBuilder()
          .setCustomId(`${selfRoleCustomPrefix}:color:${key}`)
          .setPlaceholder(selfRoleGroups[key].placeholder)
          .setMinValues(1)
          .setMaxValues(1)
          .addOptions(...groupOptions.slice(0, 25).map(optionToSelectOption)),
      ),
    );
  }

  const preferenceOptions = grouped.get(preferenceGroupKey) ?? [];
  if (preferenceOptions.length > 0) {
    rows.push(
      new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
        new StringSelectMenuBuilder()
          .setCustomId(`${selfRoleCustomPrefix}:preferences:${preferenceGroupKey}`)
          .setPlaceholder(selfRoleGroups.PREFERENCES.placeholder)
          .setMinValues(0)
          .setMaxValues(Math.min(preferenceOptions.length, 25))
          .addOptions(...preferenceOptions.slice(0, 25).map(optionToSelectOption)),
      ),
    );
  }

  if (hasColorOptions) {
    rows.push(
      new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder()
          .setCustomId(`${selfRoleCustomPrefix}:palettes`)
          .setLabel("Ver paletas")
          .setEmoji("👁️")
          .setStyle(ButtonStyle.Secondary),
        new ButtonBuilder()
          .setCustomId(`${selfRoleCustomPrefix}:color:remove`)
          .setLabel("Quitar mi color")
          .setEmoji("❌")
          .setStyle(ButtonStyle.Secondary),
      ),
    );
  }

  return rows;
}
