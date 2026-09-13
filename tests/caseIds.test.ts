import { describe, expect, it } from "vitest";
import { formatCaseId } from "../src/modules/cases/caseIds.js";

describe("case ids", () => {
  it("usa prefijo CB y padding estable", () => {
    expect(formatCaseId(1)).toBe("CB-000001");
    expect(formatCaseId(42)).toBe("CB-000042");
  });

  it("rechaza secuencias invalidas", () => {
    expect(() => formatCaseId(0)).toThrow();
  });
});
