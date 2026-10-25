import easyAntiCheat from "../fixtures/app-page/1172470-kernel-easyac.html?raw";
import aiOnly from "../fixtures/app-page/1808500-ai-only.html?raw";
import liveDom from "../fixtures/app-page/1808500-live-dom.html?raw";
import kernelBootProtection from "../fixtures/app-page/2807960-kernel-boot-protection.html?raw";
import loginRedirect from "../fixtures/app-page/339800-login-redirect.html?raw";
import drmAccountEula from "../fixtures/app-page/3751950-drm-account-eula.html?raw";
import noBlock from "../fixtures/app-page/413150-no-block.html?raw";
import lineBreaks from "../fixtures/app-page/4618750-ai-line-breaks.html?raw";
import aiFirst from "../fixtures/app-page/5072580-ai-first.html?raw";
import nonKernelAntiCheat from "../fixtures/app-page/730-anticheat-nonkernel.html?raw";
import homeRedirect from "../fixtures/app-page/99999999-home-redirect.html?raw";
import agecheck from "../fixtures/app-page/synthetic-agecheck.html?raw";
import headingInDescription from "../fixtures/app-page/synthetic-heading-in-description.html?raw";
import matureFirst from "../fixtures/app-page/synthetic-mature-first.html?raw";

/** The captured and synthetic app pages, by file name (tests/fixtures/README.md). */
export const APP_PAGES = {
  "5072580-ai-first.html": aiFirst,
  "1808500-ai-only.html": aiOnly,
  "413150-no-block.html": noBlock,
  "4618750-ai-line-breaks.html": lineBreaks,
  "1808500-live-dom.html": liveDom,
  "339800-login-redirect.html": loginRedirect,
  "99999999-home-redirect.html": homeRedirect,
  "3751950-drm-account-eula.html": drmAccountEula,
  "2807960-kernel-boot-protection.html": kernelBootProtection,
  "730-anticheat-nonkernel.html": nonKernelAntiCheat,
  "1172470-kernel-easyac.html": easyAntiCheat,
  "synthetic-mature-first.html": matureFirst,
  "synthetic-heading-in-description.html": headingInDescription,
  "synthetic-agecheck.html": agecheck,
} as const;

export type AppPageName = keyof typeof APP_PAGES;

const DESCRIPTION_COLUMN =
  '<div class="game_description_column"><div id="game_area_purchase"></div></div>';

/**
 * The page with the store's description column added, where the banner goes. The pages of the tag
 * kinds hold only the title, the app name and the features list.
 */
export function withDescriptionColumn(html: string): string {
  return html.replace("</body>", `${DESCRIPTION_COLUMN}</body>`);
}
