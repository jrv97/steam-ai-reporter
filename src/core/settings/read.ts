import type { SettingsSource } from "../ports";
import { DEFAULT_SETTINGS, parseSettings, type Settings } from "./settings";

/** The stored settings, or the defaults and the failure to read them. */
export interface SettingsRead {
  readonly settings: Settings;
  readonly failure: { readonly problem: unknown; } | undefined;
}

/** Reads the settings without rejecting; the caller decides how to report a failure. */
export async function readSettingsOrDefault(source: SettingsSource): Promise<SettingsRead> {
  try {
    return { settings: parseSettings(await source.read()), failure: undefined };
  } catch (problem) {
    return { settings: DEFAULT_SETTINGS, failure: { problem } };
  }
}
