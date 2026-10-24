import { describe, expect, it } from "vitest";
import { GENERIC, PLACEMENTS } from "./placements";

describe("PLACEMENTS", () => {
  it.each(PLACEMENTS.map((placement) => [placement.id, placement] as const))(
    "%s states how many chips it shows before the +N chip",
    (_id, placement) => {
      expect(Number.isInteger(placement.maxChips)).toBe(true);
      expect(placement.maxChips).toBeGreaterThanOrEqual(1);
    },
  );

  it("gives a capsule overlay no more chips than the rows beside a title", () => {
    const rows = PLACEMENTS.filter((placement) => placement.badge === "full");
    const overlays = PLACEMENTS.filter((placement) => placement.badge === "compact");
    expect(rows.length).toBeGreaterThan(0);
    expect(overlays).toContain(GENERIC);
    for (const overlay of overlays) {
      expect(overlay.maxChips).toBeLessThanOrEqual(Math.max(...rows.map((row) => row.maxChips)));
    }
  });
});
