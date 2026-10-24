import { describe, expect, it } from "vitest";
import { verdictOf } from "../../../tests/helpers/getitems";
import { UNKNOWN } from "../types";
import { ANTICHEAT_KIND } from "./anticheat";
import { KERNEL_KIND } from "./kernel";

function fromDetails(details: Readonly<Record<string, unknown>>) {
  return verdictOf(ANTICHEAT_KIND, details);
}

describe("ANTICHEAT_KIND.fromGetItems", () => {
  it("is disclosed with the vendor Steam names, as for Counter-Strike 2", () => {
    const verdict = fromDetails({
      anticheat: { name: "VAC (Valve Anti-Cheat)", name_loc: "#Store_AntiCheat_Type_vac" },
    });
    expect(verdict).toStrictEqual({
      state: "disclosed",
      kind: "anticheat",
      source: "api",
      name: "VAC (Valve Anti-Cheat)",
      nameToken: "#Store_AntiCheat_Type_vac",
    });
  });

  it("is disclosed with no name for an empty anti-cheat object, as for Marvel Rivals", () => {
    const expected = { state: "disclosed", kind: "anticheat", source: "api" };
    expect(fromDetails({ anticheat: {} })).toStrictEqual(expected);
    expect(fromDetails({ anticheat: { kernel_mode: false } })).toStrictEqual(expected);
  });

  it("keeps the vendor text as Steam sent it, and leaves out a blank one", () => {
    expect(fromDetails({ anticheat: { name: " BattlEye " } })).toMatchObject({
      name: " BattlEye ",
    });
    expect(fromDetails({ anticheat: { name: "", name_loc: " " } })).toStrictEqual({
      state: "disclosed",
      kind: "anticheat",
      source: "api",
    });
  });

  it("is not disclosed without an anti-cheat, or with a kernel one", () => {
    const none = { state: "not-disclosed", source: "api" };
    expect(fromDetails({})).toStrictEqual(none);
    expect(fromDetails({ anticheat: { kernel_mode: true } })).toStrictEqual(none);
    expect(fromDetails({ anticheat: { kernel_mode: true, name: "BattlEye" } })).toStrictEqual(none);
  });

  it("is unknown error when the anti-cheat field is malformed", () => {
    for (const anticheat of [0, "VAC", null, { name: {} }, { kernel_mode: 1 }]) {
      expect(fromDetails({ anticheat })).toBe(UNKNOWN.error);
    }
  });
});

describe("the kernel and anti-cheat kinds", () => {
  const anticheats: readonly Record<string, unknown>[] = [
    {},
    { kernel_mode: true },
    { kernel_mode: false },
    { name: "VAC (Valve Anti-Cheat)", name_loc: "#Store_AntiCheat_Type_vac" },
    { kernel_mode: true, name: "BattlEye", name_loc: "#Store_AntiCheat_Type_battleye" },
    { kernel_mode: true, uninstall_completely: true, boot_protection: true },
  ];

  it("never disclose the same anti-cheat object together, and always one of them", () => {
    for (const anticheat of anticheats) {
      const kernel = verdictOf(KERNEL_KIND, { anticheat }).state;
      const other = verdictOf(ANTICHEAT_KIND, { anticheat }).state;
      expect([kernel, other].toSorted()).toStrictEqual(["disclosed", "not-disclosed"]);
      expect(kernel === "disclosed").toBe(anticheat["kernel_mode"] === true);
    }
  });

  it("disclose neither when there is no anti-cheat object", () => {
    expect(verdictOf(KERNEL_KIND, {}).state).toBe("not-disclosed");
    expect(verdictOf(ANTICHEAT_KIND, {}).state).toBe("not-disclosed");
  });

  it("are both unknown error for a malformed anti-cheat object", () => {
    expect(verdictOf(KERNEL_KIND, { anticheat: "yes" })).toBe(UNKNOWN.error);
    expect(verdictOf(ANTICHEAT_KIND, { anticheat: "yes" })).toBe(UNKNOWN.error);
  });
});
