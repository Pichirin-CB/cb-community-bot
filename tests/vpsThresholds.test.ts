import { describe, expect, it } from "vitest";
import type { SystemStatusConfig } from "../src/repositories/systemStatusRepository.js";
import type { SystemMetrics } from "../src/modules/systemStatus/metricsCollector.js";
import { classifyHealth, healthLabel } from "../src/modules/systemStatus/thresholds.js";

const config: SystemStatusConfig = {
  guild_id: "guild",
  channel_id: null,
  message_id: null,
  enabled: 0,
  interval_seconds: 300,
  mode: "edit",
  warn_cpu_pct: 85,
  warn_ram_pct: 85,
  warn_disk_pct: 90,
  created_at: "now",
  updated_at: "now",
};

function metrics(overrides: Partial<SystemMetrics>): SystemMetrics {
  return {
    collectedAt: "2026-08-16T00:00:00.000Z",
    hostname: "host",
    platform: "win32",
    distro: "Windows",
    uptimeSeconds: 100,
    cpuLoadPct: 10,
    ramUsedPct: 20,
    ramTotalBytes: 100,
    ramUsedBytes: 20,
    disks: [{ label: "Principal", usedPct: 40, sizeBytes: 100, usedBytes: 40 }],
    network: [],
    botMemoryBytes: 50,
    botUptimeSeconds: 10,
    ...overrides,
  };
}

describe("classifyHealth", () => {
  it("keeps normal metrics operational", () => {
    expect(healthLabel(classifyHealth(metrics({}), config))).toBe("Operativo");
  });

  it("marks warning at configured public thresholds", () => {
    expect(classifyHealth(metrics({ ramUsedPct: 88 }), config)).toBe("warning");
  });

  it("marks critical near exhaustion", () => {
    expect(classifyHealth(metrics({ cpuLoadPct: 96 }), config)).toBe("critical");
  });
});
