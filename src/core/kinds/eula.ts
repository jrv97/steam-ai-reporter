import * as v from "valibot";
import { MALFORMED } from "../detect/getitems.schema";
import { hasText } from "../detect/notes";
import { NOT_DISCLOSED, UNKNOWN } from "../types";
import type { KindDefinition } from "./kind";
import { DEFAULT_KIND_SETTINGS } from "./kind-settings";
import { WEEK_TTL } from "./kind-ttl";
import { storedDisclosed } from "./stored-disclosed";

/** One third-party agreement: its name as typed, and a link when it is safe to show. */
const ITEM = v.pipe(
  v.object({ name: v.string(), url: v.exactOptional(v.string()) }),
  v.readonly(),
);

export type EulaItem = v.InferOutput<typeof ITEM>;

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

/** The entries as stored, with a link that is not an EULA link dropped and the name kept. */
function keepSafeLinks(stored: EulaItem[]): EulaItem[] {
  return stored.map(({ name, url }) => {
    const link = url === undefined ? undefined : eulaLink(url);
    return link === undefined ? { name } : { name, url: link };
  });
}

const STORED = storedDisclosed("eula", {
  /** Every agreement the developer lists. */
  items: v.pipe(v.array(ITEM), v.minLength(1), v.transform(keepSafeLinks), v.readonly()),
});

/** The disclosed verdict of the third-party EULA kind. */
export type EulaDisclosed = v.InferOutput<typeof STORED>;

/** The third-party agreements a player must accept: the names the developer typed, and links. */
export const EULA_KIND: KindDefinition<EulaDisclosed> = {
  id: "eula",

  fromGetItems(_item, details) {
    const eula = details.eula;
    if (eula === MALFORMED) {
      return UNKNOWN.malformed;
    }
    const items: EulaItem[] = [];
    for (const entry of eula ?? []) {
      if (hasText(entry.name)) {
        const url = entry.url === undefined ? undefined : eulaLink(entry.url);
        items.push(url === undefined ? { name: entry.name } : { name: entry.name, url });
      }
    }
    return items.length === 0
      ? NOT_DISCLOSED.api
      : { state: "disclosed", kind: "eula", source: "api", items };
  },

  stored: STORED,

  messages: { heading: "kind_eula_heading", chip: "kind_eula_chip" },
  defaults: DEFAULT_KIND_SETTINGS,
  ttl: WEEK_TTL,
};
