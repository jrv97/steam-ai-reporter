import { describe, expect, it } from "vitest";
import { make } from "../../../tests/helpers/factory";
import { verdictOf } from "../../../tests/helpers/getitems";
import { ANTICHEAT_KIND } from "./anticheat";
import { KERNEL_KIND } from "./kernel";

function fromDetails(details: Readonly<Record<string, unknown>>) {
  return verdictOf(ANTICHEAT_KIND, details);
}

describe("ANTICHEAT_KIND.fromGetItems", () => {
  it("is disclosed with the vendor Steam names, as for Counter-Strike 2", () => {
    const name = make.text.service();
    const nameToken = make.text.token();
    const verdict = fromDetails({ anticheat: { name, name_loc: nameToken } });
    expect(verdict).toStrictEqual(make.verdict.disclosed("anticheat", { name, nameToken }));
  });

  it.each<readonly [string, unknown]>([
    ["an empty object, as for Marvel Rivals", {}],
    ["a false kernel flag", { kernel_mode: false }],
    ["a blank name", { name: "", name_loc: " " }],
    ["a malformed name", { name: {}, name_loc: 4 }],
    ["an empty list, read as no object", []],
  ])("is disclosed with no name for %s", (_name, anticheat) => {
    expect(fromDetails({ anticheat })).toStrictEqual(make.verdict.bare("anticheat"));
  });

  it("keeps the vendor text as Steam sent it", () => {
    const name = ` ${make.text.service()} `;
    expect(fromDetails({ anticheat: { name } })).toMatchObject({ name });
  });

  it.each<readonly [string, Readonly<Record<string, unknown>>]>([
    ["no anti-cheat", {}],
    ["a kernel anti-cheat", { anticheat: { kernel_mode: true } }],
    ["a named kernel anti-cheat", { anticheat: { kernel_mode: true, name: make.text.service() } }],
  ])("is not disclosed for %s", (_name, details) => {
    expect(fromDetails(details)).toStrictEqual(make.verdict.notDisclosed());
  });

  it.each<readonly [string, unknown]>([
    ["a number", 0],
    ["text", "VAC"],
    ["null", null],
    ["a list of objects", [{}]],
    ["an object with a kernel flag that is no boolean", { kernel_mode: 1 }],
  ])("is unknown malformed for an anti-cheat field that is %s", (_name, anticheat) => {
    expect(fromDetails({ anticheat })).toBe(make.verdict.unknown("malformed"));
  });
});

describe("the kernel and anti-cheat kinds", () => {
  const KERNEL = { kernel: "disclosed", anticheat: "not-disclosed" } as const;
  const OTHER = { kernel: "not-disclosed", anticheat: "disclosed" } as const;

  it.each<readonly [string, Readonly<Record<string, unknown>>, typeof KERNEL | typeof OTHER]>([
    ["an empty object", {}, OTHER],
    ["a kernel flag alone", { kernel_mode: true }, KERNEL],
    ["a false kernel flag", { kernel_mode: false }, OTHER],
    ["a named vendor", { name: make.text.service(), name_loc: make.text.token() }, OTHER],
    [
      "a named kernel vendor",
      { kernel_mode: true, name: make.text.service(), name_loc: make.text.token() },
      KERNEL,
    ],
    [
      "a kernel with boot protection",
      { kernel_mode: true, uninstall_completely: true, boot_protection: true },
      KERNEL,
    ],
  ])("disclose exactly one of them for %s", (_name, anticheat, states) => {
    expect({
      kernel: verdictOf(KERNEL_KIND, { anticheat }).state,
      anticheat: verdictOf(ANTICHEAT_KIND, { anticheat }).state,
    }).toStrictEqual(states);
  });
});
