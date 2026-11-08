import { describe, expect, it } from "vitest";
import { encodeSettings } from "../../src/core/settings/settings";
import type { StoredSettings } from "../../src/core/settings/settings-source";
import { ALLOW_KEY, SETTINGS_KEY } from "../../src/core/storage-keys";
import { make } from "../helpers/factory";
import { writeSettings } from "../helpers/settings";

/** One platform's stored settings, with a hand on that platform's storage change event. */
export interface RemoteSettingsHarness {
  readonly settings: StoredSettings;
  /** Another context stores `value` under `key`, and the platform reports the change. */
  readonly change: (key: string, value: unknown) => void;
}

/** Subscribes to `settings` and returns what the subscriber hears, and how to leave. */
function listen(settings: StoredSettings) {
  const heard: unknown[] = [];
  const unsubscribe = settings.subscribe((value) => heard.push(value));
  return { heard, unsubscribe };
}

/**
 * How settings changes from other contexts reach a subscriber on every platform: the extension's
 * `storage.onChanged`, the userscript manager's value change listener. `harness` returns new
 * settings over an empty store for each case.
 */
export function remoteSettingsContract(name: string, harness: () => RemoteSettingsHarness): void {
  describe(`remote settings contract: ${name}`, () => {
    it("passes a change of the settings value on, until unsubscribed", () => {
      const { settings, change } = harness();
      const { heard, unsubscribe } = listen(settings);
      const first = encodeSettings(make.settings.kind("ai", { filter: "hide" }));
      change(SETTINGS_KEY, first);
      unsubscribe();
      change(SETTINGS_KEY, encodeSettings(make.settings.kind("ai", { filter: "dim" })));
      expect(heard).toStrictEqual([first]);
    });

    it("passes no change of another key on", () => {
      const { settings, change } = harness();
      const { heard } = listen(settings);
      change(ALLOW_KEY, make.raw.noGames());
      expect(heard).toStrictEqual([]);
    });

    it("tells its own write once, although the platform reports it too", async () => {
      const { settings, change } = harness();
      const { heard } = listen(settings);
      const next = make.settings.kind("ai", { banner: false });
      await writeSettings(settings, next);
      change(SETTINGS_KEY, encodeSettings(next));
      expect(heard).toStrictEqual([encodeSettings(next)]);
    });
  });
}
