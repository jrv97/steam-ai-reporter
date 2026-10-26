import { HOST_APPID } from "../../src/core/scan/marks";
import { setBody } from "./dom";

/** The package ID of the page `packagePage` stands for. */
export const PACKAGE_PATH = "/sub/1756458/";

/** One row of "Items included in this package", as the store marks it (see `packagePage`). */
function packageRow(id: number): string {
  const key = String(id);
  return `
      <div class="tab_item tablet_list_item ds_flagged ds_wishlist" data-ds-appid="${key}"
        data-ds-itemkey="App_${key}">
        <div class="tab_item_cap"><img class="tab_item_cap_img" src="capsule_184x69.jpg"></div>
        <a class="tab_item_overlay" href="/app/${key}/Game_${key}/?snr=1_7_7_230_150_1">
          <img src="blank.gif">
        </a>
        <div class="tab_item_content"><div class="tab_item_name">Game ${key}</div></div>
      </div>`;
}

/**
 * A stand-in for a store package page (`/sub/<id>/`), built from a DOM capture of
 * https://store.steampowered.com/sub/1756458/ (no fixture holds the page). It keeps the structure
 * that matters: the title bar image and the purchase box sit in the same column as the included
 * games, and the page itself names no app, so only the `data-ds-appid` rows and their links do.
 */
export function packagePage(ids: readonly number[]): string {
  return `
  <div class="game_page_background bundle">
    <div id="tabletGrid" class="tablet_grid">
      <div class="page_content_ctn">
        <div class="page_content">
          <div class="leftcol game_description_column">
            <div id="package_header_container">
              <img class="package_header" src="package_header.jpg">
            </div>
            <div class="package_landing_page_item_list">${ids.map(packageRow).join("")}
            </div>
            <div class="game_area_purchase_game"><div class="game_purchase_action"></div></div>
          </div>
        </div>
      </div>
    </div>
  </div>`;
}

/**
 * Loads `packagePage(ids)` into the test document with each included game's row marked as the
 * scanner marks a host, and returns the rows in page order.
 */
export function markedPackagePage(ids: readonly number[]): readonly Element[] {
  setBody(packagePage(ids));
  const rows = [...document.querySelectorAll("[data-ds-appid]")];
  for (const row of rows) {
    row.setAttribute(HOST_APPID, row.getAttribute("data-ds-appid") ?? "");
  }
  return rows;
}
