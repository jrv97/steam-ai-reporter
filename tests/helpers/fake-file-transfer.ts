import type { FileTransfer, PickedFile } from "../../src/core/ports";
import type { FileTransferHarness, SavedFile } from "../contracts/file-transfer.contract";

/** A `FileTransfer` in memory: it records downloads and lets a test act as the person. */
export interface FakeFileTransfer extends FileTransfer {
  /** The files offered for download so far, in order. */
  readonly files: readonly SavedFile[];
  /** The label of every chooser opened so far. */
  readonly labels: readonly string[];
  /** Makes every later save throw, as a browser that refuses the download does. */
  refuse(): void;
  /** The person picks `file` in the open chooser. */
  choose(file: PickedFile): void;
  /** The person closes the chooser without a file. */
  cancel(): void;
}

export function fakeFileTransfer(): FakeFileTransfer {
  const files: SavedFile[] = [];
  const labels: string[] = [];
  let listener: ((file: PickedFile) => void) | undefined;
  let refusing = false;
  return {
    files,
    labels,
    save(name, text) {
      if (refusing) {
        throw new Error();
      }
      files.push({ name, text });
    },
    pick(label, onPick) {
      labels.push(label);
      listener = onPick;
    },
    refuse() {
      refusing = true;
    },
    choose(file) {
      listener?.(file);
    },
    cancel() {
      // The chooser closes; nobody hears of it.
    },
  };
}

/** The fake as a contract harness. */
export function fakeFileTransferHarness(): FileTransferHarness {
  const fake = fakeFileTransfer();
  return {
    transfer: fake,
    saved: () => Promise.resolve(fake.files),
    choose: (file) => {
      fake.choose(file);
    },
    cancel: () => {
      fake.cancel();
    },
  };
}
