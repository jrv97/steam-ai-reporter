import { afterEach, describe, expect, it, vi } from "vitest";
import { APP_PAGES } from "../../../tests/helpers/app-page";
import { bannerCreator, creatorNote, keyOf } from "../../../tests/helpers/creators";
import { setBody } from "../../../tests/helpers/dom";
import { bannerList, capturedVerdicts } from "../../../tests/helpers/fixture-verdicts";
import { englishI18n } from "../../../tests/helpers/i18n";
import { disclosedVerdict, FULL_DISCLOSED, lent } from "../../../tests/helpers/verdicts";
import { SHIPPED_CATALOGS } from "../i18n/shipped";
import { createI18n } from "../i18n/t";
import { KIND_BY_ID } from "../kinds/registry";
import type { AnyDisclosed } from "../kinds/verdicts";
import { ALLOW_ALL } from "../settings/allow-data";
import {
  type Banner,
  type BannerActions,
  type BannerOptions,
  type BannerView,
  createBanner,
  placeBanner,
} from "./banner";

function isEventTarget(value: object): value is EventTarget {
  return "addEventListener" in value;
}

const i18n = englishI18n();
const XSS = '<img src=x onerror="alert(1)">Backgrounds\r\nwere generated.';
const heading = (verdict: AnyDisclosed) => i18n.t(KIND_BY_ID[verdict.kind].messages.heading);
const ignoredKind = (kind: "drm" | "pvp") =>
  i18n.t("banner_ignored_kind", { heading: i18n.t(KIND_BY_ID[kind].messages.heading) });

function view(shown: readonly AnyDisclosed[], extra: Partial<BannerView> = {}): BannerView {
  return { shown, ignored: [], creators: [], creatorNotes: [], ...extra };
}

interface Pending {
  resolve(): void;
  reject(): void;
}

/** Actions whose promises the test settles by hand. A resolved action shows the owner's view. */
function manualActions() {
  const calls: Pending[] = [];
  let banner: Banner | undefined;
  let owner: BannerView | undefined;
  const settle = () =>
    new Promise<void>((resolve, reject) => {
      calls.push({
        resolve: () => {
          if (banner !== undefined && owner !== undefined) {
            banner.show(owner);
          }
          resolve();
        },
        reject: () => {
          reject(new Error());
        },
      });
    });
  const ignore = vi.fn(settle);
  const restore = vi.fn(settle);
  const ignoreCreator = vi.fn(settle);
  const restoreCreator = vi.fn(settle);
  const actions: BannerActions = { ignore, restore, ignoreCreator, restoreCreator };
  return {
    actions,
    ignore,
    restore,
    ignoreCreator,
    restoreCreator,
    calls,
    /** What the owner shows once the next action settles. */
    thenShow: (next: BannerView): void => {
      owner = next;
    },
    attach: (created: Banner): void => {
      banner = created;
    },
  };
}

function setup(options: BannerOptions = {}, actions: BannerActions = manualActions().actions) {
  setBody('<div class="game_description_column"><div id="game_area_purchase"></div></div>');
  const frames: (() => void)[] = [];
  const banner = createBanner(document, i18n, actions, {
    frame: (callback) => frames.push(callback),
    ...options,
  });
  placeBanner(document, banner.host);
  const root = banner.host.shadowRoot;
  if (root === null) {
    throw new TypeError();
  }
  const runFrames = () => {
    for (const callback of frames.splice(0)) {
      callback();
    }
  };
  return { banner, root, runFrames };
}

function query(root: ShadowRoot, selector: string): HTMLElement {
  const found = root.querySelector<HTMLElement>(selector);
  if (found === null) {
    throw new TypeError(selector);
  }
  return found;
}

/** The accessible name: the text of the elements `aria-labelledby` names, else `aria-label`. */
function nameOf(root: ShadowRoot, element: Element): string {
  const ids = element.getAttribute("aria-labelledby")?.split(" ") ?? [];
  if (ids.length > 0) {
    return ids.map((id) => root.getElementById(id)?.textContent ?? "").join(" ");
  }
  return element.getAttribute("aria-label") ?? element.textContent;
}

const texts = (root: ShadowRoot, selector: string) =>
  [...root.querySelectorAll(selector)].map((node) => node.textContent);

const withoutDrm = (shown: readonly AnyDisclosed[]) =>
  shown.filter((verdict) => verdict.kind !== "drm");

afterEach(() => {
  document.body.replaceChildren();
});

