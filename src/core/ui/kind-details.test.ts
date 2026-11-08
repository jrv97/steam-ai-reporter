import { describe, expect, it } from "vitest";
import { make } from "../../../tests/helpers/factory";
import { englishI18n } from "../../../tests/helpers/i18n";
import { STATUS_KINDS } from "../../../tests/helpers/settings";
import { SHIPPED_CATALOGS } from "../i18n/shipped";
import { type BareMessageKey, createI18n } from "../i18n/t";
import { COMPAT_FACETS } from "../kinds/compat";
import { facetOf } from "../kinds/facets";
import { FAMILY_FACETS, FAMILY_KIND } from "../kinds/family";
import type { FacetDefinition, FacetId, TagKind } from "../kinds/kind";
import { KIND_BY_ID, KINDS } from "../kinds/registry";
import type { AnyDisclosed } from "../kinds/verdicts";
import { chipText, type KindDetail, kindDetails } from "./kind-details";

/** The value a verdict reports, with Steam's word; throws for a verdict without one. */
function facetFor(verdict: AnyDisclosed): FacetDefinition<FacetId> {
  const facet = facetOf(verdict);
  if (facet === undefined) {
    throw new TypeError(verdict.kind);
  }
  return facet;
}

describe("kindDetails", () => {
  const notes = make.text.note();
  const service = make.text.service();
  const kernelName = make.text.service();
  const anticheatName = make.text.service();
  const drmText = make.text.service();
  const limit = make.text.note();
  const accountText = make.text.service();
  const eulas = [make.text.name(), make.text.name()];
  const ai = make.verdict.disclosed("ai", { notes, service });
  const { service: _service, ...unnamedAi } = ai;
  const { name: _kernelName, bootProtection: _boot, ...plainKernel } = make.verdict.disclosed(
    "kernel",
  );
  const anticheat = make.verdict.disclosed("anticheat", { name: anticheatName });
  const { name: _anticheatName, ...unnamedAnticheat } = anticheat;
  const drm = make.verdict.disclosed("drm", { text: drmText, activationLimit: limit });
  const { activationLimit: _limit, ...unlimitedDrm } = drm;
  const account = make.verdict.disclosed("account", { text: accountText });
  const AI_NOTES: KindDetail = { kind: "quote", text: notes };
  const DRM_TEXT: KindDetail = { kind: "text", text: drmText };
  const ACCOUNT_TEXT: KindDetail = { kind: "text", text: accountText };

  it.each<readonly [string, AnyDisclosed, readonly KindDetail[]]>([
    ["the AI notes and the service the developer named", ai, [
      AI_NOTES,
      { kind: "labeled", key: "badge_card_service_label", text: service },
    ]],
    ["the AI notes alone without a service", unnamedAi, [AI_NOTES]],
    ["the AI notes alone with an empty service", { ...ai, service: "" }, [AI_NOTES]],
    [
      "the kernel anti-cheat's name, leftover note and boot protection",
      make.verdict.disclosed("kernel", { name: kernelName, uninstallsCompletely: false }),
      [
        { kind: "text", text: kernelName },
        { kind: "message", key: "kind_kernel_uninstall" },
        { kind: "message", key: "kind_kernel_boot" },
      ],
    ],
    ["nothing for a kernel anti-cheat that cleans up, with no boot protection", plainKernel, []],
    ["the name of an anti-cheat that is not kernel level", anticheat, [
      { kind: "text", text: anticheatName },
    ]],
    ["nothing for an unnamed anti-cheat that is not kernel level", unnamedAnticheat, []],
    ["the DRM text and the activation limit", drm, [DRM_TEXT, { kind: "text", text: limit }]],
    ["the DRM text alone without a limit", unlimitedDrm, [DRM_TEXT]],
    ["the account text and the note that it links to Steam", account, [
      ACCOUNT_TEXT,
      { kind: "message", key: "kind_account_links" },
    ]],
    ["the account text alone when it does not link", { ...account, linksToSteam: false }, [
      ACCOUNT_TEXT,
    ]],
    [
      "every EULA by name",
      make.verdict.disclosed("eula", { items: eulas.map((name) => ({ name })) }),
      eulas.map((name): KindDetail => ({ kind: "text", text: name })),
    ],
    [
      "the PvP categories Steam lists, in order, skipping others",
      make.verdict.disclosed("pvp", { categoryIds: [37, 49, 9] }),
      [
        { kind: "message", key: "kind_pvp_category_split" },
        { kind: "message", key: "kind_pvp_category_pvp" },
      ],
    ],
    ["no line for IAP, whose heading is Steam's category name", make.verdict.disclosed("iap"), []],
  ])("gives %s", (_name, verdict, lines) => {
    expect(kindDetails(verdict)).toEqual(lines);
  });

  describe("for early access", () => {
    const note = make.text.note();
    const { released, updated } = make.fixture;
    const noted = make.verdict.disclosed("earlyaccess", { note, released });
    const { note: _note, released: _released, ...bare } = noted;
    const NOTE: KindDetail = { kind: "quote", text: note };
    const RELEASED: KindDetail = {
      kind: "dated",
      key: "kind_earlyaccess_released",
      time: released,
    };
    const UPDATED: KindDetail = { kind: "dated", key: "kind_earlyaccess_updated", time: updated };

    it.each<readonly [string, AnyDisclosed, readonly KindDetail[]]>([
      ["the note, the release date and the latest update, in that order", { ...noted, updated }, [
        NOTE,
        RELEASED,
        UPDATED,
      ]],
      ["no update line without the page's time", noted, [NOTE, RELEASED]],
      ["the dates without a note", { ...bare, released, updated }, [RELEASED, UPDATED]],
      ["nothing for a flag with no detail", bare, []],
      ["no quote for an empty note", { ...noted, note: "" }, [RELEASED]],
    ])("gives %s", (_name, verdict, lines) => {
      expect(kindDetails(verdict)).toEqual(lines);
    });
  });

  it.each(COMPAT_FACETS)("gives a device rated %s Steam's word for it as its one line", (facet) => {
    expect(kindDetails(make.verdict.disclosed("machine", { facet }))).toEqual([
      { kind: "message", key: `kind_compat_${facet}` },
    ]);
  });
});

