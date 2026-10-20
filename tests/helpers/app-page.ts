import aiOnly from "../fixtures/app-page/1808500-ai-only.html?raw";
import liveDom from "../fixtures/app-page/1808500-live-dom.html?raw";
import loginRedirect from "../fixtures/app-page/339800-login-redirect.html?raw";
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
  "synthetic-mature-first.html": matureFirst,
  "synthetic-heading-in-description.html": headingInDescription,
  "synthetic-agecheck.html": agecheck,
} as const;

export type AppPageName = keyof typeof APP_PAGES;
