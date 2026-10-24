import { describe, expect, it } from "vitest";
import { FULL_DISCLOSED } from "../../../tests/helpers/verdicts";
import { cardDetails } from "./card-details";

const { ai, kernel, anticheat, drm, account, eula, pvp } = FULL_DISCLOSED;

describe("cardDetails", () => {
  it("quotes the AI notes and names the service the developer gave", () => {
    expect(cardDetails(ai)).toEqual([
      { kind: "quote", text: ai.notes },
      { kind: "labeled", key: "badge_card_service_label", text: "Midjourney" },
    ]);
  });

  it("leaves out an AI service that is missing or empty", () => {
    const { service: _service, ...unnamed } = ai;
    expect(cardDetails(unnamed)).toEqual([{ kind: "quote", text: ai.notes }]);
    expect(cardDetails({ ...ai, service: "" })).toEqual([{ kind: "quote", text: ai.notes }]);
  });

  it("lists the kernel anti-cheat's name, the leftover note and the boot protection", () => {
    expect(cardDetails({ ...kernel, uninstallsCompletely: false })).toEqual([
      { kind: "text", text: "Easy Anti-Cheat" },
      { kind: "message", key: "kind_kernel_uninstall" },
      { kind: "message", key: "kind_kernel_boot" },
    ]);
  });

  it("says nothing about a kernel anti-cheat that cleans up and needs no boot protection", () => {
    const { name: _name, bootProtection: _boot, ...plain } = kernel;
    expect(cardDetails(plain)).toEqual([]);
  });

  it("names the anti-cheat that is not kernel level, when Steam does", () => {
    expect(cardDetails(anticheat)).toEqual([{ kind: "text", text: "VAC (Valve Anti-Cheat)" }]);
    const { name: _name, ...unnamed } = anticheat;
    expect(cardDetails(unnamed)).toEqual([]);
  });

  it("gives the developer's DRM text", () => {
    expect(cardDetails(drm)).toEqual([{ kind: "text", text: "Denuvo Anti-tamper" }]);
  });

  it("gives the account text, and Steam's note when it links to a Steam account", () => {
    expect(cardDetails(account)).toEqual([
      { kind: "text", text: "Ubisoft Account" },
      { kind: "message", key: "kind_account_links" },
    ]);
    expect(cardDetails({ ...account, linksToSteam: false })).toEqual([
      { kind: "text", text: "Ubisoft Account" },
    ]);
  });

  it("lists the name of every EULA", () => {
    expect(cardDetails(eula)).toEqual([
      { kind: "text", text: "Game EULA" },
      { kind: "text", text: "Publisher terms" },
    ]);
  });

  it("names the PvP categories Steam lists, in the order given, and skips any other", () => {
    expect(cardDetails({ ...pvp, categoryIds: [37, 49, 9] })).toEqual([
      { kind: "message", key: "kind_pvp_category_split" },
      { kind: "message", key: "kind_pvp_category_pvp" },
    ]);
  });
});
