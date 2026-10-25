// @vitest-environment-options {"url":"https://store.steampowered.com/search/?term=roguelike"}
import { afterEach, describe, expect, it, vi } from "vitest";
import searchItems from "../../../tests/fixtures/getitems/search-roguelike-50.json";
import { fakeFetch } from "../../../tests/helpers/fake-http";
import { fixtureItems, getItemsRoute } from "../../../tests/helpers/getitems";
import { fakeGm } from "../../../tests/helpers/gm-fake";
import { englishI18n } from "../../../tests/helpers/i18n";
import { withKind } from "../../../tests/helpers/settings";
import { loadPage, SURFACES } from "../../../tests/helpers/surfaces";
import type { App } from "../../core/app";
import { DEFAULT_SETTINGS, encodeSettings } from "../../core/settings/settings";
import { SETTINGS_KEY } from "../../core/storage-keys";
import { startUserscript, type UserscriptEnv } from "./userscript";

const i18n = englishI18n();
const quiet = { error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn() };

let app: App | undefined;

function setup(overrides: Partial<UserscriptEnv> = {}) {
  loadPage(SURFACES.search);
  document.documentElement.lang = "en";
  const gm = fakeGm();
  const server = fakeFetch([getItemsRoute(fixtureItems(searchItems))]);
  const commands = new Map<string, () => void>();
  const added: string[] = [];
  const env: UserscriptEnv = {
    document,
    storage: gm,
    fetch: server.fetch,
    console: quiet,
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
  document.documentElement.removeAttribute("data-sar-badges");
});

describe("startUserscript", () => {
  it("badges the search rows with one cookie-less GetItems request", async () => {
    const { env, server, gm, added } = setup();
    app = await startUserscript(env);
    await expect.poll(() => document.querySelectorAll(".sar-badge").length).toBe(1);

    expect(server.calls).toHaveLength(1);
    expect(server.calls[0]?.init.credentials).toBe("omit");
    // The verdicts went to GM storage, not to the page
    expect(gm.writes.some((name) => name.startsWith("v1:a:"))).toBe(true);
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
    let notify: (value: unknown) => void = () => undefined;
    const { env } = setup({
      watchValue: (_key, onChange) => {
        notify = onChange;
      },
    });
    app = await startUserscript(env);
    expect(document.documentElement.getAttribute("data-sar-filter-ai")).toBe("off");

    notify(encodeSettings(withKind(DEFAULT_SETTINGS, "ai", { filter: "hide" })));
    expect(document.documentElement.getAttribute("data-sar-filter-ai")).toBe("hide");
    expect(document.documentElement.getAttribute("data-sar-filter-drm")).toBe("off");
  });

  it("starts on stored settings", async () => {
    const { env, gm } = setup();
    await gm.setValue(
      SETTINGS_KEY,
      encodeSettings(withKind(DEFAULT_SETTINGS, "ai", { filter: "dim" })),
    );
    app = await startUserscript(env);

    expect(document.documentElement.getAttribute("data-sar-filter-ai")).toBe("dim");
  });
});
