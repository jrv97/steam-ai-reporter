import { describe, expect, it } from "vitest";
import type { FileTransfer, PickedFile } from "../../src/core/ports";
import { pickedFile } from "../helpers/backup";

/** A file offered for download. */
export interface SavedFile {
  readonly name: string;
  readonly text: string;
}

/** A `FileTransfer` with the person's side of it: the downloads, the chooser. */
export interface FileTransferHarness {
  readonly transfer: FileTransfer;
  /** The files offered for download so far, in order. */
  readonly saved: () => Promise<readonly SavedFile[]>;
  /** The person picks `file` in the open chooser. */
  readonly choose: (file: PickedFile) => void;
  /** The person closes the chooser without a file. */
  readonly cancel: () => void;
}

/**
 * The behavior every `FileTransfer` must have (src/core/AGENTS.md, "The contract-test rule").
 * `make` returns a new harness for each case.
 */
export function fileTransferContract(name: string, make: () => FileTransferHarness): void {
  describe(`FileTransfer contract: ${name}`, () => {
    it("offers the text under the name, unchanged", async () => {
      const { transfer, saved } = make();
      // Markup and a non-ASCII letter, which must pass through as text
      const text = `{"name":"Caf${String.fromCodePoint(0xe9)} <b>&amp;</b>"}\n`;
      transfer.save("backup.json", text);
      expect(await saved()).toStrictEqual([{ name: "backup.json", text }]);
    });

    it("offers each save as a file of its own", async () => {
      const { transfer, saved } = make();
      transfer.save("a.json", "1");
      transfer.save("b.json", "2");
      expect((await saved()).map((file) => file.name)).toStrictEqual(["a.json", "b.json"]);
    });

    it("hands the picked file to the listener", async () => {
      const { transfer, choose } = make();
      const heard: string[] = [];
      transfer.pick("Backup file", (file) => {
        void file.text().then((text) => heard.push(`${file.name}:${String(file.size)}:${text}`));
      });
      choose(pickedFile("abc", "mine.json"));
      await Promise.resolve();
      await Promise.resolve();
      expect(heard).toStrictEqual(["mine.json:3:abc"]);
    });

    it("tells nothing when the person cancels", () => {
      const { transfer, cancel } = make();
      const heard: PickedFile[] = [];
      transfer.pick("Backup file", (file) => heard.push(file));
      cancel();
      expect(heard).toStrictEqual([]);
    });

    it("tells the same file picked twice, twice", () => {
      const { transfer, choose } = make();
      const heard: string[] = [];
      const file = pickedFile("abc");
      transfer.pick("Backup file", (picked) => heard.push(picked.name));
      choose(file);
      transfer.pick("Backup file", (picked) => heard.push(picked.name));
      choose(file);
      expect(heard).toHaveLength(2);
    });

    it("tells only the listener of the latest pick", () => {
      const { transfer, choose } = make();
      const heard: string[] = [];
      transfer.pick("Backup file", () => heard.push("first"));
      transfer.pick("Backup file", () => heard.push("second"));
      choose(pickedFile("abc"));
      expect(heard).toStrictEqual(["second"]);
    });
  });
}
