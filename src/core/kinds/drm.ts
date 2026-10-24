import * as v from "valibot";
import { MALFORMED } from "../detect/getitems.schema";
import { hasText } from "../detect/notes";
import { type DisclosedBase, NOT_DISCLOSED, UNKNOWN } from "../types";
import { BORROWED_MESSAGES } from "./borrowed-messages";
import type { KindDefinition } from "./kind";
import { DEFAULT_KIND_SETTINGS } from "./kind-settings";
import { storedDisclosed } from "./stored-disclosed";

/**
 * The disclosed verdict of the third-party DRM kind. The text is what the developer typed in
 * `drm_third_party_type`, and the activation limit is `drm_activation_limit` when Steam sends it.
 */
export interface DrmDisclosed extends DisclosedBase<"drm"> {
  readonly text: string;
  readonly activationLimit?: string;
}

/** Third-party DRM that the developer declared. Free text: "Denuvo" has several spellings. */
export const DRM_KIND: KindDefinition<DrmDisclosed> = {
  id: "drm",

  fromGetItems(_item, details) {
    const { drm_third_party_type: text, drm_activation_limit: limit } = details;
    if (text === MALFORMED || limit === MALFORMED) {
      return UNKNOWN.error;
    }
    if (text === undefined || !hasText(text)) {
      return NOT_DISCLOSED.api;
    }
    return {
      state: "disclosed",
      kind: "drm",
      source: "api",
      text,
      ...(limit !== undefined && hasText(limit) ? { activationLimit: limit } : {}),
    };
  },

  stored: storedDisclosed("drm", {
    text: v.pipe(v.string(), v.minLength(1)),
    activationLimit: v.exactOptional(v.string()),
  }),

  messages: BORROWED_MESSAGES,
  defaults: DEFAULT_KIND_SETTINGS,
};
