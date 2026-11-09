# RQ1: What image rules do the Chrome Web Store and addons.mozilla.org set for screenshots?

Research date: 2026-11-09. Pages were read through a summarising fetch tool on that date; re-fetch before quoting verbatim. Sources are Google and Mozilla primary docs plus the mozilla/addons-server source on GitHub (master branch).

## Answer in short

- Chrome Web Store (CWS): 1 to 5 screenshots, 1280x800 (preferred) or 640x400, square corners, full bleed, no padding. All screenshots are downscaled to 640x400 for display. Screenshots can be localized per locale; promo tiles cannot. Small promo tile 440x280 and marquee 1400x560 are optional. Google's current docs state no screenshot file format, alpha rule or byte limit.
- addons.mozilla.org (AMO): no practical count limit, PNG or JPG (PNG recommended), not animated, under 4 MiB each. One set of screenshots for all locales; the caption is translatable, 280 characters max. Extension Workshop recommends 1280x800 (1.6:1), while the Developer Hub form says 2400x1800 is the maximum and recommended size. A 4:3 ratio and a 1000x750 minimum are enforced only when the `content-optimization` waffle switch is on; its production state is not public.
- One 1280x800 PNG set works on both stores under the rules that are documented and always active. It would fail AMO's upload check if the `content-optimization` switch is on in production. Keep each file under 4 MiB and without alpha to stay safe on both.

## Chrome Web Store

### Screenshot size, count and shape

