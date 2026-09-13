import { ChannelType, MessageFlags, SlashCommandBuilder } from "discord.js";
import type { BotCommand } from "../types/context.js";
import type { GeneratorType, PrivacyMode } from "../repositories/voiceGeneratorRepository.js";
import { requirePermission } from "../permissions/guards.js";
import type { PermissionKey } from "../permissions/staffLevels.js";
import { UserFacingError } from "../utils/errors.js";
import { embeds } from "../utils/responses.js";
import { defaultNameTemplate, defaultPrivacy } from "../modules/voice/voicePolicy.js";
import { validateNameTemplate } from "../modules/voice/nameTemplate.js";

const generatorTypes: GeneratorType[] = ["PUBLIC", "SUPPORT", "STAFF"];
const privacyModes: PrivacyMode[] = ["PUBLIC", "LOCKED", "PRIVATE"];

export function voiceGeneratorPermission(subcommand: string): PermissionKey {
  void subcommand;
  return "generator";
}

function generatorLine(generator: any, roles: string[] = []): string {
  return [
    `ID: ${generator.id}`,
    `tipo: ${generator.type}`,
    `generador: <#${generator.generator_channel_id}>`,
    `categoria: <#${generator.target_category_id}>`,
    `limite: ${generator.default_user_limit}/${generator.max_user_limit}`,
    `privacidad: ${generator.privacy_mode}`,
    `activo: ${generator.enabled ? "si" : "no"}`,
    roles.length ? `roles: ${roles.map((id) => `<@&${id}>`).join(", ")}` : null,
  ]
    .filter(Boolean)
    .join(" | ");
}