describe("createBanner", () => {
  it("renders the developer's notes verbatim, markup included, as plain text", () => {
    const { banner, root } = setup();
    banner.show(view([disclosedVerdict({ notes: XSS })]));
    const quote = query(root, "blockquote.sar-banner-quote");
    expect(quote.textContent).toBe('<img src=x onerror="alert(1)">Backgrounds\nwere generated.');
    expect(quote.children).toHaveLength(0);
    expect(root.querySelector("img")).toBeNull();
  });

  it("uses catalog copy and the developer as the source", () => {
    const { banner, root } = setup();
    banner.show(view([disclosedVerdict()]));
    expect(query(root, "h2").textContent).toBe(i18n.t("kind_ai_heading"));
    expect(query(root, ".sar-banner-source").textContent).toBe(i18n.t("banner_source"));
    expect(query(root, ".sar-banner-action").textContent).toBe(i18n.t("banner_ignore_kind"));
    expect(query(root, ".sar-banner-foot .sar-banner-link").textContent).toBe(
      i18n.t("banner_ignore"),
    );
    expect(root.querySelector("svg")).toBeNull();
  });

  it.each([["en", i18n], ["es", createI18n(SHIPPED_CATALOGS, "es")]] as const)(
    "says in %s that a full game's disclosure is the full game's, before the developer's words",
    (_locale, catalog) => {
      setBody('<div class="game_description_column"></div>');
      const banner = createBanner(document, catalog, manualActions().actions, {
        frame: () => undefined,
      });
      banner.show(view([lent(disclosedVerdict({ notes: XSS })), FULL_DISCLOSED.anticheat]));
      const root = banner.host.shadowRoot;
      const lines = [...(root?.querySelectorAll(".sar-banner-entry") ?? [])].map((entry) =>
        [...entry.querySelectorAll("p")].map((line) => line.textContent)
      );
      const service = `${catalog.t("badge_card_service_label")} Midjourney`;
      const full = [catalog.t("kind_full_game"), catalog.t("banner_source"), service];
      expect(lines).toEqual([full, []]);
      expect(root?.querySelector("blockquote")?.textContent).toBe(
        '<img src=x onerror="alert(1)">Backgrounds\nwere generated.',
      );
    },
  );

  it("names the AI service as plain text, never a link", () => {
    const { banner, root } = setup();
    banner.show(view([disclosedVerdict({ service: "<b>Midjourney</b>" })]));
    const service = query(root, ".sar-banner-service");
    expect(service.textContent).toBe(`${i18n.t("badge_card_service_label")} <b>Midjourney</b>`);
    expect(service.querySelector("a, b")).toBeNull();
  });

  it("omits the service line when the developer named none", () => {
    const { banner, root } = setup();
    banner.show(view([disclosedVerdict({ service: "" })]));
    expect(root.querySelector(".sar-banner-service")).toBeNull();
  });

  it("keeps long notes collapsed behind a toggle", () => {
    const { banner, root, runFrames } = setup({ overflows: () => true });
    banner.show(view([disclosedVerdict()]));
    const quote = query(root, ".sar-banner-quote");
    const toggle = query(root, '[data-sar-action="toggle"]');
    expect(toggle.hidden).toBe(true);
    runFrames();
    expect(toggle.hidden).toBe(false);
    toggle.click();
    expect(quote.getAttribute("data-sar-collapsed")).toBe("false");
    expect(toggle.getAttribute("aria-expanded")).toBe("true");
    expect(toggle.textContent).toBe(i18n.t("banner_collapse"));
    toggle.click();
    expect(quote.getAttribute("data-sar-collapsed")).toBe("true");
    expect(toggle.textContent).toBe(i18n.t("banner_expand"));
  });

  it("drops the clamp and the toggle for short notes", () => {
    const { banner, root, runFrames } = setup({ overflows: () => false });
    banner.show(view([disclosedVerdict()]));
    runFrames();
    expect(query(root, ".sar-banner-quote").hasAttribute("data-sar-collapsed")).toBe(false);
    expect(root.querySelector('[data-sar-action="toggle"]')).toBeNull();
  });

  it("does not rebuild for the same view", () => {
    const { banner, root } = setup();
    const verdict = disclosedVerdict();
    banner.show(view([verdict]));
    const aside = query(root, "aside");
    banner.show(view([verdict]));
    expect(query(root, "aside")).toBe(aside);
    banner.show(view([verdict], { ignored: ["ai"] }));
    expect(query(root, "aside")).not.toBe(aside);
  });

  it("adds no listener to the nodes it draws", () => {
    const { banner } = setup();
    // happy-dom defines addEventListener on its own prototype; spy where it actually lives.
    let owner = Reflect.getPrototypeOf(document.createElement("div"));
    while (owner !== null && !Object.hasOwn(owner, "addEventListener")) {
      owner = Reflect.getPrototypeOf(owner);
    }
    if (owner === null || !isEventTarget(owner)) {
      throw new TypeError();
    }
    const add = vi.spyOn(owner, "addEventListener");
    banner.show(view(bannerList(capturedVerdicts(1808500)), { ignored: ["pvp"] }));
    expect(add).not.toHaveBeenCalled();
  });
});

