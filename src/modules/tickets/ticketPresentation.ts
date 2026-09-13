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
    description: "Preguntas sobre la comunidad, reglas o funcionamiento.",
    emoji: "🆘",
    channelPrefix: "soporte",
    title: "Ayuda general",
    instructions: ["Explica claramente tu pregunta o problema.", "Indica en que parte de la comunidad necesitas ayuda."],
  },
  {
    value: "customer_support",
    label: "PEDIDO O COMPRA",
    description: "Seguimiento y entrega de productos o servicios comprados.",
    emoji: "📦",
    channelPrefix: "pedido",
    title: "Pedido o compra",
    instructions: ["Indica el producto o servicio adquirido.", "Incluye tu numero de pedido o comprobante sin datos sensibles."],
  },
  {
    value: "technical_support",
    label: "SOPORTE TECNICO",
    description: "Problemas al instalar, configurar o usar una compra.",
    emoji: "🚨",
    channelPrefix: "soporte-tecnico",
    title: "Soporte tecnico",
    instructions: ["Indica el producto o servicio afectado.", "Describe el problema y adjunta capturas o errores sin datos secretos."],
  },
  {
    value: "bug_report",
    label: "PAGOS Y FACTURACION",
    description: "Pagos rechazados, comprobantes, cobros y facturas.",
    emoji: "💳",
    channelPrefix: "pagos",
    title: "Pagos y facturacion",
    instructions: ["Indica el producto y la fecha aproximada del pago.", "No compartas tarjetas, claves, contrasenas ni datos bancarios completos."],
  },
  {
    value: "purchase_question",
    label: "CONSULTA DE COMPRA",
    description: "Precios, disponibilidad y recomendaciones antes de comprar.",
    emoji: "💰",
    channelPrefix: "consulta-compra",
    title: "Consulta de compra",
    instructions: ["Indica que producto o servicio te interesa.", "Explica tus necesidades y presupuesto aproximado."],
  },
  {
    value: "partnership",
    label: "ALIANZAS Y NEGOCIOS",
    description: "Colaboraciones, patrocinios y propuestas comerciales.",
    emoji: "💎",
    channelPrefix: "alianza",
    title: "Alianzas y negocios",
    instructions: ["Presenta tu organizacion, proyecto o audiencia.", "Incluye una propuesta concreta y un medio de contacto."],
  },
  {
    value: "development_inquiry",
    label: "GARANTIAS Y REEMBOLSOS",
    description: "Devoluciones, reemplazos, garantias o cancelaciones.",
    emoji: "🧾",
    channelPrefix: "garantia",
    title: "Garantias y reembolsos",
    instructions: ["Indica el producto, servicio y numero de pedido.", "Explica el motivo e incluye evidencias cuando corresponda."],
  },
  {
    value: "other",
    label: "RENTA DE SERVIDORES",
    description: "Consultas, planes y soporte para renta de servidores.",
    emoji: "🖥️",
    channelPrefix: "renta-servidor",
    title: "Renta de servidores",
    instructions: ["Indica el tipo de servidor que necesitas.", "Incluye capacidad, duracion y presupuesto aproximados."],
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
      "Selecciona debajo el tipo de solicitud que mejor corresponda con tu problema.",
      "Nuestro equipo atenderá tu ticket tan pronto como sea posible.",
      "",
      "📌 **Antes de abrir uno:**",
      "• Explica claramente tu problema.",
      "• Aporta capturas o información cuando sea necesario.",
      "• Evita abrir varios tickets para el mismo asunto.",
    ].join("\n"),
  );
  if (embeds.hasOfficialBanner()) embed.setImage(brand.assets.banner.url);
  return embed;
}

export function buildTicketOpenEmbed(ticket: TicketRow, member: GuildMember): EmbedBuilder {
  const category = ticketCategory(ticket.category);
  return embeds
    .ticket(
      "🎫 TICKET DE SOPORTE",
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
        "Un miembro del equipo atenderá tu solicitud.",
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

export function buildTicketChannelName(categoryValue: string, username: string, existingNames: Set<string> = new Set()): string {
  const category = ticketCategory(categoryValue);
  const base = `${category.channelPrefix}-${sanitizeTicketUsername(username)}`.slice(0, 90);
  if (!existingNames.has(base)) return base;
  for (let index = 2; index < 100; index += 1) {
    const suffix = `-${index}`;
    const candidate = `${base.slice(0, 90 - suffix.length)}${suffix}`;
    if (!existingNames.has(candidate)) return candidate;
  }
  return `${base.slice(0, 83)}-${Date.now().toString(36).slice(-6)}`;
}

export function openTicketActions(): ActionRowBuilder<ButtonBuilder> {
  return new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder().setCustomId("ticket:claim").setLabel("🙋 Reclamar").setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId("ticket:close").setLabel("🔒 Cerrar").setStyle(ButtonStyle.Secondary),
  );
}

export function closedTicketActions(): ActionRowBuilder<ButtonBuilder> {
  return new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder().setCustomId("ticket:reopen").setLabel("🔓 Reabrir").setStyle(ButtonStyle.Success),
    new ButtonBuilder().setCustomId("ticket:transcript").setLabel("📄 Transcript").setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId("ticket:delete").setLabel("🗑️ Eliminar").setStyle(ButtonStyle.Danger),
  );
}

export function requiredTicketConfig(config: GuildConfig): string[] {
  const missing: string[] = [];
  if (!config.ticket_category_id) missing.push("ticket_category_id");
  if (!config.support_role_id) missing.push("support_role_id");
  if (!config.administrator_role_id) missing.push("administrator_role_id");
  if (!config.founder_role_id) missing.push("founder_role_id");
  return missing;
}

export function ticketStaffRoleIds(config: GuildConfig): string[] {
  return [config.support_role_id, config.administrator_role_id, config.founder_role_id].filter((roleId): roleId is string => Boolean(roleId));
}

export function buildTicketPermissionOverwrites(input: {
  guild: Guild;
  ownerUserId: string;
  botUserId: string;
  staffRoles: Role[];
}): OverwriteResolvable[] {
  return [
    { id: input.guild.roles.everyone.id, deny: [PermissionFlagsBits.ViewChannel] },
    {
      id: input.ownerUserId,
      allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory, PermissionFlagsBits.AttachFiles],
    },
    {
      id: input.botUserId,
      allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory, PermissionFlagsBits.ManageChannels],
    },
    ...input.staffRoles.map((role) => ({
      id: role.id,
      allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory, PermissionFlagsBits.AttachFiles],
    })),
  ];
}
