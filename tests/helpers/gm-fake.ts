import { type JsonValue, parseJson } from "../../src/core/json";
import type { GmStorage } from "../../src/platform/userscript/gm-storage";

export interface FakeGm extends GmStorage {
  /** The `GM.setValue` calls, in order. */
  readonly writes: readonly string[];
}

/**
 * A typed fake of the `GM` storage calls. Like the managers, it stores serialized values: what
 * goes in and out is a copy, and a name with no value reads as `undefined`.
 */
export function fakeGm(): FakeGm {
  const values = new Map<string, string>();
  const writes: string[] = [];
  return {
    writes,
    getValue(name) {
      const text = values.get(name);
      // The managers serialize values as JSON, so reading one back is a parse
      return Promise.resolve(text === undefined ? undefined : parseJson(text));
    },
    setValue(name: string, value: JsonValue) {
      writes.push(name);
      values.set(name, JSON.stringify(value));
      return Promise.resolve();
    },
    deleteValue(name) {
      values.delete(name);
      return Promise.resolve();
    },
    listValues() {
      return Promise.resolve([...values.keys()]);
    },
  };
}