describe("the entries of the captured games", () => {
  it("lists DRM, the account, the EULA and IAP of a game, each as Steam's line", () => {
    const { banner, root } = setup();
    const shown = bannerList(capturedVerdicts(3751950));
    banner.show(view(shown));

    expect(texts(root, "h2")).toEqual(shown.map(heading));
    expect(texts(root, "h2")).toEqual([
      i18n.t("kind_drm_heading"),
      i18n.t("kind_account_heading"),
      i18n.t("kind_eula_heading"),
      i18n.t("kind_iap_heading"),
    ]);
  });

  it("leaves the short lines of a kind to Steam's own boxes and the hover card", () => {
    const { banner, root } = setup();
    banner.show(view(bannerList(capturedVerdicts(3751950))));
    expect(root.querySelector("a, blockquote, .sar-banner-service")).toBeNull();
    expect(root.textContent).not.toContain("Denuvo Anti-tamper");
    expect(root.textContent).not.toContain("Ubisoft Account");
    expect(root.textContent).not.toContain(i18n.t("kind_account_links"));
  });

  it.each([2807960, 1172470, 730, 105600, 1245620])(
    "gives each kind of game %i one line: its heading and its ignore button",
    (id) => {
      const { banner, root } = setup();
      const shown = bannerList(capturedVerdicts(id));
      banner.show(view(shown));
      expect(texts(root, "h2")).toEqual(shown.map(heading));
      expect(root.querySelectorAll(".sar-banner-entry")).toHaveLength(shown.length);
      expect(root.querySelectorAll(".sar-banner-action")).toHaveLength(shown.length);
      expect(root.querySelector("p:not(.sar-banner-error)")).toBeNull();
    },
  );

  it("quotes the AI notes of a game that also declares an anti-cheat and a EULA", () => {
    const { banner, root } = setup();
    const shown = bannerList(capturedVerdicts(1808500));
    banner.show(view(shown));
    expect(texts(root, "h2")).toEqual([
      i18n.t("kind_ai_heading"),
      i18n.t("kind_kernel_heading"),
      i18n.t("kind_eula_heading"),
      i18n.t("kind_pvp_heading"),
      i18n.t("kind_iap_heading"),
    ]);
    const [ai] = shown;
    expect(ai?.kind).toBe("ai");
    expect(texts(root, "blockquote")).toEqual([ai?.kind === "ai" ? ai.notes : ""]);
  });

  it("gives a quote an id of its own", () => {
    const { banner, root } = setup();
    banner.show(view([disclosedVerdict()]));
    const quote = query(root, "blockquote");
    expect(query(root, '[data-sar-action="toggle"]').getAttribute("aria-controls")).toBe(quote.id);
    expect(root.querySelectorAll(`[id="${quote.id}"]`)).toHaveLength(1);
  });
});

