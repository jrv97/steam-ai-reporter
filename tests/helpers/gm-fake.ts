import { type JsonValue, parseJson } from "../../src/core/json";
import type { GmStorage, WatchValue } from "../../src/platform/userscript/gm-storage";
import { failsWrite, type StorageFaults, storedValue } from "./storage-faults";

export interface FakeGm extends GmStorage {
  /** The names `GM.getValue` was asked for, in order. */
  readonly reads: readonly string[];
  /** The `GM.setValue` calls, in order. */
  readonly writes: readonly string[];
}

/**
 * A typed fake of the `GM` storage calls. Like the managers, it stores serialized values: what
 * goes in and out is a copy, and a name with no value reads as `undefined`.
 */
export function fakeGm(): FakeGm {
  const values = new Map<string, string>();
  const reads: string[] = [];
  const writes: string[] = [];
  return {
    reads,
    writes,
    getValue(name) {
      reads.push(name);
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

/** A GM fake that injects the given faults. Each `setValue` is one write, as in the managers. */
export function faultyGm(faults: StorageFaults): GmStorage {
  const inner = fakeGm();
  return {
    getValue: (name) => inner.getValue(name),
    setValue(name, value) {
      if (failsWrite(faults)) {
        return Promise.reject(new Error());
      }
      const stored = storedValue(faults, name, value);
      return stored === undefined ? Promise.resolve() : inner.setValue(name, stored);
    },
    deleteValue: (name) =>
      faults.rejectRemove ? Promise.reject(new Error()) : inner.deleteValue(name),
    listValues: () => inner.listValues(),
  };
}

/** A fake `GM_addValueChangeListener`, which a test triggers by hand. */
export interface FakeWatch {
  readonly watch: WatchValue;
  /** Reports a new `value` of `key` to the callbacks that watch that key, as the manager does. */
  readonly notify: (key: string, value: unknown) => void;
}

export function fakeWatch(): FakeWatch {
  const watchers: (readonly [string, (value: unknown) => void])[] = [];
  return {
    watch(key, onChange) {
      watchers.push([key, onChange]);
    },
    notify(key, value) {
      for (const [watched, onChange] of watchers) {
        if (watched === key) {
          onChange(value);
        }
      }
    },
  };
}
