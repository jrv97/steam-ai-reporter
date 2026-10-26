# DLC page 5201760 (ARC Raiders - Frozen Trail Collector Set), captured twice by the maintainer on a local build of main

Filters: ai=dim, every other kind off. ARC Raiders was NOT ignored (the maintainer set the filter to Dim to see the effect).
The capture is independent of the ignore state: it shows how hosts are found.

## Hosts Tag Kit marked (all with data-sar-appid=1808500, the BASE game, never 5201760)
- div.rightcol [375x550]  data-sar-kinds=ai kernel eula pvp   (adopted through the glance box)
- div.page_content.middle_page [1200x2187..2195]  same kinds   (adopted through the DLC bubble link; the whole content area, 15 imgs)
- #gameHeaderImageCtn [375x178] got data-sar-anchor and the chips (first image of the rightcol host)
- 5 carousel capsules (282x170, own appids 4210150, 4424920, 4920260, 3948510, 4741040): correct hosts.

## Ancestor chains of links to the base game (tag [WxH] imgs=N), innermost first
1. glance box text link (inside "This content requires the base game"):
   a [70x14] < p [375x40] < div.glance_details [375x114] imgs=1 < div#gameHeaderCtn [375x304] imgs=2 < div.glance_ctn [375x550] imgs=2 < div.rightcol [375x550] imgs=2 < div#game_highlights.block_content.page_content [1200x562] imgs=16 < div.game_background_glow ...
2. glance box logo image link: a [186x14] imgs=1 < div.glance_details [375x114] imgs=1 < ... (the base game's own logo image sits here: a legitimate capsule of the base game)
3. DLC bubble link:
   a [74x16] < p [748x19] < div.content [780x74] < div.game_area_bubble.game_area_dlc_bubble [780x74] imgs=0 < div#game_area_purchase [780x192] imgs=0 < div.leftcol.game_description_column [780x2171] imgs=2 < div.page_content.middle_page [1200x2187] imgs=15 < div.page_content_ctn ...
4. breadcrumb link (already skipped): div.breadcrumbs.
5. Community Hub link a.btnv6_blue_hoverfade inside div.apphub_OtherSiteInfo (links to steamcommunity.com, not a candidate).
- gameHeaderImageCtn contains: img.game_header_image_full, a hidden #appHubAppName_responsive and #appHeaderGridContainer (display:none) with Developer/Publisher search links (links to /search/?developer=...), and our chips.
- The page's own app id never appears as an app link inside any of these chains.

## DLC bubble HTML
<div class="game_area_bubble game_area_dlc_bubble "><div class="content"><h1>Downloadable Content</h1><p>This content requires the base game <a href="https://store.steampowered.com/app/1808500/">ARC Raiders</a> on Steam in order to play.</p></div></div>