describe("the banner's accessibility", () => {
  it("labels the region by its heading when it shows one kind", () => {
    const { banner, root } = setup();
    banner.show(view([disclosedVerdict()]));
    const aside = query(root, "aside");
    expect(nameOf(root, aside)).toBe(i18n.t("kind_ai_heading"));
    expect(aside.hasAttribute("aria-label")).toBe(false);
    expect(aside.tabIndex).toBe(-1);
  });

  it("labels the region for the developer when it shows several kinds or only notes", () => {
    const { banner, root } = setup();
    banner.show(view(bannerList(capturedVerdicts(3751950))));
    expect(nameOf(root, query(root, "aside"))).toBe(i18n.t("banner_region_label"));
    banner.show(view([], { ignored: [ALLOW_ALL] }));
    expect(nameOf(root, query(root, "aside"))).toBe(i18n.t("banner_region_label"));
  });

  it("labels the region as Tag Kit's tags when an entry comes from Valve", () => {
    const { banner, root } = setup();
    banner.show(view([FULL_DISCLOSED.drm, FULL_DISCLOSED.deck]));
    expect(nameOf(root, query(root, "aside"))).toBe(i18n.t("badge_tags_title"));
  });

  it("names each ignore button by its action and the kind it belongs to", () => {
    const { banner, root } = setup();
    banner.show(view(bannerList(capturedVerdicts(3751950))));
    const buttons = [...root.querySelectorAll<HTMLButtonElement>(".sar-banner-action")];
    expect(buttons.map((button) => button.tagName)).toEqual([
      "BUTTON",
      "BUTTON",
      "BUTTON",
      "BUTTON",
    ]);
    expect(buttons.map((button) => nameOf(root, button))).toEqual([
      `${i18n.t("banner_ignore_kind")} ${i18n.t("kind_drm_heading")}`,
      `${i18n.t("banner_ignore_kind")} ${i18n.t("kind_account_heading")}`,
      `${i18n.t("banner_ignore_kind")} ${i18n.t("kind_eula_heading")}`,
      `${i18n.t("banner_ignore_kind")} ${i18n.t("kind_iap_heading")}`,
    ]);
    expect(new Set(buttons.map((button) => button.id)).size).toBe(4);
  });

  it("starts every accessible name with the visible text of its button", () => {
    const { banner, root } = setup();
    banner.show(view(bannerList(capturedVerdicts(3751950)), { ignored: ["pvp"] }));
    const controls = [...root.querySelectorAll("button")];
    expect(controls.length).toBeGreaterThan(4);
    for (const control of controls) {
      expect(nameOf(root, control).startsWith(control.textContent)).toBe(true);
    }
  });

  it("marks a one-tag banner with its kind and a several-tag banner with none", () => {
    const { banner, root } = setup();
    banner.show(view([disclosedVerdict()]));
    expect(query(root, "aside").getAttribute("data-sar-kind")).toBe("ai");
    const several = bannerList(capturedVerdicts(3751950));
    banner.show(view(several));
    expect(query(root, "aside").hasAttribute("data-sar-kind")).toBe(false);
    expect(query(root, "aside").hasAttribute("style")).toBe(false);
  });

  it("marks a banner with only notes for ignored scopes with no kind", () => {
    const { banner, root } = setup();
    banner.show(view([], { ignored: ["pvp"] }));
    expect(query(root, "aside").hasAttribute("data-sar-kind")).toBe(false);
  });

  it("steps the headings down when it lists several kinds", () => {
    const { banner, root } = setup();
    banner.show(view([disclosedVerdict()]));
    expect(query(root, "aside").hasAttribute("data-sar-entries")).toBe(false);
    banner.show(view(bannerList(capturedVerdicts(3751950))));
    expect(query(root, "aside").getAttribute("data-sar-entries")).toBe("many");
  });
});

describe("the banner in Spanish", () => {
  it("reads every line of the entries and the buttons from the Spanish catalog", () => {
    const spanish = createI18n(SHIPPED_CATALOGS, "es");
    setBody('<div class="game_description_column"></div>');
    const banner = createBanner(document, spanish, manualActions().actions, {
      frame: () => undefined,
    });
    const shown = bannerList(capturedVerdicts(3751950));
    banner.show(view(shown, { ignored: ["pvp"] }));
    const root = banner.host.shadowRoot;
    if (root === null) {
      throw new TypeError();
    }
    expect(texts(root, "h2")).toEqual(
      shown.map((verdict) => spanish.t(KIND_BY_ID[verdict.kind].messages.heading)),
    );
    expect(texts(root, ".sar-banner-action")).toEqual(
      shown.map(() => spanish.t("banner_ignore_kind")),
    );
    expect(texts(root, ".sar-banner-ignored-text")).toEqual([
      spanish.t("banner_ignored_kind", { heading: spanish.t("kind_pvp_heading") }),
    ]);
    expect(query(root, ".sar-banner-foot button").textContent).toBe(spanish.t("banner_ignore"));
    expect(spanish.t("banner_ignore_kind")).not.toBe(i18n.t("banner_ignore_kind"));
  });
});

