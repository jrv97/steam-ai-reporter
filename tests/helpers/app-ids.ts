import * as v from "valibot";
import { type AppId, AppIdSchema } from "../../src/core/types";

/** The values as app IDs. Throws on a value that is not one, so a typo fails the test. */
export function appIds(...values: readonly number[]): readonly AppId[] {
  return values.map((value) => v.parse(AppIdSchema, value));
}

/** The value as an app ID; throws when it is not one. */
export function appId(value: number): AppId {
  return v.parse(AppIdSchema, value);
}
