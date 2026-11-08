import { describe, expect, it } from "vitest";
import { make } from "../../../tests/helpers/factory";
import { verdictOf } from "../../../tests/helpers/getitems";
import { KERNEL_KIND } from "./kernel";

function fromDetails(details: Readonly<Record<string, unknown>>) {
  return verdictOf(KERNEL_KIND, details);
}

describe("KERNEL_KIND.fromGetItems", () => {
  it("is disclosed with the vendor Steam names, as for ARC Raiders", () => {
    const name = make.text.service();
    const nameToken = make.text.token();
    const verdict = fromDetails({ anticheat: { kernel_mode: true, name, name_loc: nameToken } });
    expect(verdict).toStrictEqual(
      make.verdict.bare("kernel", { name, nameToken, uninstallsCompletely: false }),
    );
  });

  it("is disclosed with no name for a custom anti-cheat, with boot protection", () => {
    const token = make.text.token();
    const verdict = fromDetails({
      anticheat: {
        kernel_mode: true,
        uninstall_completely: true,
        boot_protection: true,
        boot_protection_name: token,
      },
    });
    expect(verdict).toStrictEqual(
      make.verdict.bare("kernel", { uninstallsCompletely: true, bootProtection: { token } }),
    );
  });

  it.each<readonly [string, unknown]>([
    ["no token", undefined],
    ["a blank token", " "],
  ])("sets boot protection from its flag alone, with %s", (_name, boot_protection_name) => {
    const anticheat = { kernel_mode: true, boot_protection: true, boot_protection_name };
    expect(fromDetails({ anticheat })).toMatchObject({ bootProtection: {} });
  });

  it("leaves out boot protection whose flag is false, a token or not", () => {
    const anticheat = {
      kernel_mode: true,
      boot_protection: false,
      boot_protection_name: make.text.token(),
    };
    expect(fromDetails({ anticheat })).not.toHaveProperty("bootProtection");
  });

  it("keeps the vendor text as Steam sent it", () => {
    const name = ` ${make.text.markup()} `;
    expect(fromDetails({ anticheat: { kernel_mode: true, name } })).toMatchObject({ name });
  });

  it("leaves out a blank vendor name and token", () => {
    const blank = fromDetails({ anticheat: { kernel_mode: true, name: "  ", name_loc: "" } });
    expect(blank).not.toHaveProperty("name");
    expect(blank).not.toHaveProperty("nameToken");
  });

  it.each<readonly [string, Readonly<Record<string, unknown>>]>([
    ["no anti-cheat", {}],
    ["an empty anti-cheat", { anticheat: {} }],
    ["a false kernel flag", { anticheat: { kernel_mode: false } }],
    ["a named vendor without the flag", {
      anticheat: { name: make.text.service(), name_loc: make.text.token() },
    }],
  ])("is not disclosed for %s", (_name, details) => {
    expect(fromDetails(details)).toStrictEqual(make.verdict.notDisclosed());
  });

  it.each<readonly [string, unknown]>([
    ["a boolean", true],
    ["text", "kernel"],
    ["a list", [1]],
    ["an object with a kernel flag as text", { kernel_mode: "true" }],
    ["an object with a kernel flag as a number", { kernel_mode: 1 }],
  ])("is unknown malformed for an anti-cheat field that is %s", (_name, anticheat) => {
    expect(fromDetails({ anticheat })).toBe(make.verdict.unknown("malformed"));
  });

  it("ignores malformed fields of other kinds", () => {
    const others = { drm_third_party_type: 4, eula: "x", user_account_third_party: [] };
    expect(fromDetails({ ...others, anticheat: { kernel_mode: true } }).state).toBe("disclosed");
  });

  it("stays disclosed when a field that only adds detail is malformed", () => {
    const anticheat = {
      kernel_mode: true,
      uninstall_completely: "yes",
      boot_protection: 1,
      name: 3,
      name_loc: [],
      boot_protection_name: false,
    };
    expect(fromDetails({ anticheat })).toStrictEqual(
      make.verdict.bare("kernel", { uninstallsCompletely: false }),
    );
  });

  it("reads a name of 4,000 characters as given", () => {
    const name = "x".repeat(4000);
    expect(fromDetails({ anticheat: { kernel_mode: true, name } })).toMatchObject({ name });
  });

  it("reads a name over 4,000 characters as absent and stays disclosed", () => {
    const over = fromDetails({ anticheat: { kernel_mode: true, name: "x".repeat(4001) } });
    expect(over).toMatchObject({ state: "disclosed" });
    expect(over).not.toHaveProperty("name");
  });
});
