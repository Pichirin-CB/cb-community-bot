import type { SystemStatusConfig } from "../../repositories/systemStatusRepository.js";
import type { SystemMetrics } from "./metricsCollector.js";

export type HealthState = "operational" | "warning" | "critical";

export function worstDiskPct(metrics: SystemMetrics): number {
  return Math.max(0, ...metrics.disks.map((disk) => disk.usedPct));
}

export function classifyHealth(metrics: SystemMetrics, config: Pick<SystemStatusConfig, "warn_cpu_pct" | "warn_ram_pct" | "warn_disk_pct">): HealthState {
  const diskPct = worstDiskPct(metrics);
  if (metrics.cpuLoadPct >= 95 || metrics.ramUsedPct >= 95 || diskPct >= 97) return "critical";
  if (metrics.cpuLoadPct >= config.warn_cpu_pct || metrics.ramUsedPct >= config.warn_ram_pct || diskPct >= config.warn_disk_pct) {
    return "warning";
  }
  return "operational";
}

export function healthLabel(state: HealthState): string {
  if (state === "critical") return "Revisar";
  if (state === "warning") return "Degradado";
  return "Operativo";
}