describe("the notes for ignored scopes", () => {
  it("shows a game ignored for all tags as one line with Undo and nothing else", () => {
    const { banner, root } = setup();
    banner.show(view([], { ignored: [ALLOW_ALL] }));
    expect(query(root, "aside").getAttribute("data-sar-variant")).toBe("ignored");
    expect(query(root, ".sar-banner-ignored-text").textContent).toBe(i18n.t("banner_ignored"));
    expect(query(root, ".sar-banner-link").textContent).toBe(i18n.t("banner_undo"));
    expect(root.querySelector("blockquote, h2, .sar-banner-action, .sar-banner-foot")).toBeNull();
  });

  it("notes a kind ignored on its own beside the entries that remain", () => {
    const { banner, root } = setup();
    const rest = withoutDrm(bannerList(capturedVerdicts(3751950)));
    banner.show(view(rest, { ignored: ["drm"] }));
    expect(query(root, "aside").hasAttribute("data-sar-variant")).toBe(false);
    expect(texts(root, "h2")).toEqual(rest.map(heading));
    expect(query(root, ".sar-banner-ignored-text").textContent).toBe(ignoredKind("drm"));
    expect(nameOf(root, query(root, '[data-sar-action="undo"]'))).toBe(
      `${i18n.t("banner_undo")} ${ignoredKind("drm")}`,
    );
  });

  it("offers no ignore for all tags when no entry is left", () => {
    const { banner, root } = setup();
    banner.show(view([], { ignored: ["drm", "pvp"] }));
    expect(root.querySelector(".sar-banner-foot")).toBeNull();
    expect(texts(root, ".sar-banner-ignored-text")).toEqual([
      ignoredKind("drm"),
      ignoredKind("pvp"),
    ]);
  });
});

describe("ignoring from the banner", () => {
  function wired(initial: BannerView) {
    const wiring = manualActions();
    const { banner, root } = setup({}, wiring.actions);
    wiring.attach(banner);
    banner.show(initial);
    return { ...wiring, banner, root };
  }

  it("ignores one kind, moves focus to its Undo and announces it", async () => {
    const shown = bannerList(capturedVerdicts(3751950));
    const { root, ignore, calls, thenShow } = wired(view(shown));
    thenShow(view(withoutDrm(shown), { ignored: ["drm"] }));

    query(root, '.sar-banner-action[data-sar-scope="drm"]').click();
    query(root, '.sar-banner-action[data-sar-scope="drm"]').click();
    expect(ignore).toHaveBeenCalledTimes(1);
    expect(ignore).toHaveBeenCalledWith("drm");
    calls[0]?.resolve();
    await vi.waitFor(() => {
      expect(root.querySelector('[data-sar-action="undo"][data-sar-scope="drm"]')).not.toBeNull();
    });
    expect(root.activeElement).toBe(query(root, '[data-sar-action="undo"]'));
    await vi.waitFor(() => {
      expect(query(root, "[aria-live]").textContent).toBe(
        i18n.t("notice_marking_stopped_kind", { heading: heading(shown[0] ?? disclosedVerdict()) }),
      );
    });
    expect(texts(root, "h2")).toEqual(withoutDrm(shown).map(heading));
  });

  it("ignores the game for all tags from the link below the entries", async () => {
    const shown = bannerList(capturedVerdicts(3751950));
    const { root, ignore, calls, thenShow } = wired(view(shown));
    thenShow(view([], { ignored: [ALLOW_ALL] }));

    query(root, '.sar-banner-foot [data-sar-action="ignore"]').click();
    expect(ignore).toHaveBeenCalledWith(ALLOW_ALL);
    calls[0]?.resolve();
    await vi.waitFor(() => {
      expect(query(root, "aside").getAttribute("data-sar-variant")).toBe("ignored");
    });
    expect(root.activeElement).toBe(query(root, '[data-sar-action="undo"]'));
    await vi.waitFor(() => {
      expect(query(root, "[aria-live]").textContent).toBe(i18n.t("notice_marking_stopped"));
    });
  });

  it("undoes an ignored kind and puts focus on its ignore button again", async () => {
    const shown = bannerList(capturedVerdicts(3751950));
    const { root, restore, calls, thenShow } = wired(
      view(withoutDrm(shown), { ignored: ["drm"] }),
    );
    thenShow(view(shown));

    query(root, '[data-sar-action="undo"]').click();
    expect(restore).toHaveBeenCalledWith("drm");
    calls[0]?.resolve();
    await vi.waitFor(() => {
      expect(texts(root, "h2")).toHaveLength(4);
    });
    expect(root.activeElement).toBe(query(root, '.sar-banner-action[data-sar-scope="drm"]'));
    await vi.waitFor(() => {
      expect(query(root, "[aria-live]").textContent).toBe(
        i18n.t("notice_marking_restored_kind", { heading: i18n.t("kind_drm_heading") }),
      );
    });
  });

  it("undoes an ignore for all tags and focuses the ignore link", async () => {
    const shown = bannerList(capturedVerdicts(3751950));
    const { root, calls, thenShow } = wired(view([], { ignored: [ALLOW_ALL] }));
    thenShow(view(shown));

    query(root, '[data-sar-action="undo"]').click();
    calls[0]?.resolve();
    await vi.waitFor(() => {
      expect(root.querySelector("h2")).not.toBeNull();
    });
    expect(root.activeElement).toBe(query(root, '.sar-banner-foot [data-sar-action="ignore"]'));
  });

  it("keeps the entries and shows an error when the ignore list cannot be saved", async () => {
    const { root, calls } = wired(view([disclosedVerdict()]));
    query(root, ".sar-banner-action").click();
    calls[0]?.reject();
    await vi.waitFor(() => {
      expect(query(root, ".sar-banner-error").hidden).toBe(false);
    });
    expect(query(root, ".sar-banner-error").textContent).toBe(i18n.t("error_allow_list_save"));
    expect(query(root, ".sar-banner-error").getAttribute("role")).toBe("alert");
    expect(root.querySelector("blockquote")).not.toBeNull();
  });

  it("ignores a click that carries no known action or scope", () => {
    const { root, ignore } = wired(view([disclosedVerdict()]));
    const button = query(root, ".sar-banner-action");
    button.setAttribute("data-sar-scope", "nothing");
    button.click();
    button.setAttribute("data-sar-scope", "ai");
    button.setAttribute("data-sar-action", "other");
    button.click();
    expect(ignore).not.toHaveBeenCalled();
  });
});

