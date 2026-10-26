import { afterEach, describe, expect, it, vi } from "vitest";
import {
  fileTransferContract,
  type FileTransferHarness,
} from "../../../tests/contracts/file-transfer.contract";
import { createFileTransfer } from "./file-transfer";

/** The container, with the Blob URLs it made and the downloads it started. */
function domSetup() {
  const container = document.createElement("div");
  document.body.append(container);
  const blobs = new Map<string, Blob | MediaSource>();
  vi.spyOn(URL, "createObjectURL").mockImplementation((blob) => {
    const url = `blob:test/${String(blobs.size)}`;
    blobs.set(url, blob);
    return url;
  });
  const revoke = vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => undefined);
  const clicked: { readonly name: string; readonly url: string; }[] = [];
  container.addEventListener("click", (event) => {
    if (event.target instanceof HTMLAnchorElement) {
      event.preventDefault();
      clicked.push({ name: event.target.download, url: event.target.getAttribute("href") ?? "" });
    }
  });
  return { container, blobs, clicked, revoke, transfer: createFileTransfer(container) };
}

function fileInput(container: HTMLElement): HTMLInputElement {
  const input = container.querySelector("input");
  if (input === null) {
    throw new Error();
  }
  return input;
}

function domHarness(): FileTransferHarness {
  const { container, blobs, clicked, transfer } = domSetup();
  return {
    transfer,
    saved: () =>
      Promise.all(clicked.map(async ({ name, url }) => {
        const blob = blobs.get(url);
        return { name, text: blob instanceof Blob ? await blob.text() : "" };
      })),
    choose(file) {
      const input = fileInput(container);
      Object.defineProperty(input, "files", { configurable: true, value: [file] });
      input.dispatchEvent(new Event("change"));
    },
    cancel() {
      fileInput(container).dispatchEvent(new Event("cancel"));
    },
  };
}

afterEach(() => {
  document.body.replaceChildren();
  vi.useRealTimers();
});

fileTransferContract("createFileTransfer", domHarness);

describe("createFileTransfer", () => {
  it("leaves no link behind and revokes the Blob URL later", () => {
    vi.useFakeTimers();
    const { container, transfer, revoke } = domSetup();
    transfer.save("backup.json", "{}");
    expect(container.querySelector("a")).toBeNull();
    expect(revoke).not.toHaveBeenCalled();
    vi.runAllTimers();
    expect(revoke).toHaveBeenCalledWith("blob:test/0");
  });

  it("keeps one hidden, labelled JSON file input in the container", () => {
    const { container, transfer } = domSetup();
    transfer.pick("first", () => undefined);
    transfer.pick("second", () => undefined);
    const inputs = [...container.querySelectorAll("input")];
    const seen = inputs.map((input) => [input.type, input.accept, input.hidden]);
    expect(seen).toStrictEqual([["file", ".json,application/json", true]]);
    expect(inputs[0]?.getAttribute("aria-label")).toBe("second");
  });
});
