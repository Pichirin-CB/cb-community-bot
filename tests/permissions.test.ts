import { describe, expect, it } from "vitest";
import { canActOnMember, canManageRole } from "../src/permissions/staffLevels.js";

describe("jerarquia", () => {
  it("bloquea actuar sobre owner", () => {
    expect(
      canActOnMember({
        actor: { id: "a", highestRolePosition: 100 },
        bot: { id: "b", highestRolePosition: 100 },
        target: { id: "owner", highestRolePosition: 1, isOwner: true },
      }).ok,
    ).toBe(false);
  });

  it("exige que actor y bot esten por encima del objetivo", () => {
    expect(
      canActOnMember({
        actor: { id: "a", highestRolePosition: 10 },
        bot: { id: "b", highestRolePosition: 10 },
        target: { id: "t", highestRolePosition: 5 },
      }).ok,
    ).toBe(true);
    expect(
      canActOnMember({
        actor: { id: "a", highestRolePosition: 4 },
        bot: { id: "b", highestRolePosition: 10 },
        target: { id: "t", highestRolePosition: 5 },
      }).ok,
    ).toBe(false);
  });

  it("bloquea autoacciones", () => {
    expect(canActOnMember({ actor: { id: "same", highestRolePosition: 10 }, bot: { id: "bot", highestRolePosition: 20 }, target: { id: "same", highestRolePosition: 10 } }).ok).toBe(false);
  });

  it("bloquea roles administrados o por encima del bot", () => {
    expect(canManageRole({ actorHighestRolePosition: 10, botHighestRolePosition: 10, role: { managed: true, position: 1 } }).ok).toBe(false);
    expect(canManageRole({ actorHighestRolePosition: 10, botHighestRolePosition: 4, role: { managed: false, position: 5 } }).ok).toBe(false);
  });
});
