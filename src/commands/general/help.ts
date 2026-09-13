import { SlashCommandBuilder } from "discord.js";
import type { BotCommand } from "../../types/command.js";
import { embeds } from "../../modules/embeds/embedService.js";
import { requireGuildInteraction } from "../../permissions/guards.js";
import { hasInternalPermission, type PermissionKey } from "../../permissions/staffLevels.js";

export const helpCommand: BotCommand = {
  data: new SlashCommandBuilder().setName("help").setDescription("Muestra los comandos disponibles para ti."),
  level: "info",
  description: "Ayuda contextual",
  async execute(interaction, context) {
    await requireGuildInteraction(interaction);
    const config = context.repositories.guildConfig.ensure(interaction.guildId!);
    const member = await interaction.guild!.members.fetch(interaction.user.id);
    const visible = [...context.commands.values()]
      .filter((command) => {
        const key = command.level as PermissionKey;
        if (!key) return true;
        return key === "info" || hasInternalPermission(member, config, key);
      })
      .map((command) => `/${command.data.name} - ${command.description}`)
      .join("\n");

    await interaction.reply({
      embeds: [embeds.info("Ayuda de CB Studios", visible || "No hay comandos disponibles.")],
      ephemeral: true,
    });
  },
};
