import { describe, expect, it } from "vitest";
import { fake } from "../../../tests/helpers/fakes";
import { AUTO_LOCALE } from "../settings/settings";
import { createSettingsSource } from "../settings/settings-source";
import { readSettingsI18n } from "./settings-i18n";
import { SHIPPED_CATALOGS } from "./shipped";

describe("readSettingsI18n", () => {
  it("falls back to the default setting and logs a failed read once", async () => {
    const store = fake.countingStore(fake.store());
    store.break();
    const sink = fake.console();
    const { setting, i18n } = await readSettingsI18n(
      createSettingsSource(store),
      SHIPPED_CATALOGS,
      { browserLang: "es" },
      sink,
    );
    expect([setting, i18n.locale]).toStrictEqual([AUTO_LOCALE, "es"]);
    expect(sink.error).toHaveBeenCalledExactlyOnceWith(
      "[tks]",
      i18n.t("error_unexpected"),
      expect.any(Error),
    );
  });
});
