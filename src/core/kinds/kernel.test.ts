import { describe, expect, it } from "vitest";
import { verdictOf } from "../../../tests/helpers/getitems";
import { UNKNOWN } from "../types";
import { KERNEL_KIND } from "./kernel";

function fromDetails(details: Readonly<Record<string, unknown>>) {
  return verdictOf(KERNEL_KIND, details);
}

describe("KERNEL_KIND.fromGetItems", () => {
  it("is disclosed with the vendor Steam names, as for ARC Raiders", () => {
    const verdict = fromDetails({
      anticheat: { kernel_mode: true, name: "Denuvo", name_loc: "#Store_AntiCheat_Type_denuvo" },
    });
    expect(verdict).toStrictEqual({
      state: "disclosed",
      kind: "kernel",
      source: "api",
      name: "Denuvo",
      nameToken: "#Store_AntiCheat_Type_denuvo",
      uninstallsCompletely: false,
    });
  });

  it("is disclosed with no name for a custom anti-cheat, with boot protection", () => {
    const verdict = fromDetails({
      anticheat: {
        kernel_mode: true,
        uninstall_completely: true,
        boot_protection: true,
        boot_protection_name: "secureboot_tpm2",
      },
    });
    expect(verdict).toStrictEqual({
      state: "disclosed",
      kind: "kernel",
      source: "api",
      uninstallsCompletely: true,
      bootProtection: { token: "secureboot_tpm2" },
    });
  });

  it("sets boot protection from its flag alone, with no token when Steam sent none", () => {
    expect(fromDetails({ anticheat: { kernel_mode: true, boot_protection: true } })).toMatchObject({
      bootProtection: {},
    });
    const ignored = fromDetails({
      anticheat: { kernel_mode: true, boot_protection: false, boot_protection_name: "tpm" },
    });
    expect(ignored).not.toHaveProperty("bootProtection");
    expect(
      fromDetails({
        anticheat: { kernel_mode: true, boot_protection: true, boot_protection_name: " " },
      }),
    ).toMatchObject({ bootProtection: {} });
  });

  it("keeps the vendor text as Steam sent it, and leaves out a blank one", () => {
    const padded = fromDetails({ anticheat: { kernel_mode: true, name: " <b>EAC</b> " } });
    expect(padded).toMatchObject({ name: " <b>EAC</b> " });
    const blank = fromDetails({ anticheat: { kernel_mode: true, name: "  ", name_loc: "" } });
    expect(blank).not.toHaveProperty("name");
    expect(blank).not.toHaveProperty("nameToken");
  });

  it("is not disclosed without the kernel flag, or without an anti-cheat", () => {
    const cases = [
      {},
      { anticheat: {} },
      { anticheat: { kernel_mode: false } },
      { anticheat: { name: "VAC (Valve Anti-Cheat)", name_loc: "#Store_AntiCheat_Type_vac" } },
    ];
    for (const details of cases) {
      expect(fromDetails(details)).toStrictEqual({ state: "not-disclosed", source: "api" });
    }
  });

  it("is unknown malformed when the anti-cheat field is malformed, and only then", () => {
    for (const anticheat of [true, "kernel", [], { kernel_mode: "true" }, { name: 3 }]) {
      expect(fromDetails({ anticheat })).toBe(UNKNOWN.malformed);
    }
    const others = { drm_third_party_type: 4, eula: "x", user_account_third_party: [] };
    expect(fromDetails({ ...others, anticheat: { kernel_mode: true } }).state).toBe("disclosed");
  });
});
