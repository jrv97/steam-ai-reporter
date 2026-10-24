import { describe, expect, it } from "vitest";
import { APP_PAGES, type AppPageName } from "../../../tests/helpers/app-page";
import { parsePageDetails } from "./page-details";

function doc(html: string): Document {
  return new DOMParser().parseFromString(html, "text/html");
}

function details(name: AppPageName, bootProtection = false) {
  return parsePageDetails(doc(APP_PAGES[name]), bootProtection);
}

/** An app page whose features list holds `notices`. */
function page(notices: string): Document {
  return doc(`<html><body><div id="category_block">${notices}</div></body></html>`);
}

describe("parsePageDetails over the captured pages", () => {
  it("reads the custom anti-cheat name and the boot protection line (2807960)", () => {
    expect(details("2807960-kernel-boot-protection.html", true)).toStrictEqual({
      anticheatName: "EA Javelin Anticheat",
      bootProtection: "Boot Protection - Requires both Secure Boot & TPM 2.0",
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

  it("reads a non-kernel anti-cheat section (730)", () => {
    expect(details("730-anticheat-nonkernel.html")).toStrictEqual({
      anticheatName: "VAC (Valve Anti-Cheat)",
    });
  });

  it("reads the activation limit of the DRM notice (3751950)", () => {
    expect(details("3751950-drm-account-eula.html")).toStrictEqual({
      activationLimit: "5 a day machine activation limit",
    });
  });

  it("finds nothing on pages without those notices", () => {
    const names: readonly AppPageName[] = [
      "1808500-ai-only.html",
      "413150-no-block.html",
      "5072580-ai-first.html",
      "99999999-home-redirect.html",
    ];
    for (const name of names) {
      expect(details(name, true).activationLimit).toBeUndefined();
    }
    expect(details("413150-no-block.html")).toStrictEqual({});
    expect(parsePageDetails(doc(""), true)).toStrictEqual({});
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
    expect(parsePageDetails(page(section(name + boot)), true)).toStrictEqual({
      anticheatName: "Custom AC",
      bootProtection: "Boot - TPM",
    });
    expect(parsePageDetails(page(section(name + boot)), false)).toStrictEqual({
      anticheatName: "Custom AC",
    });
  });

  it("reads a single line as the boot line when boot protection is declared", () => {
    expect(parsePageDetails(page(section(boot)), true)).toStrictEqual({
      bootProtection: "Boot - TPM",
    });
    expect(parsePageDetails(page(section(boot)), false)).toStrictEqual({ anticheatName: "Boot" });
  });

  it("ignores empty lines and lines outside the anti-cheat section", () => {
    const empty =
      '<div class="anticheat_name"><span class="anticheat_uninstalls"> - x</span></div>';
    const stray = '<div class="anticheat_name">Stray</div>';
    expect(parsePageDetails(page(section(empty) + stray), false)).toStrictEqual({});
  });

  it("keeps the text of a line as text, never as markup", () => {
    const hostile = '<div class="anticheat_name">&lt;img src=x onerror=alert(1)&gt;</div>';
    expect(parsePageDetails(page(section(hostile)), false)).toStrictEqual({
      anticheatName: "<img src=x onerror=alert(1)>",
    });
  });
});

describe("parsePageDetails activation limit", () => {
  const plain = (inner: string, attrs = "") => `<div class="DRM_notice"${attrs}>${inner}</div>`;

  it("reads the line after the break whatever language the notice speaks", () => {
    const foreign = plain("Zxcv qwer 3rd: Denuvo<br>12 uiop asdf jkl");
    expect(parsePageDetails(page(foreign), false)).toStrictEqual({
      activationLimit: "12 uiop asdf jkl",
    });
  });

  it("ignores the other notices: account, EULA, AI service and anti-cheat", () => {
    const others = [
      plain("Account:&nbsp;Ubisoft Account&nbsp;(Links)"),
      plain("<div>Agree</div><div><a href='/eula/1'>EULA</a></div>", ' role="button"'),
      plain("Connects to:&nbsp;<a href='https://openai.com/api/'>OpenAI API</a>"),
      '<div class="anticheat_section DRM_notice">Kernel<br>Line</div>',
    ];
    for (const notice of others) {
      expect(parsePageDetails(page(notice), false)).toStrictEqual({});
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
      expect(parsePageDetails(page(shape), false).activationLimit).toBeUndefined();
    }
  });

  it("takes the first notice that has a limit", () => {
    const notices = plain("A<br>first") + plain("B<br>second");
    expect(parsePageDetails(page(notices), false)).toStrictEqual({ activationLimit: "first" });
  });
});