describe("chipText", () => {
  const LOCALES = [["en", englishI18n()], ["es", createI18n(SHIPPED_CATALOGS, "es")]] as const;
  const own = make.chipText();
  type Chip = readonly [TagKind, FacetDefinition<FacetId> | undefined, BareMessageKey];
  /** Every chip with the key of Steam's words its name ends with. */
  const CHIPS: readonly Chip[] = [
    // A kind without values: the heading.
    ...KINDS.filter((kind) => kind.facets === undefined).map((kind): Chip => [
      kind,
      undefined,
      kind.messages.heading,
    ]),
    // A value with the shared chip: the heading too.
    ...KINDS.flatMap((kind) =>
      (kind.facets ?? []).filter((facet) => facet.chip === undefined).map((facet): Chip => [
        kind,
        facet,
        kind.messages.heading,
      ])
    ),
    // A value with a chip of its own: its word, which names the kind by itself.
    ...KINDS.flatMap((kind) =>
      (kind.facets ?? []).filter((facet) => facet.chip !== undefined).map((facet): Chip => [
        kind,
        facet,
        facet.word,
      ])
    ),
  ];
  const CASES = LOCALES.flatMap(([locale, i18n]) =>
    CHIPS.flatMap(([kind, facet, steam]) =>
      [undefined, own].map((text) =>
        [locale, kind.id, facet?.id ?? "-", text, i18n, kind, facet, steam] as const
      )
    )
  );

  it.each(CASES)(
    "names the %s %s chip (value %s, own text %s) by its visible text, then Steam's words",
    (_locale, _id, _value, text, i18n, kind, facet, steam) => {
      const { label, name } = chipText(i18n, kind, facet, text);
      expect(name.startsWith(label)).toBe(true);
      expect(name.endsWith(i18n.t(steam))).toBe(true);
    },
  );

  it.each(
    LOCALES.flatMap(([locale, i18n]) =>
      STATUS_KINDS.flatMap((id) => COMPAT_FACETS.map((facet) => [locale, id, facet, i18n] as const))
    ),
  )("puts the %s own text of %s rated %s before Steam's value word", (_locale, id, facet, i18n) => {
    const value = i18n.t(`kind_compat_${facet}`);
    const rated = facetFor(make.verdict.disclosed(id, { facet }));
    expect(chipText(i18n, KIND_BY_ID[id], rated, own).label).toBe(
      i18n.t("kind_facet_chip", { chip: own, value }),
    );
  });

  it.each(FAMILY_FACETS)("lets own text replace the whole chip of the family value %s", (value) => {
    const i18n = englishI18n();
    const facet = facetFor(make.verdict.disclosed("family", { facet: value }));
    const { label, name } = chipText(i18n, FAMILY_KIND, facet, own);
    expect(label).toBe(own);
    expect(name).toBe(i18n.t("kind_chip_name", { chip: own, heading: i18n.t(facet.word) }));
  });

  it.each<readonly [string, TagKind, FacetDefinition<FacetId> | undefined]>([
    ["pvp", KIND_BY_ID.pvp, undefined],
    [
      "family supported",
      FAMILY_KIND,
      facetFor(make.verdict.disclosed("family", { facet: "supported" })),
    ],
  ])("says the words of the %s chip once, as they equal Steam's", (_name, kind, facet) => {
    const { label, name } = chipText(englishI18n(), kind, facet, undefined);
    expect(name).toBe(label);
  });
});
