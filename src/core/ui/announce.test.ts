import { afterEach, describe, expect, it, vi } from "vitest";
import { make } from "../../../tests/helpers/factory";
import { announce, POLITE } from "./announce";

afterEach(() => {
  document.body.replaceChildren();
});

function region(): HTMLElement {
  const node = document.createElement("div");
  node.setAttribute("aria-live", POLITE);
  document.body.append(node);
  return node;
}

describe("announce", () => {
  it("empties the region again for a message that repeats, so it is heard twice", async () => {
    const live = region();
    const message = make.text.note();
    announce(document, live, message);
    await vi.waitFor(() => {
      expect(live.textContent).toBe(message);
    });
    announce(document, live, message);
    expect(live.textContent).toBe("");
    await vi.waitFor(() => {
      expect(live.textContent).toBe(message);
    });
  });

  it("fills the region at once where the document has no window", () => {
    const detached = document.implementation.createHTMLDocument("");
    const live = detached.createElement("div");
    const message = make.text.note();
    announce(detached, live, message);
    expect(live.textContent).toBe(message);
  });
});
