import { describe, expect, it } from "vitest";
import { SHIPPED_CATALOGS } from "../i18n/shipped";
import { createI18n } from "../i18n/t";
import { KINDS } from "../kinds/registry";
import { keyDescription, keyText } from "./kind-keys";

describe("the tag keys", () => {
  it.each(Object.keys(SHIPPED_CATALOGS))(
    "give each tag in %s a key that leads its name, Steam's heading after it, and another line",
    (locale) => {
      const i18n = createI18n(SHIPPED_CATALOGS, locale);
      const checks = KINDS.map((kind) => {
        const { label, name } = keyText(i18n, kind);
        return {
          leads: name.startsWith(label),
          heading: name.includes(i18n.t(kind.messages.heading)),
          differs: keyDescription(i18n, kind) !== label,
        };
      });
      expect(checks).toEqual(KINDS.map(() => ({ leads: true, heading: true, differs: true })));
    },
  );
});
