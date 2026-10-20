import { describe, expect, it } from "vitest";
import { Lru, MEMORY_CAPACITY } from "./lru";

describe("Lru", () => {
  it("is capped at 2,000 entries by default", () => {
    expect(MEMORY_CAPACITY).toBe(2000);
    const lru = new Lru<number, number>(MEMORY_CAPACITY);
    for (let n = 0; n < MEMORY_CAPACITY + 500; n++) {
      lru.set(n, n);
    }
    expect(lru.size).toBe(MEMORY_CAPACITY);
    expect(lru.get(0)).toBeUndefined();
    expect(lru.get(499)).toBeUndefined();
    expect(lru.get(500)).toBe(500);
    expect(lru.get(MEMORY_CAPACITY + 499)).toBe(MEMORY_CAPACITY + 499);
  });

  it("evicts the least recently used entry", () => {
    const lru = new Lru<string, number>(3);
    lru.set("a", 1);
    lru.set("b", 2);
    lru.set("c", 3);
    expect(lru.get("a")).toBe(1);
    lru.set("d", 4);
    expect(lru.get("b")).toBeUndefined();
    expect([lru.get("a"), lru.get("c"), lru.get("d")]).toStrictEqual([1, 3, 4]);
  });

  it("counts a write to an existing key as a use, without growing", () => {
    const lru = new Lru<string, number>(2);
    lru.set("a", 1);
    lru.set("b", 2);
    lru.set("a", 10);
    lru.set("c", 3);
    expect(lru.size).toBe(2);
    expect(lru.get("a")).toBe(10);
    expect(lru.get("b")).toBeUndefined();
  });

  it("deletes entries", () => {
    const lru = new Lru<string, number>(2);
    lru.set("a", 1);
    lru.delete("a");
    lru.delete("missing");
    expect(lru.size).toBe(0);
    expect(lru.get("a")).toBeUndefined();
  });

  it("holds at least one entry", () => {
    const lru = new Lru<string, number>(0);
    lru.set("a", 1);
    lru.set("b", 2);
    expect(lru.size).toBe(1);
    expect(lru.get("b")).toBe(2);
  });
});
