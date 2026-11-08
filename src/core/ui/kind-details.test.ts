import { describe, expect, it } from "vitest";
import { englishI18n } from "../../../tests/helpers/i18n";
import { STATUS_KINDS } from "../../../tests/helpers/settings";
import {
  compatVerdict,
  earlyAccessVerdict,
  familyVerdict,
  FULL_DISCLOSED,
} from "../../../tests/helpers/verdicts";
import { SHIPPED_CATALOGS } from "../i18n/shipped";
import { createI18n } from "../i18n/t";
import { COMPAT_FACETS } from "../kinds/compat";
import { facetOf } from "../kinds/facets";
import { FAMILY_FACETS, FAMILY_KIND } from "../kinds/family";
import type { FacetDefinition, FacetId, TagKind } from "../kinds/kind";
import { KIND_BY_ID, KINDS } from "../kinds/registry";
import type { AnyDisclosed } from "../kinds/verdicts";
import { chipText, type KindDetail, kindDetails } from "./kind-details";

const { ai, kernel, anticheat, drm, account, eula, pvp, iap } = FULL_DISCLOSED;

describe("kindDetails", () => {
  const { service: _service, ...unnamedAi } = ai;
  const { name: _kernelName, bootProtection: _boot, ...plainKernel } = kernel;
  const { name: _anticheatName, ...unnamedAnticheat } = anticheat;
  const { activationLimit: _limit, ...unlimitedDrm } = drm;
  const AI_NOTES: KindDetail = { kind: "quote", text: ai.notes };
  const DENUVO: KindDetail = { kind: "text", text: "Denuvo Anti-tamper" };
  const UBISOFT: KindDetail = { kind: "text", text: "Ubisoft Account" };

  it.each<readonly [string, AnyDisclosed, readonly KindDetail[]]>([
    ["the AI notes and the service the developer named", ai, [
      AI_NOTES,
      { kind: "labeled", key: "badge_card_service_label", text: "Midjourney" },
    ]],
    ["the AI notes alone without a service", unnamedAi, [AI_NOTES]],
    ["the AI notes alone with an empty service", { ...ai, service: "" }, [AI_NOTES]],
    ["the kernel anti-cheat's name, leftover note and boot protection", {
      ...kernel,
      uninstallsCompletely: false,
    }, [
      { kind: "text", text: "Easy Anti-Cheat" },
      { kind: "message", key: "kind_kernel_uninstall" },
      { kind: "message", key: "kind_kernel_boot" },
    ]],
    ["nothing for a kernel anti-cheat that cleans up, with no boot protection", plainKernel, []],
    ["the name of an anti-cheat that is not kernel level", anticheat, [
      { kind: "text", text: "VAC (Valve Anti-Cheat)" },
    ]],
    ["nothing for an unnamed anti-cheat that is not kernel level", unnamedAnticheat, []],
    ["the DRM text and the activation limit", drm, [DENUVO, { kind: "text", text: "5 a day" }]],
    ["the DRM text alone without a limit", unlimitedDrm, [DENUVO]],
    ["the account text and the note that it links to Steam", account, [
      UBISOFT,
      { kind: "message", key: "kind_account_links" },
    ]],
    ["the account text alone when it does not link", { ...account, linksToSteam: false }, [
      UBISOFT,
    ]],
    ["every EULA by name", eula, [
      { kind: "text", text: "Game EULA" },
      { kind: "text", text: "Publisher terms" },
    ]],
    ["the PvP categories Steam lists, in order, skipping others", {
      ...pvp,
      categoryIds: [37, 49, 9],
    }, [
      { kind: "message", key: "kind_pvp_category_split" },
      { kind: "message", key: "kind_pvp_category_pvp" },
    ]],
    ["no line for IAP, whose heading is Steam's category name", iap, []],
  ])("gives %s", (_name, verdict, lines) => {
    expect(kindDetails(verdict)).toEqual(lines);
  });

  describe("for early access", () => {
    const { note: _note, released: _released, ...bare } = earlyAccessVerdict();
    const { note, released } = earlyAccessVerdict();

    it.each<readonly [string, AnyDisclosed, readonly KindDetail[]]>([
      ["the note, the release date and the latest update, in that order", {
        ...earlyAccessVerdict(),
        updated: 1793121240,
      }, [
        { kind: "quote", text: note ?? "" },
        { kind: "dated", key: "kind_earlyaccess_released", time: released ?? 0 },
        { kind: "dated", key: "kind_earlyaccess_updated", time: 1793121240 },
      ]],
      ["no update line without the page's time", earlyAccessVerdict(), [
        { kind: "quote", text: note ?? "" },
        { kind: "dated", key: "kind_earlyaccess_released", time: released ?? 0 },
      ]],
      ["the dates without a note", { ...bare, released: 1731596424, updated: 1793121240 }, [
        { kind: "dated", key: "kind_earlyaccess_released", time: 1731596424 },
        { kind: "dated", key: "kind_earlyaccess_updated", time: 1793121240 },
      ]],
      ["nothing for a flag with no detail", bare, []],
      ["no quote for an empty note", earlyAccessVerdict({ note: "" }), [
        { kind: "dated", key: "kind_earlyaccess_released", time: released ?? 0 },
      ]],
    ])("gives %s", (_name, verdict, lines) => {
      expect(kindDetails(verdict)).toEqual(lines);
    });
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
