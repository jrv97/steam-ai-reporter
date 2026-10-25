import { afterEach, describe, expect, it, vi } from "vitest";
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
  it("empties the region and fills it on the next frame", async () => {
    const live = region();
    const earlier = "Earlier";
    live.textContent = earlier;
    announce(document, live, "Saved");
    expect(live.textContent).toBe("");
    await vi.waitFor(() => {
      expect(live.textContent).toBe("Saved");
    });
  });

  it("empties the region again for a message that repeats, so it is heard twice", async () => {
    const live = region();
    announce(document, live, "Saved");
    await vi.waitFor(() => {
      expect(live.textContent).toBe("Saved");
    });
    announce(document, live, "Saved");
    expect(live.textContent).toBe("");
    await vi.waitFor(() => {
      expect(live.textContent).toBe("Saved");
    });
  });

  it("fills the region at once where the document has no window", () => {
    const detached = document.implementation.createHTMLDocument("");
    const live = detached.createElement("div");
    announce(detached, live, "Saved");
    expect(live.textContent).toBe("Saved");
  });
});
