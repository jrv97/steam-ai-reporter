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
  it.each([
    { case: "a new message over other text", earlier: () => make.text.note() },
    { case: "a message that repeats, so it is heard twice", earlier: (message: string) => message },
  ])("empties the region at once and fills it on the next frame for $case", async ({ earlier }) => {
    const live = region();
    const message = make.text.note();
    live.textContent = earlier(message);
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
