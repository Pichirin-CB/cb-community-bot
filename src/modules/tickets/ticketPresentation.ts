import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
  PermissionFlagsBits,
  StringSelectMenuBuilder,
  type Guild,
  type GuildMember,
  type OverwriteResolvable,
  type Role,
} from "discord.js";
import { brand, embeds } from "../embeds/embedService.js";
import type { GuildConfig } from "../../repositories/guildConfigRepository.js";
import type { TicketRow } from "../../repositories/ticketRepository.js";

export const ticketBannerFilename = brand.assets.banner.filename;

export interface TicketCategoryDefinition {
  value: string;
  label: string;
  description: string;
  emoji: string;
  channelPrefix: string;
  title: string;
  instructions: string[];
}

export const ticketCategories: TicketCategoryDefinition[] = [
  {
    value: "general_support",
    label: "AYUDA GENERAL",
    description: "Preguntas sobre la comunidad, sus canales, funciones o normas.",
    emoji: "🆘",
    channelPrefix: "ayuda",
    title: "Ayuda general",
    instructions: [
      "Explica claramente tu pregunta o problema.",
      "Indica en qué parte de la comunidad necesitas ayuda.",
    ],
  },
  {
    value: "technical_support",
    label: "SOPORTE TÉCNICO",
    description: "Problemas con bots, canales, funciones o servicios de la comunidad.",
    emoji: "🛠️",
    channelPrefix: "soporte",
    title: "Soporte técnico",
    instructions: [
      "Describe el problema con el mayor detalle posible.",
      "Incluye capturas o mensajes de error cuando sean útiles.",
    ],
  },
  {
    value: "report",
    label: "REPORTAR USUARIO",
    description: "Reporta una conducta o situación que infrinja las normas.",
    emoji: "🚨",
    channelPrefix: "reporte",
    title: "Reporte de usuario",
    instructions: [
      "Indica qué ocurrió y cuándo sucedió.",
      "Proporciona pruebas o capturas cuando estén disponibles.",
      "No compartas información personal innecesaria.",
    ],
  },
  {
    value: "appeal",
    label: "APELACIÓN",
    description: "Solicita una revisión de una sanción o decisión del equipo.",
    emoji: "⚖️",
    channelPrefix: "apelacion",
    title: "Apelación",
    instructions: [
      "Indica la sanción o decisión que deseas apelar.",
      "Explica claramente tu situación.",
      "Aporta cualquier información relevante para la revisión.",
    ],
  },
  {
    value: "suggestion",
    label: "SUGERENCIA",
    description: "Comparte ideas para mejorar la comunidad.",
    emoji: "💡",
    channelPrefix: "sugerencia",
    title: "Sugerencia",
    instructions: [
      "Explica tu propuesta de forma clara.",
      "Indica qué problema resolvería o qué mejoraría.",
    ],
  },
  {
    value: "partnership",
    label: "COLABORACIÓN",
    description: "Propuestas de colaboración, proyectos o asociaciones.",
    emoji: "🤝",
    channelPrefix: "colaboracion",
    title: "Colaboración",
    instructions: [
      "Presenta brevemente tu proyecto o comunidad.",
      "Explica qué tipo de colaboración propones.",
      "Incluye un medio de contacto si es necesario.",
    ],
  },
  {
    value: "community_request",
    label: "SOLICITUD",
    description: "Solicitudes relacionadas con funciones o servicios de la comunidad.",
    emoji: "📋",
    channelPrefix: "solicitud",
    title: "Solicitud",
    instructions: [
      "Explica qué necesitas solicitar.",
      "Incluye toda la información necesaria para procesar la solicitud.",
    ],
  },
  {
    value: "other",
    label: "OTRO",
    description: "Cualquier asunto que no corresponda a las categorías anteriores.",
    emoji: "💬",
    channelPrefix: "ticket",
    title: "Otro asunto",
    instructions: [
      "Explica claramente el motivo de tu ticket.",
      "Incluye toda la información que pueda ayudar al equipo.",
    ],
  },
];

export function ticketCategory(value: string): TicketCategoryDefinition {
  return ticketCategories.find((category) => category.value === value) ?? ticketCategories[0]!;
}

export function ticketPanelAttachments() {
  return embeds.officialBannerFiles();
}

export function buildTicketPanelEmbed(): EmbedBuilder {
  const embed = embeds.ticket(
    "🎫 CENTRO DE AYUDA",
    [
      "¿Necesitas ayuda?",
      "",
      "Selecciona debajo el tipo de solicitud que mejor corresponda con tu situación.",
      "Nuestro equipo revisará tu ticket y te ayudará lo antes posible.",
      "",
      "📌 **Antes de abrir un ticket:**",
      "• Explica claramente el motivo de tu solicitud.",
      "• Aporta capturas o información relevante cuando sea necesario.",
      "• Evita abrir varios tickets para el mismo asunto.",
      "• No compartas contraseñas, tokens ni información sensible.",
    ].join("\n"),
  );

  if (embeds.hasOfficialBanner()) {
    embed.setImage(brand.assets.banner.url);
  }

  return embed;
}

