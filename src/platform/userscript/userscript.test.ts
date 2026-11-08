// @vitest-environment-options {"url":"https://store.steampowered.com/search/?term=roguelike"}
import { afterEach, describe, expect, it } from "vitest";
import searchItems from "../../../tests/fixtures/getitems/search-roguelike-50.json";
import { make } from "../../../tests/helpers/factory";
import { fake } from "../../../tests/helpers/fakes";
import { englishI18n } from "../../../tests/helpers/i18n";
import { loadPage } from "../../../tests/helpers/surfaces";
import type { App } from "../../core/app";
import type { KindId } from "../../core/kinds/id";
import { encodeSettings } from "../../core/settings/settings";
import { isVerdictKey, SETTINGS_KEY } from "../../core/storage-keys";
import { startUserscript, type UserscriptEnv } from "./userscript";

const i18n = englishI18n();
// The captured row of 4461450 carries the AI and the Early Access tags.
const DISCLOSED_BADGES = 2;

/** The list filter mode the page root carries for `kind`. */
function filterOf(kind: KindId): string | null {
  return document.documentElement.getAttribute(`data-sar-filter-${kind}`);
}

let app: App | undefined;

function setup(overrides: Partial<UserscriptEnv> = {}) {
  loadPage(make.page.surface("search"));
  document.documentElement.lang = "en";
  const gm = fake.gm();
  const server = fake.fetch([make.item.route(make.fixture.items(searchItems))]);
  const commands = new Map<string, () => void>();
  const added: string[] = [];
  const env: UserscriptEnv = {
    document,
    storage: gm,
    fetch: server.fetch,
    console: fake.console(),
    addStyle: (css) => added.push(css),
    watchValue: undefined,
    registerMenuCommand: (caption, run) => commands.set(caption, run),
    ...overrides,
  };
  return { env, gm, server, commands, added };
}

afterEach(() => {
  app?.stop();
  app = undefined;
  document.querySelector(".sar-dialog-host")?.remove();
  document.documentElement.removeAttribute("data-sar-filter");
});

describe("startUserscript", () => {
  it("badges the search rows with one cookie-less GetItems request", async () => {
    const { env, server, gm, added } = setup();
    app = await startUserscript(env);
    await expect.poll(() => document.querySelectorAll(".sar-badge").length).toBe(DISCLOSED_BADGES);

    expect(server.calls).toHaveLength(1);
    expect(server.calls[0]?.init.credentials).toBe("omit");
    // The verdicts went to GM storage, not to the page
    expect(gm.writes.some(isVerdictKey)).toBe(true);
    // The page CSS went through addStyle, not through adopted sheets
    expect(added.join(" ")).toContain(".sar-badge");
    expect(document.adoptedStyleSheets).toHaveLength(0);
  });

  it("falls back to core's own page styles where addStyle throws", async () => {
    const { env } = setup({
      addStyle: () => {
        throw new TypeError();
      },
    });
    app = await startUserscript(env);

    expect(
      document.adoptedStyleSheets.length + document.querySelectorAll("style.sar-styles").length,
    )
      .toBeGreaterThan(0);
  });

  it("registers the settings menu command, which opens the dialog", async () => {
    const { env, commands } = setup();
    app = await startUserscript(env);

    const caption = i18n.t("userscript_menu_settings");
    expect([...commands.keys()]).toStrictEqual([caption]);
    commands.get(caption)?.();
    await expect.poll(() => document.querySelector(".sar-dialog-host")).not.toBeNull();
    const dialog = document.querySelector(".sar-dialog-host")?.shadowRoot?.querySelector("dialog");
    expect(dialog?.open).toBe(true);
    // No value change listener here, so the dialog says settings apply on reload
    expect(dialog?.querySelector(".sar-dialog-note")).not.toBeNull();
  });

  it("applies settings changed in another tab where the manager reports them", async () => {
    const watch = fake.watch();
    const { env } = setup({ watchValue: watch.watch });
    app = await startUserscript(env);
    expect(filterOf("ai")).toBe("off");

    watch.notify(SETTINGS_KEY, encodeSettings(make.settings.kind("ai", { filter: "hide" })));
    expect([filterOf("ai"), filterOf("drm")]).toStrictEqual(["hide", "off"]);
  });

  it("starts on stored settings", async () => {
    const { env, gm } = setup();
    await gm.setValue(
      SETTINGS_KEY,
      encodeSettings(make.settings.kind("ai", { filter: "dim" })),
    );
    app = await startUserscript(env);

    expect(filterOf("ai")).toBe("dim");
  });
});
