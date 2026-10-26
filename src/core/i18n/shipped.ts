// Every catalog under src/locales/, reduced to the messages by scripts/gen_catalogs.py. Tests and
// the dev bundle use it; each shipped bundle carries its own subset, the messages its code reads,
// from the `<entry>.catalogs.gen.ts` next to its entry.
export { SHIPPED_CATALOGS } from "./shipped.gen";
