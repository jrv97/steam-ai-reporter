import { afterEach, describe, expect, it, vi } from "vitest";
import { APP_PAGES } from "../../../tests/helpers/app-page";
import { setBody } from "../../../tests/helpers/dom";
import {
  capturedPageDetails,
  capturedVerdicts,
  disclosedList,
} from "../../../tests/helpers/fixture-verdicts";
import { englishI18n } from "../../../tests/helpers/i18n";
import { disclosedVerdict, FULL_DISCLOSED } from "../../../tests/helpers/verdicts";
import type { PageDetails } from "../detect/page-details";
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
  return { shown, ignored: [], details: {}, ...extra };
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
  const actions: BannerActions = { ignore, restore };
  return {
    actions,
    ignore,
    restore,
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

  it("renders every developer text through textContent, never as markup", () => {
    const { banner, root } = setup();
    const markup = "<b>Denuvo</b>";
    banner.show(view([
      { ...FULL_DISCLOSED.drm, text: markup, activationLimit: "<i>5</i>" },
      { ...FULL_DISCLOSED.account, text: markup },
      { ...FULL_DISCLOSED.eula, items: [{ name: markup }] },
      { ...FULL_DISCLOSED.anticheat, name: markup },
    ]));
    expect(root.querySelector("b, i")).toBeNull();
    expect(texts(root, ".sar-banner-detail")).toContain(markup);
    expect(texts(root, ".sar-banner-detail")).toContain("<i>5</i>");
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
    const details: PageDetails = {};
    banner.show({ shown: [verdict], ignored: [], details });
    const aside = query(root, "aside");
    banner.show({ shown: [verdict], ignored: [], details });
    expect(query(root, "aside")).toBe(aside);
    banner.show({ shown: [verdict], ignored: ["ai"], details });
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
    banner.show(view(disclosedList(capturedVerdicts(1808500)), { ignored: ["pvp"] }));
    expect(add).not.toHaveBeenCalled();
  });
});

