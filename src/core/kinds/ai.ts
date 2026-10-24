import { trimNotes } from "../detect/notes";
import type { NotDisclosedVerdict } from "../types";
import type { TagKind } from "./kind";

const NOT_DISCLOSED: NotDisclosedVerdict = { state: "not-disclosed", source: "api" };

/** Generative AI use that the developer reported on Steam's content survey. */
export const AI_KIND: TagKind = {
  id: "ai",

  fromGetItems({ details, name, language }) {
    const notes = trimNotes(details.content_survey_ai_notes ?? "");
    if (notes === "") {
      return NOT_DISCLOSED;
    }
    const service = trimNotes(details.ai_generation_service?.name ?? "");
    const storeName = trimNotes(name ?? "");
    return {
      state: "disclosed",
      notes,
      language,
      source: "api",
      ...(service === "" ? {} : { service }),
      ...(storeName === "" ? {} : { name: storeName }),
    };
  },

  messages: {
    label: "badge_label",
    cardService: "badge_card_service_label",
    bannerService: "banner_service_label",
    bannerRegion: "banner_region_label",
    badgesSwitch: "options_badges",
    badgesSwitchShort: "options_badges_short",
    filterLabel: "options_filter_label",
  },

  defaults: { enabled: true, badge: true, banner: true, filter: "off" },
};
