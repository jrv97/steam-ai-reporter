import { describe, expect, it } from "vitest";
import { APP_PAGES, type AppPageName } from "../../../tests/helpers/app-page";
import { englishI18n } from "../../../tests/helpers/i18n";
import { type PageInput, parsePageDetails } from "./page-details";

function doc(html: string): Document {
  return new DOMParser().parseFromString(html, "text/html");
}

const NO_DRM: PageInput = { bootProtection: false, drmText: undefined };
const BOOT: PageInput = { bootProtection: true, drmText: undefined };

function details(name: AppPageName, input: PageInput = NO_DRM) {
  return parsePageDetails(doc(APP_PAGES[name]), input);
}

/** An app page whose features list holds `notices`. */
function page(notices: string): Document {
  return doc(`<html><body><div id="category_block">${notices}</div></body></html>`);
}

describe("parsePageDetails over the captured pages", () => {
  it("reads the custom anti-cheat name and the boot protection line (2807960)", () => {
    expect(details("2807960-kernel-boot-protection.html", BOOT)).toStrictEqual({
      anticheatName: "EA Javelin Anticheat",
      bootProtection: englishI18n().t("kind_kernel_boot"),
    });
  });

  it("takes the first line for the name when no boot protection is declared", () => {
    expect(details("2807960-kernel-boot-protection.html")).toStrictEqual({
      anticheatName: "EA Javelin Anticheat",
    });
  });

  it("reads a named kernel anti-cheat without its removal note (1172470)", () => {
    expect(details("1172470-kernel-easyac.html")).toStrictEqual({
      anticheatName: "Easy Anti-Cheat",
    });
  });

  it("reads no boot line from a page that has none, if declared (1172470)", () => {
    expect(details("1172470-kernel-easyac.html", BOOT)).toStrictEqual({});
  });

  it("reads a non-kernel anti-cheat section (730)", () => {
    expect(details("730-anticheat-nonkernel.html")).toStrictEqual({
      anticheatName: "VAC (Valve Anti-Cheat)",
    });
  });

  it("reads the activation limit of the notice that holds the DRM text (3751950)", () => {
    const input = { bootProtection: false, drmText: "Denuvo Anti-tamper" };
    expect(details("3751950-drm-account-eula.html", input)).toStrictEqual({
      activationLimit: "5 a day machine activation limit",
    });
  });

  it("reads no limit when the DRM text is absent, blank or not on the page", () => {
    for (const drmText of [undefined, "", "  ", "Easy Anti-Cheat"]) {
      const input = { bootProtection: false, drmText };
      expect(details("3751950-drm-account-eula.html", input)).toStrictEqual({});
    }
  });

  it("finds nothing on pages without those notices", () => {
    const names: readonly AppPageName[] = [
      "1808500-ai-only.html",
      "413150-no-block.html",
      "5072580-ai-first.html",
      "99999999-home-redirect.html",
    ];
    const input = { bootProtection: true, drmText: "Denuvo" };
    for (const name of names) {
      expect(details(name, input).activationLimit).toBeUndefined();
    }
    expect(details("413150-no-block.html", input)).toStrictEqual({});
    expect(parsePageDetails(doc(""), input)).toStrictEqual({});
  });
});

describe("parsePageDetails features list", () => {
  const notice = '<div class="DRM_notice">Zxcv: Denuvo<br>12 uiop</div>';
  const input = { bootProtection: false, drmText: "Denuvo" };

  it("reads only inside #category_block", () => {
    const outside = doc(`<html><body>${notice}</body></html>`);
    expect(parsePageDetails(outside, input)).toStrictEqual({});
    const elsewhere = doc(
      `<html><body><div id="category_block"></div><div id="other">${notice}</div></body></html>`,
    );
    expect(parsePageDetails(elsewhere, input)).toStrictEqual({});
    expect(parsePageDetails(page(notice), input)).toStrictEqual({ activationLimit: "12 uiop" });
  });

  it("gives nothing for anti-cheat lines outside #category_block", () => {
    const line = '<div class="anticheat_section"><div class="anticheat_name">Stray</div></div>';
    const outside = doc(`<html><body>${line}<div id="category_block"></div></body></html>`);
    expect(parsePageDetails(outside, NO_DRM)).toStrictEqual({});
  });
});