- At least 1 screenshot is required, up to 5, and 5 is preferred (source: https://developer.chrome.com/docs/webstore/images).
- Size is 1280x800 or 640x400 pixels. 1280x800 is preferred, and all screenshots are currently downscaled to 640x400 (source: https://developer.chrome.com/docs/webstore/images).
- 640x400 is the suggested choice when screenshots do not downscale well, for example text-heavy ones (source: https://developer.chrome.com/docs/webstore/images).
- Shape: "Square corners, no padding (full bleed)" (source: https://developer.chrome.com/docs/webstore/images).
- The dashboard listing page names only the store icon and at least one screenshot as required; video, small promo tile and marquee are optional (source: https://developer.chrome.com/docs/webstore/cws-dashboard-listing).
- Its asset table lists screenshots at 1280x800, at least 1 and up to 5, with no format stated (source: https://developer.chrome.com/docs/webstore/cws-dashboard-listing).

### Format, alpha and file size

- The current Supplying Images page and the dashboard listing page state no screenshot file format, no alpha rule and no byte limit (source: https://developer.chrome.com/docs/webstore/images, https://developer.chrome.com/docs/webstore/cws-dashboard-listing).
- The only alpha rule in those docs is for the store icon: an icon without alpha is placed in a frame with 12 px rounded corners (source: https://developer.chrome.com/docs/webstore/images).
- Promo tiles accept PNG or JPEG (source: https://developer.chrome.com/docs/webstore/cws-dashboard-listing).
- A "JPEG or 24-bit PNG (no alpha)" rule for screenshots appears only in secondhand quotes of the dashboard upload hint, such as a 2022 chromium-extensions group thread (source: https://groups.google.com/a/chromium.org/g/chromium-extensions/c/obZ9t7b8hPk). Not confirmed in a Google doc. Treat it as likely and export without alpha.

### Localization

- Screenshots, the detailed description and the promo video can be localized per locale; each locale maps to a `_locales/LOCALE_CODE` directory in the package (source: https://developer.chrome.com/docs/webstore/cws-dashboard-listing).
- Localized screenshots go in a "Localized screenshots" section per locale, chosen from the language pull-down (source: https://developer.chrome.com/docs/webstore/cws-dashboard-listing).
- Display order: localized video, localized screenshots, global video, global screenshots (source: https://developer.chrome.com/docs/webstore/cws-dashboard-listing).
- The small and marquee promo tiles cannot be localized (source: https://developer.chrome.com/docs/webstore/cws-dashboard-listing). Supplying Images says promo images are "not currently locale-specific" and suggests avoiding text in them or targeting the largest locale (source: https://developer.chrome.com/docs/webstore/images).

### Promo tiles

- Small promo tile 440x280 and marquee 1400x560 are both optional (source: https://developer.chrome.com/docs/webstore/images).
- Without a marquee image the item cannot be featured in the marquee; items without a small promo tile are shown after those that have one (source: https://developer.chrome.com/docs/webstore/images).
- The small tile appears on the homepage, category pages and search results; the marquee is used in the homepage carousel (source: https://developer.chrome.com/docs/webstore/best-listing).
- Image review takes up to one week, and rejection reasons show on the Edit page (source: https://developer.chrome.com/docs/webstore/images).

## addons.mozilla.org

### Size and ratio

- Extension Workshop: "We recommended that you capture images that are 1280x800px (the maximum image display size)", and 1.6:1 for other sizes (source: https://extensionworkshop.com/documentation/develop/create-an-appealing-listing/).
- Developer Hub form text, always shown: "PNG and JPG supported, PNG recommended. The maximum and recommended size for screenshots is 2400x1800 pixels." (source: https://github.com/mozilla/addons-server/blob/master/src/olympia/devhub/templates/devhub/addons/forms_shared/media.html).
- Same template, shown only when the `content-optimization` waffle switch is on: "Minimum size is 1000x750, and a ratio of 4:3 is required." (source: https://github.com/mozilla/addons-server/blob/master/src/olympia/devhub/templates/devhub/addons/forms_shared/media.html).
- The upload view enforces that rule under the same switch: width and height at least `ADDON_PREVIEW_SIZES['min']` and an integer ratio check that rejects anything but 4:3 (source: https://github.com/mozilla/addons-server/blob/master/src/olympia/devhub/views.py).
- `ADDON_PREVIEW_SIZES` is thumbnail 533x400 (JPG), min 1000x750, full 2400x1800 (PNG) (source: https://github.com/mozilla/addons-server/blob/master/src/olympia/constants/base.py).
- Whether `content-optimization` is active on production AMO is not visible from public sources. Waffle switches are created by migrations and toggled by a management command (source: https://mozilla.github.io/addons-server/topics/development/waffle.html). Open question: a test upload of one 1280x800 file to the AMO listing answers it.

### Resizing and thumbnails

- On upload a task writes a thumbnail fitted into 533x400 as JPG and a full image fitted into 2400x1800 (source: https://github.com/mozilla/addons-server/blob/master/src/olympia/addons/tasks.py, https://github.com/mozilla/addons-server/blob/master/src/olympia/constants/base.py).
- `resize_image` keeps the aspect ratio with one scale factor, `min(target_w / src_w, target_h / src_h)`, never crops and never upscales (it only resizes when the scale is at most 1) (source: https://github.com/mozilla/addons-server/blob/master/src/olympia/amo/utils.py).
- Derived: a 1280x800 upload gives a 533x333 thumbnail and a 1280x800 full image, uncropped. A 4:3 upload fills the 533x400 thumbnail box.
- The original upload is kept as well (source: https://github.com/mozilla/addons-server/blob/master/src/olympia/addons/tasks.py).

### Format, count and file size

- Accepted types are `image/png` and `image/jpeg` (source: https://github.com/mozilla/addons-server/blob/master/src/olympia/constants/base.py).
- Upload errors: "Images must be either PNG or JPG." and "Images cannot be animated." (source: https://github.com/mozilla/addons-server/blob/master/src/olympia/devhub/views.py).
- Byte limit: `MAX_IMAGE_UPLOAD_SIZE = 4 * 1024 * 1024`, 4 MiB, applied to preview uploads (source: https://github.com/mozilla/addons-server/blob/master/src/olympia/lib/settings_base.py, https://github.com/mozilla/addons-server/blob/master/src/olympia/devhub/views.py).
- No alpha rule was found in the upload checks (source: https://github.com/mozilla/addons-server/blob/master/src/olympia/devhub/views.py, https://github.com/mozilla/addons-server/blob/master/src/olympia/addons/fields.py).
- Count: "There isn't a practical limit to the number of screenshots", with advice to add only screenshots that show a key feature (source: https://extensionworkshop.com/documentation/develop/create-an-appealing-listing/).
- Order is set by an integer `position`, ascending (source: https://mozilla.github.io/addons-server/topics/api/addons.html).

### Captions and localization

- `caption = TranslatedField(max_length=280)` on the `Preview` model: optional, translatable, 280 characters per locale (source: https://github.com/mozilla/addons-server/blob/master/src/olympia/addons/models.py, https://github.com/mozilla/addons-server/blob/master/src/olympia/addons/serializers.py).
- Through the API, the caption cannot be sent in the same request as the image; it needs a PATCH after the upload (source: https://mozilla.github.io/addons-server/topics/api/addons.html).
- "You can only load one set of screenshots, although you can localize their descriptions" (source: https://extensionworkshop.com/documentation/develop/create-an-appealing-listing/).

## One set for both stores

- CWS: 1280x800 is the preferred size and gets downscaled to 640x400 (source: https://developer.chrome.com/docs/webstore/images).
- AMO: 1280x800 matches Extension Workshop's recommendation and passes the always-on checks: PNG or JPG, not animated, under 4 MiB (source: https://extensionworkshop.com/documentation/develop/create-an-appealing-listing/, https://github.com/mozilla/addons-server/blob/master/src/olympia/devhub/views.py).
- Risk: if `content-optimization` is on in production, AMO rejects 1280x800 (16:10) and needs 4:3 at 1000x750 or larger (source: https://github.com/mozilla/addons-server/blob/master/src/olympia/devhub/views.py).
- CWS caps the set at 5; AMO has no cap, so 5 shared screenshots fit both (source: https://developer.chrome.com/docs/webstore/images, https://extensionworkshop.com/documentation/develop/create-an-appealing-listing/).
- CWS can take per-locale sets (English and Spanish, for example); AMO takes one set and translates captions only. An English-only image set with localized AMO captions fits both (source: https://developer.chrome.com/docs/webstore/cws-dashboard-listing, https://extensionworkshop.com/documentation/develop/create-an-appealing-listing/).
- Byte limits: AMO 4 MiB per image; CWS documents none (source: https://github.com/mozilla/addons-server/blob/master/src/olympia/lib/settings_base.py, https://developer.chrome.com/docs/webstore/images).
- Safe export: 1280x800, PNG without alpha (24-bit), under 4 MiB, square corners, full bleed.

## Content guidance

### Chrome Web Store

- "Screenshots should demonstrate the actual user experience", focused on core features and content (source: https://developer.chrome.com/docs/webstore/images).
- Screenshots should reflect the latest version's functionality (source: https://developer.chrome.com/docs/webstore/best-listing).
- No blurry, distorted or pixelated images unless the effect is part of the brand or experience; nothing upside down, sideways or skewed (source: https://developer.chrome.com/docs/webstore/best-listing).
- Images should not carry so much text that it overwhelms the reader (source: https://developer.chrome.com/docs/webstore/best-listing).
- Infographics, images or video may explain onboarding, the experience and main features; keep branding consistent with the icon and promo images (source: https://developer.chrome.com/docs/webstore/best-listing).
- Promo tiles: do not reuse a screenshot, avoid text and busy images, make sure they work at half size, use saturated colors, avoid large white or light gray areas, fill the whole region, keep edges well defined (source: https://developer.chrome.com/docs/webstore/images, https://developer.chrome.com/docs/webstore/best-listing).
- No misleading status claims such as "Editor's Choice" or "Number One" (source: https://developer.chrome.com/docs/webstore/best-listing).
- Google brand references follow Google's branding guidelines (source: https://developer.chrome.com/docs/webstore/images).

### addons.mozilla.org

- Each screenshot should show a key feature; screenshots can be reordered, so order them as a sequence that shows how the add-on works (source: https://extensionworkshop.com/documentation/develop/create-an-appealing-listing/).
- Annotations are fine, but explain them in text rather than on the screenshot, and avoid adding text to the images (source: https://extensionworkshop.com/documentation/develop/create-an-appealing-listing/).
- The Developer Hub notes that screenshots raise the chance of installs (source: https://github.com/mozilla/addons-server/blob/master/src/olympia/devhub/templates/devhub/addons/forms_shared/media.html).

## Open questions

- CWS screenshot format and alpha rule: confirm from the upload hint in the CWS dashboard.
- AMO `content-optimization` switch on production: confirm with one test upload of a 1280x800 PNG in the Developer Hub.
