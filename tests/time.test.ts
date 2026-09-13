import { describe, expect, it } from "vitest";
import { DISCORD_TIMEOUT_MAX_MS, formatDuration, parseDuration } from "../src/utils/time.js";

describe("duraciones", () => {
  it("parsea unidades comunes", () => {
    expect(parseDuration("30m")).toBe(30 * 60 * 1000);
    expect(parseDuration("2h")).toBe(2 * 60 * 60 * 1000);
    expect(parseDuration("7d")).toBe(7 * 24 * 60 * 60 * 1000);
  });

  it("rechaza formatos invalidos", () => {
    expect(() => parseDuration("ayer")).toThrow();
  });

  it("documenta el limite real de timeout de Discord", () => {
    expect(DISCORD_TIMEOUT_MAX_MS).toBe(28 * 24 * 60 * 60 * 1000);
    expect(formatDuration(60 * 60 * 1000)).toBe("1 hora");
  });
});
