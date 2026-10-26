import type { FileTransfer, PickedFile } from "../../core/ports";

const JSON_TYPE = "application/json";
const ACCEPT = ".json,application/json";

/**
 * How long a download's Blob URL lives. Revoking it at once can cancel a slow download in some
 * browsers, so it waits; the text is small.
 */
const REVOKE_AFTER_MS = 30_000;

/**
 * `FileTransfer` over an `a[download]` on a Blob URL and a hidden file input, both kept inside
 * `container`: the options page body, or the userscript dialog, outside which a modal page is
 * inert. The extension page and the userscript share it, with no permission and no request.
 */
export function createFileTransfer(container: HTMLElement): FileTransfer {
  const doc = container.ownerDocument;
  let input: HTMLInputElement | undefined;
  let listener: ((file: PickedFile) => void) | undefined;

  function chooser(): HTMLInputElement {
    if (input !== undefined) {
      return input;
    }
    const created = doc.createElement("input");
    created.type = "file";
    created.accept = ACCEPT;
    created.hidden = true;
    created.addEventListener("change", () => {
      const file = created.files?.[0];
      // Cleared, so picking the same file again is a change too
      created.value = "";
      if (file !== undefined) {
        listener?.(file);
      }
    });
    container.append(created);
    input = created;
    return created;
  }

  return {
    save(name, text) {
      const url = URL.createObjectURL(new Blob([text], { type: JSON_TYPE }));
      const link = doc.createElement("a");
      link.href = url;
      link.download = name;
      link.hidden = true;
      container.append(link);
      try {
        link.click();
      } finally {
        link.remove();
        setTimeout(() => {
          URL.revokeObjectURL(url);
        }, REVOKE_AFTER_MS);
      }
    },

    pick(label, onPick) {
      listener = onPick;
      const own = chooser();
      own.setAttribute("aria-label", label);
      own.click();
    },
  };
}
