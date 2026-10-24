import * as v from "valibot";
import { MALFORMED } from "../detect/getitems.schema";
import { type DisclosedBase, NOT_DISCLOSED, UNKNOWN } from "../types";
import { BORROWED_MESSAGES } from "./borrowed-messages";
import type { KindDefinition } from "./kind";
import { DEFAULT_KIND_SETTINGS } from "./kind-settings";
import { storedDisclosed } from "./stored-disclosed";

/** One third-party agreement: its name as typed, and a link when it is safe to show. */
export interface EulaItem {
  readonly name: string;
  readonly url?: string;
}

/** The disclosed verdict of the third-party EULA kind: every agreement the developer lists. */
export interface EulaDisclosed extends DisclosedBase<"eula"> {
  readonly items: readonly EulaItem[];
}

const EULA_HOST = "store.steampowered.com";
const EULA_PATH = "/eula/";
/** Steam serves its EULA links with a doubled slash after the host. */
const LEADING_SLASHES = /^\/{2,}/;

function parseUrl(raw: string): URL | undefined {
  try {
    return new URL(raw);
  } catch {
    // Not an absolute URL, so there is no link to keep.
    return undefined;
  }
}

/**
 * The link as `https://store.steampowered.com/eula/...`, or undefined when it is anything else:
 * another host, another scheme, credentials, a port, a path outside `/eula/`, or no absolute URL
 * at all. Steam's doubled leading slash collapses to one.
 */
export function eulaLink(raw: string): string | undefined {
  const url = parseUrl(raw);
  if (
    url?.protocol !== "https:" || url.host !== EULA_HOST || url.username !== ""
    || url.password !== ""
  ) {
    return undefined;
  }
  const path = url.pathname.replace(LEADING_SLASHES, "/");
  return path.startsWith(EULA_PATH)
    ? `https://${EULA_HOST}${path}${url.search}${url.hash}`
    : undefined;
}

/** The third-party agreements a player must accept: the names the developer typed, and links. */
export const EULA_KIND: KindDefinition<EulaDisclosed> = {
  id: "eula",

  fromGetItems(_item, details) {
    const eula = details.eula;
    if (eula === MALFORMED) {
      return UNKNOWN.error;
    }
    if (eula === undefined || eula.length === 0) {
      return NOT_DISCLOSED.api;
    }
    const items: EulaItem[] = [];
    for (const entry of eula) {
      const url = eulaLink(entry.url);
      items.push(url === undefined ? { name: entry.name } : { name: entry.name, url });
    }
    return { state: "disclosed", kind: "eula", source: "api", items };
  },

  stored: storedDisclosed("eula", {
    items: v.pipe(
      v.array(v.object({ name: v.string(), url: v.exactOptional(v.string()) })),
      v.minLength(1),
    ),
  }),

  messages: BORROWED_MESSAGES,
  defaults: DEFAULT_KIND_SETTINGS,
};
