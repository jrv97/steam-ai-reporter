import type { CreatorRole } from "../creator";
import type { BareMessageKey } from "../i18n/t";

/** The label of each role, as a row in the banner and in parentheses after a name. */
export const ROLE_LABELS: Readonly<Record<CreatorRole, BareMessageKey>> = {
  developer: "banner_role_developer",
  publisher: "banner_role_publisher",
};
