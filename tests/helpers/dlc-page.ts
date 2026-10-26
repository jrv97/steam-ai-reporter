/** The DLC whose page `dlcPage` stands for. */
export const DLC_PATH = "/app/5201760/ARC_Raiders__Frozen_Trail_Collector_Set/";
/** The base game the DLC page links to. */
export const BASE_ID = 1808500;

/** Where `dlcPage` puts a text link to the base game. */
export type DlcLink = "glance" | "bubble" | "description";

const STORE = "https://store.steampowered.com";
const BASE_LINK = `${STORE}/app/${String(BASE_ID)}/ARC_Raiders/`;
const TEXT_LINK =
  `<p>This content requires the base game <a href="${BASE_LINK}">ARC Raiders</a>.</p>`;
/** The glance box's text link and the base game's logo image link below it. */
const GLANCE_LINKS = `${TEXT_LINK}<a href="${BASE_LINK}"><img src="logo.png"></a>`;
const DLC_BUBBLE = `<div class="game_area_bubble game_area_dlc_bubble">
              <div class="content">${TEXT_LINK}</div>
            </div>`;

/**
 * A stand-in for a DLC's own app page, built from a DOM capture of
 * https://store.steampowered.com/app/5201760/ (no fixture holds the page). It keeps the structure
 * that matters: the page header capsule shares the right column with the glance box, whose text
 * link and logo image link name the base game, and the DLC bubble and the description sit in the
 * description column. Nothing on the page links to the DLC itself outside the breadcrumbs.
 */
export function dlcPage(links: readonly DlcLink[]): string {
  const at = (link: DlcLink, html: string): string => (links.includes(link) ? html : "");
  return `
  <div class="game_page_background game">
    <div class="page_title_area game_title_area page_content">
      <div class="breadcrumbs"><div class="blockbg">
        <a href="${STORE}/search/?term=">All Games</a>
        <a href="${BASE_LINK}">ARC Raiders</a>
        <a href="${STORE}${DLC_PATH}"><span>Frozen Trail Collector Set</span></a>
      </div></div>
      <div id="appHubAppName" class="apphub_AppName">Frozen Trail Collector Set</div>
    </div>
    <div class="game_background_glow">
      <div id="game_highlights" class="block_content page_content">
        <div class="leftcol"><div class="highlight_strip"><img src="ss_1.jpg"><img src="ss_2.jpg">
        </div></div>
        <div class="rightcol">
          <div class="glance_ctn">
            <div id="gameHeaderCtn" class="game_header_ctn">
              <div id="gameHeaderImageCtn" class="game_header_image_ctn">
                <img class="game_header_image_full" src="header.jpg">
                <div id="appHeaderGridContainer" style="display: none">
                  <a href="${STORE}/search/?developer=Embark">Embark</a>
                  <a href="${STORE}/search/?publisher=Embark">Embark</a>
                </div>
              </div>
              <div class="glance_details">${at("glance", GLANCE_LINKS)}</div>
            </div>
          </div>
        </div>
      </div>
    </div>
    <div class="page_content_ctn">
      <div class="page_content middle_page">
        <div class="leftcol game_description_column">
          <div id="game_area_purchase" class="game_area_purchase">${at("bubble", DLC_BUBBLE)}
            <div class="game_area_purchase_game_wrapper"><div class="game_area_purchase_game">
            </div></div>
          </div>
          <div id="aboutThisGame"><div id="game_area_description" class="game_area_description">
            <img src="about_1.jpg"><img src="about_2.jpg">${at("description", TEXT_LINK)}
          </div></div>
        </div>
        <div class="rightcol game_meta_data"><img src="achievements.png"></div>
      </div>
    </div>
  </div>`;
}
