import { EmbedBuilder } from "discord.js";
import type { SystemStatusConfig } from "../../repositories/systemStatusRepository.js";
import { brand } from "../embeds/embedService.js";
import type { SystemMetrics } from "./metricsCollector.js";
import { classifyHealth, healthLabel } from "./thresholds.js";

function bytes(bytesValue: number): string {
  const units = ["B", "KB", "MB", "GB", "TB"];
  let value = Math.max(0, bytesValue);
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  return `${value.toFixed(value >= 10 || unit === 0 ? 0 : 1)} ${units[unit]}`;
}

function formatSeconds(seconds: number): string {
  const safe = Math.max(0, Math.floor(seconds));
  const days = Math.floor(safe / 86400);
  const hours = Math.floor((safe % 86400) / 3600);
  const minutes = Math.floor((safe % 3600) / 60);
  if (days > 0) return `${days}d ${hours}h ${minutes}m`;
  if (hours > 0) return `${hours}h ${minutes}m`;
  return `${minutes}m`;
}

function publicStatus(health: ReturnType<typeof classifyHealth>): { label: string; text: string } {
  if (health === "critical") return { label: "Unavailable", text: "El servicio requiere intervención." };
  if (health === "warning") return { label: "Degraded", text: "El servicio está operativo con capacidad reducida." };
  return { label: "Operational", text: "Todos los servicios están funcionando." };
}

export function buildPublicStatusEmbed(metrics: SystemMetrics, config: SystemStatusConfig): EmbedBuilder {
  const health = classifyHealth(metrics, config);
  const color = health === "critical" ? brand.colors.error : health === "warning" ? brand.colors.warning : brand.colors.success;
  const status = publicStatus(health);

  return new EmbedBuilder()
    .setColor(color)
    .setTitle("CB Studios System Monitor")
    .setDescription(`Estado general: **${status.label}**\n${status.text}`)
    .addFields(
      { name: "Servicio", value: status.label, inline: true },
      { name: "Tiempo activo", value: formatSeconds(metrics.botUptimeSeconds), inline: true },
    )
    .setFooter({ text: "CB Studios - Monitor publico" })
    .setTimestamp(new Date(metrics.collectedAt));
}

export function buildAdminStatusEmbed(metrics: SystemMetrics, config: SystemStatusConfig): EmbedBuilder {
  const health = classifyHealth(metrics, config);
  const diskLine = metrics.disks.length
    ? metrics.disks.map((disk) => `${disk.label}: ${disk.usedPct}% usado (${bytes(disk.usedBytes)} / ${bytes(disk.sizeBytes)})`).join("\n")
    : "Sin lectura";
  const networkLine = metrics.network.length
    ? metrics.network.map((row) => `${row.iface}: down ${bytes(row.rxBytesPerSec)}/s up ${bytes(row.txBytesPerSec)}/s`).join("\n")
    : "Sin lectura";

  return new EmbedBuilder()
    .setColor(health === "critical" ? brand.colors.error : health === "warning" ? brand.colors.warning : brand.colors.info)
    .setTitle(`Diagnostico del host: ${healthLabel(health)}`)
    .addFields(
      { name: "Host", value: `${metrics.hostname}\n${metrics.distro}`, inline: false },
      { name: "CPU", value: `${metrics.cpuLoadPct}%`, inline: true },
      { name: "RAM", value: `${metrics.ramUsedPct}% (${bytes(metrics.ramUsedBytes)} / ${bytes(metrics.ramTotalBytes)})`, inline: true },
      { name: "Uptime", value: formatSeconds(metrics.uptimeSeconds), inline: true },
      { name: "Discos", value: diskLine, inline: false },
      { name: "Red", value: networkLine, inline: false },
      { name: "Proceso del bot", value: `${bytes(metrics.botMemoryBytes)} RAM - ${formatSeconds(metrics.botUptimeSeconds)}`, inline: false },
    )
    .setFooter({ text: "CB Studios - Diagnostico privado" })
    .setTimestamp(new Date(metrics.collectedAt));
}
