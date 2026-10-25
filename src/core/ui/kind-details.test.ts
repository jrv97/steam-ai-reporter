import { describe, expect, it } from "vitest";
import { FULL_DISCLOSED } from "../../../tests/helpers/verdicts";
import { kindDetails } from "./kind-details";

const { ai, kernel, anticheat, drm, account, eula, pvp } = FULL_DISCLOSED;

describe("kindDetails", () => {
  it("quotes the AI notes and names the service the developer gave", () => {
    expect(kindDetails(ai)).toEqual([
      { kind: "quote", text: ai.notes },
      { kind: "labeled", key: "badge_card_service_label", text: "Midjourney" },
    ]);
  });

  it("leaves out an AI service that is missing or empty", () => {
    const { service: _service, ...unnamed } = ai;
    expect(kindDetails(unnamed)).toEqual([{ kind: "quote", text: ai.notes }]);
    expect(kindDetails({ ...ai, service: "" })).toEqual([{ kind: "quote", text: ai.notes }]);
  });

  it("lists the kernel anti-cheat's name, the leftover note and the boot protection", () => {
    expect(kindDetails({ ...kernel, uninstallsCompletely: false })).toEqual([
      { kind: "text", text: "Easy Anti-Cheat" },
      { kind: "message", key: "kind_kernel_uninstall" },
      { kind: "message", key: "kind_kernel_boot" },
    ]);
  });

  it("says nothing about a kernel anti-cheat that cleans up and needs no boot protection", () => {
    const { name: _name, bootProtection: _boot, ...plain } = kernel;
    expect(kindDetails(plain)).toEqual([]);
  });

  it("names the anti-cheat that is not kernel level, when Steam does", () => {
    expect(kindDetails(anticheat)).toEqual([{ kind: "text", text: "VAC (Valve Anti-Cheat)" }]);
    const { name: _name, ...unnamed } = anticheat;
    expect(kindDetails(unnamed)).toEqual([]);
  });

  it("gives the developer's DRM text and the activation limit Steam sent", () => {
    expect(kindDetails(drm)).toEqual([
      { kind: "text", text: "Denuvo Anti-tamper" },
      { kind: "text", text: "5 a day" },
    ]);
    const { activationLimit: _limit, ...unlimited } = drm;
    expect(kindDetails(unlimited)).toEqual([{ kind: "text", text: "Denuvo Anti-tamper" }]);
  });

  it("gives the account text, and Steam's note when it links to a Steam account", () => {
    expect(kindDetails(account)).toEqual([
      { kind: "text", text: "Ubisoft Account" },
      { kind: "message", key: "kind_account_links" },
    ]);
    expect(kindDetails({ ...account, linksToSteam: false })).toEqual([
      { kind: "text", text: "Ubisoft Account" },
    ]);
  });

  it("lists every EULA by name, with a link where the store hosts one", () => {
    expect(kindDetails(eula)).toEqual([
      { kind: "link", text: "Game EULA", url: "https://store.steampowered.com/eula/1_eula_0" },
      { kind: "text", text: "Publisher terms" },
    ]);
  });

  it.each([
    "javascript:alert(1)",
    "https://example.com/eula/1",
    "https://store.steampowered.com/app/1",
    "//store.steampowered.com/eula/1",
  ])("keeps only the name of a EULA whose link is %s", (url) => {
    expect(kindDetails({ ...eula, items: [{ name: "Terms", url }] })).toEqual([
      { kind: "text", text: "Terms" },
    ]);
  });

  it("names the PvP categories Steam lists, in the order given, and skips any other", () => {
    expect(kindDetails({ ...pvp, categoryIds: [37, 49, 9] })).toEqual([
      { kind: "message", key: "kind_pvp_category_split" },
      { kind: "message", key: "kind_pvp_category_pvp" },
    ]);
  });
});