describe("parsePageDetails anti-cheat lines", () => {
  const name =
    '<div class="anticheat_name">Custom AC<span class="anticheat_uninstalls"></span></div>';
  const boot =
    '<div class="anticheat_name">Boot<span class="anticheat_uninstalls"> - TPM</span></div>';
  const section = (lines: string) =>
    `<div class="anticheat_section DRM_notice"><div>Kernel</div>${lines}</div>`;

  it("tells the boot line from the name line by the declaration, not by their words", () => {
    expect(parsePageDetails(page(section(name + boot)), BOOT)).toStrictEqual({
      anticheatName: "Custom AC",
      bootProtection: "Boot - TPM",
    });
    expect(parsePageDetails(page(section(name + boot)), NO_DRM)).toStrictEqual({
      anticheatName: "Custom AC",
    });
  });

  it("takes neither a name nor a boot line from one line when boot protection is declared", () => {
    expect(parsePageDetails(page(section(boot)), BOOT)).toStrictEqual({});
    expect(parsePageDetails(page(section(name)), BOOT)).toStrictEqual({});
  });

  it("takes a single line as the name when no boot protection is declared", () => {
    expect(parsePageDetails(page(section(boot)), NO_DRM)).toStrictEqual({ anticheatName: "Boot" });
  });

  it("ignores empty lines and lines outside the anti-cheat section", () => {
    const empty =
      '<div class="anticheat_name"><span class="anticheat_uninstalls"> - x</span></div>';
    const stray = '<div class="anticheat_name">Stray</div>';
    expect(parsePageDetails(page(section(empty) + stray), NO_DRM)).toStrictEqual({});
  });

  it("keeps the text of a line as text, never as markup", () => {
    const hostile = '<div class="anticheat_name">&lt;img src=x onerror=alert(1)&gt;</div>';
    expect(parsePageDetails(page(section(hostile)), NO_DRM)).toStrictEqual({
      anticheatName: "<img src=x onerror=alert(1)>",
    });
  });
});

describe("parsePageDetails activation limit", () => {
  const plain = (inner: string, attrs = "") => `<div class="DRM_notice"${attrs}>${inner}</div>`;
  const input = { bootProtection: false, drmText: "Denuvo" };

  it("reads the line after the break whatever language the notice speaks", () => {
    const foreign = plain("Zxcv qwer 3rd: Denuvo<br>12 uiop asdf jkl");
    expect(parsePageDetails(page(foreign), input)).toStrictEqual({
      activationLimit: "12 uiop asdf jkl",
    });
  });

  it("ignores the other notices: account, EULA, AI service and anti-cheat", () => {
    const others = [
      plain("Account:&nbsp;Denuvo&nbsp;(Links)"),
      plain("<div>Denuvo</div><div><a href='/eula/1'>x</a></div>", ' role="button"'),
      plain("Connects to:&nbsp;<a href='https://openai.com/api/'>Denuvo</a>"),
      '<div class="anticheat_section DRM_notice">Denuvo<br>Line</div>',
    ];
    for (const notice of others) {
      expect(parsePageDetails(page(notice), input)).toStrictEqual({});
    }
  });

  it("ignores a notice that holds anything but a text, one break and a text", () => {
    const shapes = [
      plain("Denuvo<br>"),
      plain("Denuvo<br> "),
      plain("Denuvo<br><br>5 a day"),
      plain("Denuvo<br><b>5 a day</b>"),
      plain("<b>Denuvo</b><br>5 a day"),
      plain("Denuvo<br>5 a day", ' role="button"'),
    ];
    for (const shape of shapes) {
      expect(parsePageDetails(page(shape), input).activationLimit).toBeUndefined();
    }
  });

  it("ignores an account text with a line break, since it lacks the DRM text", () => {
    const account = plain("Requires an account: Ubisoft<br>Connect");
    expect(parsePageDetails(page(account), input)).toStrictEqual({});
  });

  it("ignores a DRM text with a line break of its own", () => {
    const withBreak = { bootProtection: false, drmText: "Denuvo\nAnti-tamper" };
    const notice = plain("DRM: Denuvo<br>Anti-tamper");
    expect(parsePageDetails(page(notice), withBreak)).toStrictEqual({});
  });

  it("takes the first notice that holds the DRM text and has a limit", () => {
    const notices = plain("A: Denuvo<br>first") + plain("B: Denuvo<br>second");
    expect(parsePageDetails(page(notices), input)).toStrictEqual({ activationLimit: "first" });
  });
});