export function buildTicketOpenEmbed(ticket: TicketRow, member: GuildMember): EmbedBuilder {
  const category = ticketCategory(ticket.category);

  return embeds.ticket(
    "🎫 TICKET CREADO",
    [
      `Hola ${member} 👋`,
      "",
      "Tu solicitud ha sido creada correctamente.",
      "",
      `Categoría: ${category.emoji} ${category.title}`,
      `Caso: ${ticket.ticket_code}`,
      "",
      "Describe tu situación con todos los detalles posibles.",
      "",
      ...category.instructions.map((instruction) => `• ${instruction}`),
      "",
      "Un miembro del equipo revisará tu solicitud.",
      "Por favor, espera a que el equipo pueda atenderte.",
    ].join("\n"),
  );
}

export function buildTicketPanelMenu(): ActionRowBuilder<StringSelectMenuBuilder> {
  return new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
    new StringSelectMenuBuilder()
      .setCustomId("ticket:create")
      .setPlaceholder("🎫 Selecciona el tipo de solicitud...")
      .addOptions(
        ...ticketCategories.map((category) => ({
          label: category.label,
          description: category.description,
          value: category.value,
          emoji: category.emoji,
        })),
      ),
  );
}

export function sanitizeTicketUsername(username: string): string {
  const sanitized = username
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 32);

  return sanitized || "usuario";
}

export function buildTicketChannelName(
  categoryValue: string,
  username: string,
  existingNames: Set<string> = new Set(),
): string {
  const category = ticketCategory(categoryValue);
  const base = `${category.channelPrefix}-${sanitizeTicketUsername(username)}`.slice(0, 90);

  if (!existingNames.has(base)) {
    return base;
  }

  for (let index = 2; index < 100; index += 1) {
    const suffix = `-${index}`;
    const candidate = `${base.slice(0, 90 - suffix.length)}${suffix}`;

    if (!existingNames.has(candidate)) {
      return candidate;
    }
  }

  return `${base.slice(0, 83)}-${Date.now().toString(36).slice(-6)}`;
}

export function openTicketActions(): ActionRowBuilder<ButtonBuilder> {
  return new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId("ticket:claim")
      .setLabel("🙋 Reclamar")
      .setStyle(ButtonStyle.Primary),
    new ButtonBuilder()
      .setCustomId("ticket:close")
      .setLabel("🔒 Cerrar")
      .setStyle(ButtonStyle.Secondary),
  );
}

export function closedTicketActions(): ActionRowBuilder<ButtonBuilder> {
  return new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId("ticket:reopen")
      .setLabel("🔓 Reabrir")
      .setStyle(ButtonStyle.Success),
    new ButtonBuilder()
      .setCustomId("ticket:transcript")
      .setLabel("📄 Transcript")
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId("ticket:delete")
      .setLabel("🗑️ Eliminar")
      .setStyle(ButtonStyle.Danger),
  );
}

export function requiredTicketConfig(config: GuildConfig): string[] {
  const missing: string[] = [];

  if (!config.ticket_category_id) {
    missing.push("ticket_category_id");
  }

  if (!config.support_role_id) {
    missing.push("support_role_id");
  }

  if (!config.administrator_role_id) {
    missing.push("administrator_role_id");
  }

  if (!config.founder_role_id) {
    missing.push("founder_role_id");
  }

  return missing;
}

export function ticketStaffRoleIds(config: GuildConfig): string[] {
  return [
    config.support_role_id,
    config.administrator_role_id,
    config.founder_role_id,
  ].filter((roleId): roleId is string => Boolean(roleId));
}

export function buildTicketPermissionOverwrites(input: {
  guild: Guild;
  ownerUserId: string;
  botUserId: string;
  staffRoles: Role[];
}): OverwriteResolvable[] {
  return [
    {
      id: input.guild.roles.everyone.id,
      deny: [PermissionFlagsBits.ViewChannel],
    },
    {
      id: input.ownerUserId,
      allow: [
        PermissionFlagsBits.ViewChannel,
        PermissionFlagsBits.SendMessages,
        PermissionFlagsBits.ReadMessageHistory,
        PermissionFlagsBits.AttachFiles,
      ],
    },
    {
      id: input.botUserId,
      allow: [
        PermissionFlagsBits.ViewChannel,
        PermissionFlagsBits.SendMessages,
        PermissionFlagsBits.ReadMessageHistory,
        PermissionFlagsBits.ManageChannels,
      ],
    },
    ...input.staffRoles.map((role) => ({
      id: role.id,
      allow: [
        PermissionFlagsBits.ViewChannel,
        PermissionFlagsBits.SendMessages,
        PermissionFlagsBits.ReadMessageHistory,
        PermissionFlagsBits.AttachFiles,
      ],
    })),
  ];
}