export const voiceGeneratorCommand: BotCommand = {
  data: new SlashCommandBuilder()
    .setName("voice-generator")
    .setDescription("Gestiona generadores de salas temporales.")
    .addSubcommand((sub) =>
      sub
        .setName("create")
        .setDescription("Crea un generador de voz.")
        .addChannelOption((option) =>
          option.setName("canal").setDescription("Canal generador.").setRequired(true).addChannelTypes(ChannelType.GuildVoice),
        )
        .addChannelOption((option) =>
          option
            .setName("categoria")
            .setDescription("Categoria destino de las salas.")
            .setRequired(true)
            .addChannelTypes(ChannelType.GuildCategory),
        )
        .addStringOption((option) =>
          option
            .setName("tipo")
            .setDescription("Tipo de generador.")
            .setRequired(true)
            .addChoices(...generatorTypes.map((type) => ({ name: type.toLowerCase(), value: type }))),
        )
        .addIntegerOption((option) => option.setName("limite").setDescription("Limite por defecto.").setMinValue(0).setMaxValue(99))
        .addIntegerOption((option) => option.setName("maximo").setDescription("Limite maximo editable.").setMinValue(0).setMaxValue(99))
        .addStringOption((option) => option.setName("nombre").setDescription("Template, ej: 🔊・{displayname}.").setMaxLength(80))
        .addStringOption((option) =>
          option
            .setName("privacidad")
            .setDescription("Privacidad inicial.")
            .addChoices(...privacyModes.map((mode) => ({ name: mode.toLowerCase(), value: mode }))),
        )
        .addChannelOption((option) =>
          option
            .setName("alertas")
            .setDescription("Canal de alertas para soporte.")
            .addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement),
        )
        .addRoleOption((option) => option.setName("rol_autorizado").setDescription("Rol autorizado adicional.")),
    )
    .addSubcommand((sub) =>
      sub
        .setName("edit")
        .setDescription("Edita un generador.")
        .addIntegerOption((option) => option.setName("id").setDescription("ID interno.").setRequired(true))
        .addChannelOption((option) => option.setName("canal").setDescription("Nuevo canal generador.").addChannelTypes(ChannelType.GuildVoice))
        .addChannelOption((option) =>
          option.setName("categoria").setDescription("Nueva categoria destino.").addChannelTypes(ChannelType.GuildCategory),
        )
        .addIntegerOption((option) => option.setName("limite").setDescription("Limite por defecto.").setMinValue(0).setMaxValue(99))
        .addIntegerOption((option) => option.setName("maximo").setDescription("Limite maximo.").setMinValue(0).setMaxValue(99))
        .addStringOption((option) => option.setName("nombre").setDescription("Template de nombre.").setMaxLength(80))
        .addStringOption((option) =>
          option.setName("privacidad").setDescription("Privacidad.").addChoices(...privacyModes.map((mode) => ({ name: mode.toLowerCase(), value: mode }))),
        ),
    )
    .addSubcommand((sub) => sub.setName("delete").setDescription("Elimina un generador.").addIntegerOption((option) => option.setName("id").setDescription("ID interno.").setRequired(true)))
    .addSubcommand((sub) => sub.setName("list").setDescription("Lista generadores."))
    .addSubcommand((sub) => sub.setName("info").setDescription("Detalle de generador.").addIntegerOption((option) => option.setName("id").setDescription("ID interno.").setRequired(true)))
    .addSubcommand((sub) => sub.setName("enable").setDescription("Activa un generador.").addIntegerOption((option) => option.setName("id").setDescription("ID interno.").setRequired(true)))
    .addSubcommand((sub) => sub.setName("disable").setDescription("Desactiva un generador.").addIntegerOption((option) => option.setName("id").setDescription("ID interno.").setRequired(true))),
  level: "generator",
  description: "Administracion de generadores de voz",

  async execute(interaction, context) {
    const guildId = interaction.guildId!;
    const sub = interaction.options.getSubcommand();
    requirePermission(interaction, context, voiceGeneratorPermission(sub));

    if (sub === "create") {
      const type = interaction.options.getString("tipo", true) as GeneratorType;
      const template = interaction.options.getString("nombre", false) ?? defaultNameTemplate(type);
      const templateError = validateNameTemplate(template);
      if (templateError) throw new UserFacingError(templateError);
      const generator = context.repositories.generators.create({
        guildId,
        generatorChannelId: interaction.options.getChannel("canal", true).id,
        targetCategoryId: interaction.options.getChannel("categoria", true).id,
        type,
        nameTemplate: template,
        defaultUserLimit: interaction.options.getInteger("limite", false) ?? 0,
        maxUserLimit: interaction.options.getInteger("maximo", false) ?? 10,
        privacyMode: (interaction.options.getString("privacidad", false) as PrivacyMode | null) ?? defaultPrivacy(type),
        supportAlertChannelId: interaction.options.getChannel("alertas", false)?.id ?? null,
      });
      const role = interaction.options.getRole("rol_autorizado", false);
      if (role) context.repositories.generators.addRole(generator.id, role.id);
      context.repositories.audit.record({ guildId, eventType: "VOICE_GENERATOR_CREATED", actorUserId: interaction.user.id, metadata: { id: generator.id } });
      await interaction.reply({ embeds: [embeds.success("Generador creado", generatorLine(generator, role ? [role.id] : []))], flags: MessageFlags.Ephemeral });
      return;
    }

    if (sub === "edit") {
      const id = interaction.options.getInteger("id", true);
      const template = interaction.options.getString("nombre", false);
      if (template) {
        const error = validateNameTemplate(template);
        if (error) throw new UserFacingError(error);
      }
      const updated = context.repositories.generators.update(id, {
        generatorChannelId: interaction.options.getChannel("canal", false)?.id,
        targetCategoryId: interaction.options.getChannel("categoria", false)?.id,
        defaultUserLimit: interaction.options.getInteger("limite", false) ?? undefined,
        maxUserLimit: interaction.options.getInteger("maximo", false) ?? undefined,
        nameTemplate: template ?? undefined,
        privacyMode: (interaction.options.getString("privacidad", false) as PrivacyMode | null) ?? undefined,
      });
      if (!updated) throw new UserFacingError("Generador no encontrado.");
      context.repositories.audit.record({ guildId, eventType: "VOICE_GENERATOR_UPDATED", actorUserId: interaction.user.id, metadata: { id } });
      await interaction.reply({ embeds: [embeds.success("Generador actualizado", generatorLine(updated, context.repositories.generators.roles(id)))], flags: MessageFlags.Ephemeral });
      return;
    }

    if (sub === "delete") {
      const id = interaction.options.getInteger("id", true);
      if (!context.repositories.generators.delete(id)) throw new UserFacingError("Generador no encontrado.");
      context.repositories.audit.record({ guildId, eventType: "VOICE_GENERATOR_DELETED", actorUserId: interaction.user.id, metadata: { id } });
      await interaction.reply({ embeds: [embeds.success("Generador eliminado", `ID ${id}`)], flags: MessageFlags.Ephemeral });
      return;
    }

    if (sub === "enable" || sub === "disable") {
      const id = interaction.options.getInteger("id", true);
      if (!context.repositories.generators.setEnabled(id, sub === "enable")) throw new UserFacingError("Generador no encontrado.");
      await interaction.reply({ embeds: [embeds.success("Generador actualizado", `${sub === "enable" ? "Activado" : "Desactivado"} ID ${id}`)], flags: MessageFlags.Ephemeral });
      return;
    }

    if (sub === "info") {
      const id = interaction.options.getInteger("id", true);
      const generator = context.repositories.generators.getById(id);
      if (!generator) throw new UserFacingError("Generador no encontrado.");
      await interaction.reply({ embeds: [embeds.info("Generador Voice", generatorLine(generator, context.repositories.generators.roles(id)))], flags: MessageFlags.Ephemeral });
      return;
    }

    const generators = context.repositories.generators.list(guildId);
    const description = generators.length ? generators.map((generator) => generatorLine(generator, context.repositories.generators.roles(generator.id))).join("\n") : "No hay generadores configurados.";
    await interaction.reply({ embeds: [embeds.info("Generadores Voice", description)], flags: MessageFlags.Ephemeral });
  },
};
