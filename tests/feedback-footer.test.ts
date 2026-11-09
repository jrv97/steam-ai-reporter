import { afterEach, describe, expect, it } from "vitest";
import readme from "../README.md?raw";
import { FEEDBACK_LINKS } from "../src/core/feedback-links";
import { LUCIDE_PATHS } from "../src/core/ui/lucide";
import { SETTINGS_CSS } from "../src/core/ui/styles";
import { openSettingsDialog } from "../src/platform/userscript/settings-dialog";
import { englishI18n } from "./helpers/i18n";
import { dialogDeps } from "./helpers/settings-dialog";
import { mountForm } from "./helpers/settings-form";

const i18n = englishI18n();

/** What a person sees of one link: its words, its decorative icon and where it goes. */
interface Shown {
  readonly label: string | null | undefined;
  readonly icon: readonly (string | null)[] | undefined;
  readonly href: string | null;
  readonly target: string | null;
  readonly rel: string | null;
}

const EXPECTED: readonly Shown[] = FEEDBACK_LINKS.map(({ label, icon, url }) => ({
  label: i18n.t(label),
  icon: LUCIDE_PATHS[icon],
  href: url,
  target: "_blank",
  rel: "noopener noreferrer",
}));

/** The drawing of an icon: the path data of each stroke, in order. */
function paths(icon: Element): readonly (string | null)[] {
  return [...icon.querySelectorAll("path")].map((path) => path.getAttribute("d"));
}

function shown(scope: ParentNode | null | undefined): readonly Shown[] {
  const links = scope?.querySelectorAll<HTMLAnchorElement>(".sar-feedback a") ?? [];
  return [...links].map((link) => {
    const icon = link.firstElementChild;
    return {
      label: link.lastElementChild?.textContent,
      icon: icon?.getAttribute("aria-hidden") === "true" ? paths(icon) : undefined,
      href: link.getAttribute("href"),
      target: link.getAttribute("target"),
      rel: link.getAttribute("rel"),
    };
  });
}

function dialogOf(doc: Document): ParentNode | undefined {
  return doc.querySelector(".sar-dialog-host")?.shadowRoot?.querySelector("dialog") ?? undefined;
}

type Surface = readonly [string, () => Promise<ParentNode | undefined>, readonly Shown[]];

const SURFACES: readonly Surface[] = [
  ["the options page", async () => (await mountForm()).root, EXPECTED],
  [
    "the userscript dialog",
    async () => {
      await openSettingsDialog(dialogDeps());
      return dialogOf(document);
    },
    EXPECTED,
  ],
  [
    "the toolbar popup",
    async () => (await mountForm({ context: "popup", layout: "list", colors: false })).root,
    [],
  ],
];

afterEach(() => {
  document.querySelector(".sar-dialog-host")?.remove();
  document.body.replaceChildren();
});

describe("feedback footer", () => {
  it.each(SURFACES)("%s", async (_, open, links) => {
    expect(shown(await open())).toEqual(links);
  });

  it("stays at the bottom of the view while the tabs scroll", () => {
    const sticky = /\.sar-feedback\s*\{[^}]*position:\s*sticky;[^}]*inset-block-end:/;
    expect(SETTINGS_CSS).toMatch(sticky);
  });

  it.each(FEEDBACK_LINKS)("is listed in the README with its icon: $id", ({ url, icon }) => {
    const line = readme.split("\n").find((each) => each.includes(url));
    expect(line).toContain(`/lucide/${icon}.svg`);
  });
});
