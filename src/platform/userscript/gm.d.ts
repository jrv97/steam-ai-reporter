// The userscript manager APIs the build grants (`@grant` in the header, scripts/build.py) and
// nothing else. Signatures follow the Tampermonkey and Violentmonkey documentation. Storage reads
// are `unknown` until a schema validates them. A name the manager does not provide is `undefined`
// at run time, so the optional ones are declared that way and checked with `typeof`.
import type { JsonValue } from "../../core/json";

declare global {
  const GM: {
    getValue(name: string): Promise<unknown>;
    setValue(name: string, value: JsonValue): Promise<void>;
    deleteValue(name: string): Promise<void>;
    listValues(): Promise<readonly string[]>;
    registerMenuCommand?(caption: string, onClick: () => void): Promise<unknown>;
  };

  const GM_addStyle: ((css: string) => HTMLStyleElement) | undefined;

  const GM_addValueChangeListener:
    | ((
      name: string,
      listener: (name: string, oldValue: unknown, newValue: unknown, remote: boolean) => void,
    ) => number)
    | undefined;
}
