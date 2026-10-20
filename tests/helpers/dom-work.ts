import { vi } from "vitest";

/** DOM calls made while counting: a deterministic measure of scan cost, unlike wall-clock time. */
export interface DomWork {
  readonly querySelectorAll: number;
  /** Elements the `querySelectorAll` calls returned, summed. */
  readonly queried: number;
  readonly querySelector: number;
  readonly closest: number;
  readonly matches: number;
  /** `parentElement` reads: ancestor steps. */
  readonly parentSteps: number;
  readonly setAttribute: number;
  readonly removeAttribute: number;
}

/**
 * Starts counting DOM calls on every element (the spies call through). The returned function
 * reads the counts so far; vitest restores the spies after the test.
 */
export function countDomWork(): () => DomWork {
  const element = Element.prototype;
  const querySelectorAll = vi.spyOn(element, "querySelectorAll");
  const querySelector = vi.spyOn(element, "querySelector");
  const closest = vi.spyOn(element, "closest");
  const matches = vi.spyOn(element, "matches");
  const setAttribute = vi.spyOn(element, "setAttribute");
  const removeAttribute = vi.spyOn(element, "removeAttribute");
  const parentElement = vi.spyOn(Node.prototype, "parentElement", "get");
  return () => ({
    querySelectorAll: querySelectorAll.mock.calls.length,
    queried: querySelectorAll.mock.results.reduce(
      (sum, result) => sum + (result.type === "return" ? result.value.length : 0),
      0,
    ),
    querySelector: querySelector.mock.calls.length,
    closest: closest.mock.calls.length,
    matches: matches.mock.calls.length,
    parentSteps: parentElement.mock.calls.length,
    setAttribute: setAttribute.mock.calls.length,
    removeAttribute: removeAttribute.mock.calls.length,
  });
}
