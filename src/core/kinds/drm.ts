import * as v from "valibot";
import { MALFORMED } from "../detect/getitems.schema";
import { hasText, optionalText } from "../detect/notes";
import { NOT_DISCLOSED, UNKNOWN } from "../types";
import type { KindDefinition } from "./kind";
import { DEFAULT_KIND_SETTINGS } from "./kind-settings";
import { WEEK_TTL } from "./kind-ttl";
import { storedDisclosed } from "./stored-disclosed";

const STORED = storedDisclosed("drm", {
  /** What the developer typed in `drm_third_party_type`. */
  text: v.pipe(v.string(), v.minLength(1)),
  /** `drm_activation_limit`, when Steam sends it. */
  activationLimit: v.exactOptional(v.string()),
});

/** The disclosed verdict of the third-party DRM kind. */
export type DrmDisclosed = v.InferOutput<typeof STORED>;

/** Third-party DRM that the developer declared. Free text: "Denuvo" has several spellings. */
export const DRM_KIND: KindDefinition<DrmDisclosed> = {
  id: "drm",

  fromGetItems(_item, details) {
    const { drm_third_party_type: text, drm_activation_limit: limit } = details;
    if (text === MALFORMED) {
      return UNKNOWN.malformed;
    }
    if (text === undefined || !hasText(text)) {
      return NOT_DISCLOSED.api;
    }
    return {
      state: "disclosed",
      kind: "drm",
      source: "api",
      text,
      ...optionalText("activationLimit", limit),
    };
  },

  stored: STORED,

  messages: { heading: "kind_drm_heading", chip: "kind_drm_chip" },
  defaults: DEFAULT_KIND_SETTINGS,
  ttl: WEEK_TTL,
};
