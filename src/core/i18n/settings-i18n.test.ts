import { describe, expect, it } from "vitest";
import { fake } from "../../../tests/helpers/fakes";
import { AUTO_LOCALE } from "../settings/settings";
import { createSettingsSource } from "../settings/settings-source";
import { readSettingsI18n } from "./settings-i18n";
import { SHIPPED_CATALOGS } from "./shipped";

describe("readSettingsI18n", () => {
  it("falls back to the default setting and returns the failed read", async () => {
    const store = fake.countingStore(fake.store());
    store.break();
    const { setting, i18n, failure } = await readSettingsI18n(
      createSettingsSource(store),
      SHIPPED_CATALOGS,
      { browserLang: "es" },
    );
    expect([setting, i18n.locale]).toStrictEqual([AUTO_LOCALE, "es"]);
    expect(failure?.problem).toBeInstanceOf(Error);
  });
});
