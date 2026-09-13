import { SlashCommandBuilder } from "discord.js";
import type { BotCommand } from "../../types/command.js";
import { embeds } from "../../modules/embeds/embedService.js";
import { requireGuildInteraction } from "../../permissions/guards.js";

export const userInfoCommand: BotCommand = {
  data: new SlashCommandBuilder()
    .setName("user-info")
    .setDescription("Muestra informacion de un usuario.")
    .addUserOption((option) => option.setName("usuario").setDescription("Usuario a consultar")),
  level: "info",
  description: "Informacion de usuario",
  async execute(interaction) {
    await requireGuildInteraction(interaction);
    const user = interaction.options.getUser("usuario") ?? interaction.user;
    const member = await interaction.guild!.members.fetch(user.id).catch(() => null);
    const joined = member?.joinedTimestamp ? `<t:${Math.floor(member.joinedTimestamp / 1000)}:D>` : "No disponible";
    await interaction.reply({
      embeds: [
        embeds.user(user, `ID: ${user.id}`).addFields(
          { name: "Cuenta creada", value: `<t:${Math.floor(user.createdTimestamp / 1000)}:D>`, inline: true },
          { name: "Ingreso", value: joined, inline: true },
          { name: "Bot", value: user.bot ? "Si" : "No", inline: true },
        ),
      ],
      ephemeral: true,
    });
  },
};
