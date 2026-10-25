import aiOnly from "../fixtures/app-page/1808500-ai-only.html?raw";
import liveDom from "../fixtures/app-page/1808500-live-dom.html?raw";
import loginRedirect from "../fixtures/app-page/339800-login-redirect.html?raw";
import drmAccountEula from "../fixtures/app-page/3751950-drm-account-eula.html?raw";
import noBlock from "../fixtures/app-page/413150-no-block.html?raw";
import lineBreaks from "../fixtures/app-page/4618750-ai-line-breaks.html?raw";
import aiFirst from "../fixtures/app-page/5072580-ai-first.html?raw";
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

/** The summary box rows under which the tag section falls back to when the page has no tags. */
export const DEV_ROWS = `
    <div class="dev_row" id="developer"><div class="subtitle">Developer:</div></div>
    <div class="dev_row" id="publisher"><div class="subtitle">Publisher:</div></div>`;

/** Steam's block of popular user-defined tags, which the tag section follows. */
export const USER_TAGS = `
    <div class="glance_tags_ctn popular_tags_ctn" id="tags">
      <div class="glance_tags_label"></div>
      <div class="glance_tags popular_tags"></div>
    </div>`;

/**
 * The summary box of a store page as the code expects it (no capture holds it): the Developer and
 * Publisher rows, then the popular tags block.
 */
export const SUMMARY_BOX = `
  <div class="glance_ctn_responsive_left">${DEV_ROWS}${USER_TAGS}
  </div>`;

/** The page with the summary box added, where the tag section goes. */
export function withSummaryBox(html: string): string {
  return html.replace("</body>", `${SUMMARY_BOX}</body>`);
}