describe("the entries of the captured games", () => {
  it("lists DRM, the account and the EULA of a game, each under Steam's line", () => {
    const { banner, root } = setup();
    const shown = disclosedList(capturedVerdicts(3751950));
    const details = capturedPageDetails("3751950-drm-account-eula.html", 3751950);
    banner.show(view(shown, { details }));

    expect(texts(root, "h2")).toEqual(shown.map(heading));
    expect(texts(root, "h2")).toEqual([
      i18n.t("kind_drm_heading"),
      i18n.t("kind_account_heading"),
      i18n.t("kind_eula_heading"),
    ]);
    const lines = texts(root, ".sar-banner-detail");
    expect(lines).toContain("Denuvo Anti-tamper");
    expect(lines).toContain("5 a day machine activation limit");
    expect(lines).toContain("Ubisoft Account");
    expect(lines).toContain(i18n.t("kind_account_links"));
  });

  it("links a EULA to the store page only, in a new tab without an opener", () => {
    const { banner, root } = setup();
    banner.show(view(disclosedList(capturedVerdicts(1245620))));
    const anchors = [...root.querySelectorAll("a")];
    expect(anchors.map((anchor) => anchor.textContent)).toEqual([
      "ELDEN RING EULA",
      "ELDEN RING EULA (JP)",
    ]);
    expect(anchors.map((anchor) => anchor.getAttribute("href"))).toEqual([
      "https://store.steampowered.com/eula/1245620_eula_0",
      "https://store.steampowered.com/eula/1245620_eula_1",
    ]);
    for (const anchor of anchors) {
      expect(anchor.getAttribute("target")).toBe("_blank");
      expect(anchor.getAttribute("rel")).toBe("noopener noreferrer");
    }
  });

  it("shows the name of a EULA without a validated link as plain text", () => {
    const { banner, root } = setup();
    banner.show(view([
      {
        ...FULL_DISCLOSED.eula,
        items: [{ name: "Bad", url: "javascript:alert(1)" }, { name: "Plain" }],
      },
    ]));
    expect(root.querySelector("a")).toBeNull();
    expect(texts(root, ".sar-banner-detail")).toEqual(["Bad", "Plain"]);
  });

  it("shows a kernel anti-cheat with the name and the boot protection line of its page", () => {
    const { banner, root } = setup();
    const shown = disclosedList(capturedVerdicts(2807960));
    const details = capturedPageDetails("2807960-kernel-boot-protection.html", 2807960);
    banner.show(view(shown, { details }));
    expect(texts(root, "h2")).toEqual([
      i18n.t("kind_kernel_heading"),
      i18n.t("kind_account_heading"),
      i18n.t("kind_eula_heading"),
      i18n.t("kind_pvp_heading"),
    ]);
    const lines = texts(root, ".sar-banner-detail");
    expect(details.anticheatName).toBeDefined();
    expect(details.bootProtection).toBeDefined();
    expect(lines).toContain(details.anticheatName);
    expect(lines).toContain(details.bootProtection);
  });

  it("shows Steam's boot protection line when the page gives none", () => {
    const { banner, root } = setup();
    banner.show(view(disclosedList(capturedVerdicts(2807960))));
    expect(texts(root, ".sar-banner-detail")).toContain(i18n.t("kind_kernel_boot"));
  });

  it("shows the vendor and the removal note of a kernel anti-cheat", () => {
    const { banner, root } = setup();
    banner.show(view(disclosedList(capturedVerdicts(1172470))));
    const lines = texts(root, ".sar-banner-detail");
    expect(lines).toContain("Easy Anti-Cheat");
    expect(lines).toContain(i18n.t("kind_kernel_uninstall"));
  });

  it("shows the anti-cheat that is not kernel level by its name", () => {
    const { banner, root } = setup();
    banner.show(view(disclosedList(capturedVerdicts(730))));
    expect(texts(root, "h2")).toEqual([i18n.t("kind_anticheat_heading")]);
    expect(texts(root, ".sar-banner-detail")).toEqual(["VAC (Valve Anti-Cheat)"]);
  });

  it("shows the PvP categories of a game by Steam's names", () => {
    const { banner, root } = setup();
    banner.show(view(disclosedList(capturedVerdicts(105600))));
    expect(texts(root, "h2")).toEqual([i18n.t("kind_pvp_heading")]);
    expect(texts(root, ".sar-banner-detail")).toEqual([
      i18n.t("kind_pvp_category_pvp"),
      i18n.t("kind_pvp_category_online"),
    ]);
  });

  it("quotes the AI notes of a game that also declares an anti-cheat and a EULA", () => {
    const { banner, root } = setup();
    const shown = disclosedList(capturedVerdicts(1808500));
    banner.show(view(shown));
    expect(texts(root, "h2")).toEqual([
      i18n.t("kind_ai_heading"),
      i18n.t("kind_kernel_heading"),
      i18n.t("kind_eula_heading"),
      i18n.t("kind_pvp_heading"),
    ]);
    const [ai] = shown;
    expect(ai?.kind).toBe("ai");
    expect(query(root, "blockquote").textContent).toBe(ai?.kind === "ai" ? ai.notes : "");
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
    banner.show(view(disclosedList(capturedVerdicts(3751950))));
    expect(nameOf(root, query(root, "aside"))).toBe(i18n.t("banner_region_label"));
    banner.show(view([], { ignored: [ALLOW_ALL] }));
    expect(nameOf(root, query(root, "aside"))).toBe(i18n.t("banner_region_label"));
  });

  it("names each ignore button by its action and the kind it belongs to", () => {
    const { banner, root } = setup();
    banner.show(view(disclosedList(capturedVerdicts(3751950))));
    const buttons = [...root.querySelectorAll<HTMLButtonElement>(".sar-banner-action")];
    expect(buttons.map((button) => button.tagName)).toEqual(["BUTTON", "BUTTON", "BUTTON"]);
    expect(buttons.map((button) => nameOf(root, button))).toEqual([
      `${i18n.t("banner_ignore_kind")} ${i18n.t("kind_drm_heading")}`,
      `${i18n.t("banner_ignore_kind")} ${i18n.t("kind_account_heading")}`,
      `${i18n.t("banner_ignore_kind")} ${i18n.t("kind_eula_heading")}`,
    ]);
    expect(new Set(buttons.map((button) => button.id)).size).toBe(3);
  });

  it("starts every accessible name with the visible text of its button", () => {
    const { banner, root } = setup();
    banner.show(view(disclosedList(capturedVerdicts(3751950)), { ignored: ["pvp"] }));
    const controls = [...root.querySelectorAll("button")];
    expect(controls.length).toBeGreaterThan(4);
    for (const control of controls) {
      expect(nameOf(root, control).startsWith(control.textContent)).toBe(true);
    }
  });

  it("steps the headings down when it lists several kinds", () => {
    const { banner, root } = setup();
    banner.show(view([disclosedVerdict()]));
    expect(query(root, "aside").hasAttribute("data-sar-entries")).toBe(false);
    banner.show(view(disclosedList(capturedVerdicts(3751950))));
    expect(query(root, "aside").getAttribute("data-sar-entries")).toBe("many");
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
    const rest = withoutDrm(disclosedList(capturedVerdicts(3751950)));
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
    const shown = disclosedList(capturedVerdicts(3751950));
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
    expect(query(root, "[aria-live]").textContent).toBe(i18n.t("notice_marking_stopped"));
    expect(texts(root, "h2")).toEqual(withoutDrm(shown).map(heading));
  });

  it("ignores the game for all tags from the link below the entries", async () => {
    const shown = disclosedList(capturedVerdicts(3751950));
    const { root, ignore, calls, thenShow } = wired(view(shown));
    thenShow(view([], { ignored: [ALLOW_ALL] }));

    query(root, '.sar-banner-foot [data-sar-action="ignore"]').click();
    expect(ignore).toHaveBeenCalledWith(ALLOW_ALL);
    calls[0]?.resolve();
    await vi.waitFor(() => {
      expect(query(root, "aside").getAttribute("data-sar-variant")).toBe("ignored");
    });
    expect(root.activeElement).toBe(query(root, '[data-sar-action="undo"]'));
  });

  it("undoes an ignored kind and puts focus on its ignore button again", async () => {
    const shown = disclosedList(capturedVerdicts(3751950));
    const { root, restore, calls, thenShow } = wired(
      view(withoutDrm(shown), { ignored: ["drm"] }),
    );
    thenShow(view(shown));

    query(root, '[data-sar-action="undo"]').click();
    expect(restore).toHaveBeenCalledWith("drm");
    calls[0]?.resolve();
    await vi.waitFor(() => {
      expect(texts(root, "h2")).toHaveLength(3);
    });
    expect(root.activeElement).toBe(query(root, '.sar-banner-action[data-sar-scope="drm"]'));
    expect(query(root, "[aria-live]").textContent).toBe(i18n.t("notice_marking_restored"));
  });

  it("undoes an ignore for all tags and focuses the ignore link", async () => {
    const shown = disclosedList(capturedVerdicts(3751950));
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
