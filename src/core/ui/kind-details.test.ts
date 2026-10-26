import { describe, expect, it } from "vitest";
import { englishI18n } from "../../../tests/helpers/i18n";
import { STATUS_KINDS } from "../../../tests/helpers/settings";
import { compatVerdict, familyVerdict, FULL_DISCLOSED } from "../../../tests/helpers/verdicts";
import { SHIPPED_CATALOGS } from "../i18n/shipped";
import { createI18n } from "../i18n/t";
import { COMPAT_FACETS } from "../kinds/compat";
import { facetOf } from "../kinds/facets";
import { FAMILY_FACETS, FAMILY_KIND } from "../kinds/family";
import type { FacetDefinition, FacetId, TagKind } from "../kinds/kind";
import { KIND_BY_ID, KINDS } from "../kinds/registry";
import { chipText, kindDetails } from "./kind-details";

const { ai, kernel, anticheat, drm, account, eula, pvp, iap } = FULL_DISCLOSED;

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

  it("lists every EULA by name", () => {
    expect(kindDetails(eula)).toEqual([
      { kind: "text", text: "Game EULA" },
      { kind: "text", text: "Publisher terms" },
    ]);
  });

  it("names the PvP categories Steam lists, in the order given, and skips any other", () => {
    expect(kindDetails({ ...pvp, categoryIds: [37, 49, 9] })).toEqual([
      { kind: "message", key: "kind_pvp_category_split" },
      { kind: "message", key: "kind_pvp_category_pvp" },
    ]);
  });

  it("adds no line to IAP, whose heading is Steam's category name", () => {
    expect(kindDetails(iap)).toEqual([]);
  });

  it.each(COMPAT_FACETS)("gives a device rated %s Steam's word for it as its one line", (facet) => {
    expect(kindDetails(compatVerdict("machine", facet))).toEqual([
      { kind: "message", key: `kind_compat_${facet}` },
    ]);
  });
});

describe("chipText", () => {
  const LOCALES = [["en", englishI18n()], ["es", createI18n(SHIPPED_CATALOGS, "es")]] as const;
  /** Every kind with each of its values, or with none for a kind without values. */
  const CHIPS = KINDS.flatMap((kind) =>
    (kind.facets ?? [undefined]).map((facet) => [kind, facet] as const)
  );
  const CASES = LOCALES.flatMap(([locale, i18n]) =>
    CHIPS.flatMap(([kind, facet]) =>
      [undefined, "Mine"].map((own) =>
        [locale, kind.id, facet?.id ?? "-", own, i18n, kind, facet] as const
      )
    )
  );

  it.each(CASES)(
    "names the %s %s chip (value %s, own text %s) by its visible text, then Steam's words",
    (_locale, _id, _value, own, i18n, kind, facet) => {
      const { label, name } = chipText(i18n, kind, facet, own);
      const steam = i18n.t(facet?.chip === undefined ? kind.messages.heading : facet.word);
      expect(name.startsWith(label)).toBe(true);
      expect(name.endsWith(steam)).toBe(true);
    },
  );

  it.each(
    LOCALES.flatMap(([locale, i18n]) =>
      STATUS_KINDS.flatMap((id) => COMPAT_FACETS.map((facet) => [locale, id, facet, i18n] as const))
    ),
  )("puts the %s own text of %s rated %s before Steam's value word", (_locale, id, facet, i18n) => {
    const value = i18n.t(`kind_compat_${facet}`);
    expect(chipText(i18n, KIND_BY_ID[id], facetOf(compatVerdict(id, facet)), "Mine").label).toBe(
      i18n.t("kind_facet_chip", { chip: "Mine", value }),
    );
  });

  it.each(FAMILY_FACETS)("lets own text replace the whole chip of the family value %s", (value) => {
    const i18n = englishI18n();
    const facet = facetOf(familyVerdict(value));
    const { label, name } = chipText(i18n, FAMILY_KIND, facet, "Mine");
    expect(label).toBe("Mine");
    expect(name).toBe(
      i18n.t("kind_chip_name", { chip: "Mine", heading: i18n.t(facet?.word ?? "kind_ai_chip") }),
    );
  });

  it.each<readonly [string, TagKind, FacetDefinition<FacetId> | undefined]>([
    ["pvp", KIND_BY_ID.pvp, undefined],
    ["family supported", FAMILY_KIND, facetOf(familyVerdict("supported"))],
  ])("says the words of the %s chip once, as they equal Steam's", (_name, kind, facet) => {
    const { label, name } = chipText(englishI18n(), kind, facet, undefined);
    expect(name).toBe(label);
  });
});