describe("placeBanner", () => {
  it("puts the banner first in the description column, above the purchase box", () => {
    setBody(APP_PAGES["5072580-ai-first.html"]);
    const banner = createBanner(document, i18n, manualActions().actions);
    expect(placeBanner(document, banner.host)).toBe(true);
    const column = document.querySelector(".game_description_column");
    expect(column?.firstElementChild).toBe(banner.host);
    expect(banner.host.nextElementSibling?.id).toBe("game_area_purchase");
  });

  it("reports a page without the column", () => {
    setBody("<div></div>");
    const banner = createBanner(document, i18n, manualActions().actions);
    expect(placeBanner(document, banner.host)).toBe(false);
    expect(banner.host.isConnected).toBe(false);
  });
});

describe("the creators section", () => {
  const VALVE = bannerCreator("developer", ["Valve", 4]);
  const PUBLISHER = bannerCreator("publisher", ["Valve", 4]);
  const chip = (id: "ai" | "drm" | "account" | "iap") => i18n.t(KIND_BY_ID[id].messages.chip);
  const shown = bannerList(capturedVerdicts(3751950));

  function wired(initial: BannerView) {
    const wiring = manualActions();
    const { banner, root } = setup({}, wiring.actions);
    wiring.attach(banner);
    banner.show(initial);
    return { ...wiring, banner, root };
  }

  const rows = (root: ShadowRoot) =>
    [...root.querySelectorAll(".sar-banner-creator")].map((row) => ({
      label: row.querySelector(".sar-banner-creator-label")?.textContent,
      buttons: [...row.querySelectorAll("button")].map((button) => button.textContent),
    }));

  it("is a closed section with a row for each name and role, and a button for each tag", () => {
    const { banner, root } = setup();
    banner.show(view(shown, { creators: [VALVE, PUBLISHER] }));
    const section = query(root, "details.sar-banner-creators");
    expect(section.hasAttribute("open")).toBe(false);
    expect(query(root, "summary").textContent).toBe(i18n.t("banner_creators_toggle"));
    const tags = [
      i18n.t("banner_ignore_creator_kind", { chip: chip("drm") }),
      i18n.t("banner_ignore_creator_kind", { chip: chip("account") }),
      i18n.t("banner_ignore_creator_kind", { chip: i18n.t("kind_eula_chip") }),
      i18n.t("banner_ignore_creator_kind", { chip: chip("iap") }),
      i18n.t("banner_ignore_creator_all"),
    ];
    expect(rows(root)).toEqual([
      { label: `Valve ${i18n.t("banner_role_developer")}`, buttons: tags },
      { label: `Valve ${i18n.t("banner_role_publisher")}`, buttons: tags },
    ]);
  });

  it("names a button by its text and the creator's name and role", () => {
    const { banner, root } = setup();
    banner.show(view(shown, { creators: [VALVE] }));
    const first = query(root, ".sar-banner-creator button");
    expect(nameOf(root, first)).toBe(
      `${first.textContent} Valve ${i18n.t("banner_role_developer")}`,
    );
    const ids = [...root.querySelectorAll("[id]")].map((node) => node.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("leaves out the buttons for the scopes the creator is ignored in", () => {
    const { banner, root } = setup();
    const some = bannerCreator("developer", "Embark", ["drm"]);
    const all = bannerCreator("publisher", "Embark", [ALLOW_ALL]);
    banner.show(view(shown, { creators: [some, all] }));
    const [first, second] = rows(root);
    expect(first?.buttons).toHaveLength(4);
    expect(first?.buttons).not.toContain(
      i18n.t("banner_ignore_creator_kind", { chip: chip("drm") }),
    );
    expect(second?.buttons).toHaveLength(4);
    expect(second?.buttons).not.toContain(i18n.t("banner_ignore_creator_all"));
  });

  it("shows no section without an entry to ignore or without a creator", () => {
    const { banner, root } = setup();
    banner.show(
      view([], { creators: [VALVE], creatorNotes: [creatorNote("developer", "Valve", ALLOW_ALL)] }),
    );
    expect(root.querySelector("details")).toBeNull();
    banner.show(view(shown));
    expect(root.querySelector("details")).toBeNull();
  });

  it("writes the name as text, never as markup", () => {
    const { banner, root } = setup();
    const name = '<img src=x onerror="alert(1)">';
    banner.show(view(shown, { creators: [bannerCreator("developer", name)] }));
    expect(root.querySelector("img")).toBeNull();
    expect(query(root, ".sar-banner-creator-name").textContent).toBe(name);
  });

  it("keeps the section open across a redraw, and closed on a new banner", () => {
    const { banner, root } = setup();
    banner.show(view(shown, { creators: [VALVE] }));
    const section = query(root, "details");
    section.setAttribute("open", "");
    section.dispatchEvent(new Event("toggle"));
    banner.show(view(shown, { creators: [VALVE], ignored: ["pvp"] }));
    expect(query(root, "details").hasAttribute("open")).toBe(true);
    const fresh = setup();
    fresh.banner.show(view(shown, { creators: [VALVE] }));
    expect(query(fresh.root, "details").hasAttribute("open")).toBe(false);
  });

  it("notes a creator ignored for all tags or for one tag, with an Undo named by the note", () => {
    const { banner, root } = setup();
    banner.show(
      view(withoutDrm(shown), {
        creatorNotes: [
          creatorNote("developer", "Valve", ALLOW_ALL),
          creatorNote("publisher", ["Valve", 4], "drm"),
        ],
      }),
    );
    const who = (role: "developer" | "publisher") => ({
      name: "Valve",
      role: i18n.t(role === "developer" ? "banner_role_developer" : "banner_role_publisher"),
    });
    expect(texts(root, ".sar-banner-ignored-text")).toEqual([
      i18n.t("banner_ignored_creator", who("developer")),
      i18n.t("banner_ignored_creator_kind", {
        ...who("publisher"),
        heading: i18n.t("kind_drm_heading"),
      }),
    ]);
    const undo = query(root, '[data-sar-action="undo-creator"]');
    expect(nameOf(root, undo)).toBe(
      `${i18n.t("banner_undo")} ${i18n.t("banner_ignored_creator", who("developer"))}`,
    );
  });

  it("ignores a creator for one tag, moves focus to its Undo and announces it", async () => {
    const { root, ignoreCreator, calls, thenShow } = wired(view(shown, { creators: [VALVE] }));
    thenShow(
      view(withoutDrm(shown), {
        creators: [bannerCreator("developer", ["Valve", 4], ["drm"])],
        creatorNotes: [creatorNote("developer", ["Valve", 4], "drm")],
      }),
    );
    const button = [...root.querySelectorAll<HTMLElement>(".sar-banner-creator button")][0];
    button?.click();
    button?.click();
    expect(ignoreCreator).toHaveBeenCalledTimes(1);
    expect(ignoreCreator).toHaveBeenCalledWith("developer", VALVE.creator, "drm");
    calls[0]?.resolve();
    await vi.waitFor(() => {
      expect(root.activeElement).toBe(query(root, '[data-sar-action="undo-creator"]'));
    });
    await vi.waitFor(() => {
      expect(query(root, "[aria-live]").textContent).toBe(
        i18n.t("notice_creator_stopped_kind", {
          name: "Valve",
          role: i18n.t("banner_role_developer"),
          heading: i18n.t("kind_drm_heading"),
        }),
      );
    });
  });

  it("ignores a creator for all tags from its last button", async () => {
    const { root, ignoreCreator, calls, thenShow } = wired(view(shown, { creators: [VALVE] }));
    thenShow(view([], { creatorNotes: [creatorNote("developer", ["Valve", 4], ALLOW_ALL)] }));
    const buttons = [...root.querySelectorAll<HTMLElement>(".sar-banner-creator button")];
    buttons.at(-1)?.click();
    expect(ignoreCreator).toHaveBeenCalledWith("developer", VALVE.creator, ALLOW_ALL);
    calls[0]?.resolve();
    await vi.waitFor(() => {
      expect(query(root, "[aria-live]").textContent).toBe(
        i18n.t("notice_creator_stopped", { name: "Valve", role: i18n.t("banner_role_developer") }),
      );
    });
  });

  it("undoes with the key that is on the list, and focuses the ignore button again", async () => {
    const byName = { ...creatorNote("developer", ["Valve", 4], "drm"), key: keyOf("n:Valve") };
    const row = bannerCreator("developer", ["Valve", 4]);
    const { root, restoreCreator, calls, thenShow } = wired(
      view(withoutDrm(shown), { creators: [row], creatorNotes: [byName] }),
    );
    thenShow(view(shown, { creators: [row] }));
    query(root, '[data-sar-action="undo-creator"]').click();
    expect(restoreCreator).toHaveBeenCalledWith("developer", keyOf("n:Valve"), "drm");
    calls[0]?.resolve();
    await vi.waitFor(() => {
      expect(root.activeElement).toBe(
        query(root, '.sar-banner-creator button[data-sar-scope="drm"]'),
      );
    });
    await vi.waitFor(() => {
      expect(query(root, "[aria-live]").textContent).toBe(
        i18n.t("notice_creator_restored_kind", {
          name: "Valve",
          role: i18n.t("banner_role_developer"),
          heading: i18n.t("kind_drm_heading"),
        }),
      );
    });
  });

  it("keeps the view and shows the creator error when the list cannot be saved", async () => {
    const { root, calls } = wired(view(shown, { creators: [VALVE] }));
    query(root, ".sar-banner-creator button").click();
    calls[0]?.reject();
    await vi.waitFor(() => {
      expect(query(root, ".sar-banner-error").hidden).toBe(false);
    });
    expect(query(root, ".sar-banner-error").textContent).toBe(i18n.t("error_creator_list_save"));
    expect(root.querySelectorAll(".sar-banner-creator")).toHaveLength(1);
  });

  it.each([
    ["a role", "data-sar-role", "other"],
    ["a key", "data-sar-creator", "Valve"],
    ["a creator the view lacks", "data-sar-creator", "c:5"],
  ])("does nothing for %s it does not know", (_name, attribute, value) => {
    const { root, ignoreCreator, restoreCreator } = wired(view(shown, { creators: [VALVE] }));
    const button = query(root, ".sar-banner-creator button");
    button.setAttribute(attribute, value);
    button.click();
    expect(ignoreCreator).not.toHaveBeenCalled();
    expect(restoreCreator).not.toHaveBeenCalled();
  });

  it("redraws when a creator note or row changes, and not for the same view", () => {
    const { banner, root } = setup();
    banner.show(view(shown, { creators: [VALVE] }));
    const aside = query(root, "aside");
    banner.show(view(shown, { creators: [bannerCreator("developer", ["Valve", 4])] }));
    expect(query(root, "aside")).toBe(aside);
    banner.show(view(shown, { creators: [bannerCreator("developer", ["Valve", 4], ["pvp"])] }));
    expect(query(root, "aside")).not.toBe(aside);
    const other = query(root, "aside");
    banner.show(
      view(shown, {
        creators: [bannerCreator("developer", ["Valve", 4], ["pvp"])],
        creatorNotes: [creatorNote("developer", ["Valve", 4], "pvp")],
      }),
    );
    expect(query(root, "aside")).not.toBe(other);
  });

  it("reads every line of the section from the Spanish catalog", () => {
    const spanish = createI18n(SHIPPED_CATALOGS, "es");
    setBody('<div class="game_description_column"></div>');
    const banner = createBanner(document, spanish, manualActions().actions, {
      frame: () => undefined,
    });
    banner.show(
      view(shown, {
        creators: [VALVE],
        creatorNotes: [creatorNote("publisher", "Valve", ALLOW_ALL)],
      }),
    );
    const root = banner.host.shadowRoot;
    if (root === null) {
      throw new TypeError();
    }
    expect(query(root, "summary").textContent).toBe(spanish.t("banner_creators_toggle"));
    expect(query(root, ".sar-banner-creator-role").textContent).toBe(
      spanish.t("banner_role_developer"),
    );
    expect(query(root, ".sar-banner-ignored-text").textContent).toBe(
      spanish.t("banner_ignored_creator", {
        name: "Valve",
        role: spanish.t("banner_role_publisher"),
      }),
    );
    expect(spanish.t("banner_creators_toggle")).not.toBe(i18n.t("banner_creators_toggle"));
  });
});
