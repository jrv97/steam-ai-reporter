import { AI_KIND } from "./ai";
import type { KindMessages } from "./kind";

/**
 * The copy keys of kinds that have no catalog text of their own. No screen draws those kinds;
 * giving a kind its own keys replaces this.
 */
export const BORROWED_MESSAGES: KindMessages = AI_KIND.messages;
