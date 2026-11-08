import type { KeyValueStore } from "../../src/core/ports";

/** The value `store` holds under `key`, or undefined when it holds none. */
export async function readKey(store: KeyValueStore, key: string): Promise<unknown> {
  return (await store.get([key])).get(key);
}
