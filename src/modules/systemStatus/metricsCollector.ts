import os from "node:os";
import process from "node:process";
import si from "systeminformation";

export interface DiskMetric {
  label: string;
  usedPct: number;
  sizeBytes: number;
  usedBytes: number;
}

export interface NetworkMetric {
  iface: string;
  rxBytesPerSec: number;
  txBytesPerSec: number;
}

export interface SystemMetrics {
  collectedAt: string;
  hostname: string;
  platform: string;
  distro: string;
  uptimeSeconds: number;
  cpuLoadPct: number;
  ramUsedPct: number;
  ramTotalBytes: number;
  ramUsedBytes: number;
  disks: DiskMetric[];
  network: NetworkMetric[];
  botMemoryBytes: number;
  botUptimeSeconds: number;
}

function pct(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(100, Math.round(value)));
}

function publicDiskLabel(index: number): string {
  if (index === 0) return "Principal";
  if (index === 1) return "Secundario";
  return `Disco ${index + 1}`;
}

function publicDisks(disks: any[]): any[] {
  const minPublicDiskBytes = 10 * 1024 * 1024 * 1024;
  const visible = disks.filter((disk) => Number(disk.size || 0) >= minPublicDiskBytes);
  return (visible.length ? visible : disks).slice(0, 4);
}

export async function collectMetrics(): Promise<SystemMetrics> {
  const [load, mem, disks, osInfo, network] = await Promise.all([
    si.currentLoad(),
    si.mem(),
    si.fsSize().catch(() => []),
    si.osInfo().catch(() => ({ platform: process.platform, distro: process.platform })),
    si.networkStats().catch(() => []),
  ]);
  const time = si.time();

  return {
    collectedAt: new Date().toISOString(),
    hostname: os.hostname(),
    platform: osInfo.platform || process.platform,
    distro: osInfo.distro || osInfo.platform || process.platform,
    uptimeSeconds: Math.floor(Number(time.uptime || os.uptime())),
    cpuLoadPct: pct(load.currentLoad),
    ramUsedPct: pct((mem.used / Math.max(1, mem.total)) * 100),
    ramTotalBytes: mem.total,
    ramUsedBytes: mem.used,
    disks: publicDisks(disks).map((disk: any, index: number) => ({
      label: publicDiskLabel(index),
      usedPct: pct(disk.use),
      sizeBytes: Number(disk.size || 0),
      usedBytes: Number(disk.used || 0),
    })),
    network: network.slice(0, 3).map((row: any) => ({
      iface: row.iface || "net",
      rxBytesPerSec: Number(row.rx_sec || 0),
      txBytesPerSec: Number(row.tx_sec || 0),
    })),
    botMemoryBytes: process.memoryUsage().rss,
    botUptimeSeconds: Math.floor(process.uptime()),
  };
}
