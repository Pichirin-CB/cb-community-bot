import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  type ButtonInteraction,
  type ChatInputCommandInteraction,
  type InteractionReplyOptions,
} from "discord.js";
import { randomUUID } from "node:crypto";
import { embeds } from "../modules/embeds/embedService.js";

interface PendingConfirmation {
  ownerId: string;
  expiresAt: number;
  used: boolean;
  action: (interaction: ButtonInteraction) => Promise<void>;
}

export class ConfirmationService {
  private readonly pending = new Map<string, PendingConfirmation>();

  async request(
    interaction: ChatInputCommandInteraction | ButtonInteraction,
    description: string,
    action: (interaction: ButtonInteraction) => Promise<void>,
    preview?: Pick<InteractionReplyOptions, "embeds" | "files">,
    labels: { confirm: string; cancel: string } = { confirm: "Confirmar", cancel: "Cancelar" },
  ): Promise<void> {
    const id = randomUUID();
    this.pending.set(id, {
      ownerId: interaction.user.id,
      expiresAt: Date.now() + 60_000,
      used: false,
      action,
    });

    const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder().setCustomId(`confirm:${id}`).setLabel(labels.confirm).setStyle(ButtonStyle.Danger),
      new ButtonBuilder().setCustomId(`cancel:${id}`).setLabel(labels.cancel).setStyle(ButtonStyle.Secondary),
    );

    await interaction.reply({
      embeds: preview?.embeds ?? [embeds.warning("Confirmacion requerida", description)],
      files: preview?.files,
      components: [row],
      ephemeral: true,
    });
  }

  async handle(interaction: ButtonInteraction): Promise<boolean> {
    const [kind, id] = interaction.customId.split(":");
    if (!id || (kind !== "confirm" && kind !== "cancel")) return false;

    const pending = this.pending.get(id);
    if (!pending) {
      await interaction.reply({ embeds: [embeds.warning("Confirmacion expirada", "Esta accion ya no esta disponible.")], ephemeral: true });
      return true;
    }
    if (pending.ownerId !== interaction.user.id) {
      await interaction.reply({ embeds: [embeds.error("Accion privada", "Solo quien inicio la accion puede confirmarla.")], ephemeral: true });
      return true;
    }
    if (pending.used || pending.expiresAt < Date.now()) {
      this.pending.delete(id);
      await interaction.reply({ embeds: [embeds.warning("Confirmacion expirada", "La accion no fue ejecutada.")], ephemeral: true });
      return true;
    }

    pending.used = true;
    this.pending.delete(id);

    if (kind === "cancel") {
      await interaction.update({ embeds: [embeds.info("Cancelado", "No se ejecuto ninguna accion.")], components: [] });
      return true;
    }

    await pending.action(interaction);
    return true;
  }
}
