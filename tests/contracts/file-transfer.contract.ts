import { describe, expect, it } from "vitest";
import type { FileTransfer, PickedFile } from "../../src/core/ports";
import { make } from "../helpers/factory";

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
 * `harness` returns a new harness for each case.
 */
export function fileTransferContract(name: string, harness: () => FileTransferHarness): void {
  describe(`FileTransfer contract: ${name}`, () => {
    it("offers the text under the name, unchanged", async () => {
      const { transfer, saved } = harness();
      // Markup and a non-ASCII letter, which must pass through as text
      const text = `${make.text.markup()} ${make.text.note()}${String.fromCodePoint(0xe9)}
`;
      const name = make.text.fileName();
      transfer.save(name, text);
      expect(await saved()).toStrictEqual([{ name, text }]);
    });

    it("offers each save as a file of its own", async () => {
      const { transfer, saved } = harness();
      const names = [make.text.fileName(), make.text.fileName()];
      for (const name of names) {
        transfer.save(name, make.http.body());
      }
      expect((await saved()).map((file) => file.name)).toStrictEqual(names);
    });

    it("hands the picked file to the listener", async () => {
      const { transfer, choose } = harness();
      const file = make.backup.file(make.http.body(), make.text.fileName());
      const heard: string[] = [];
      transfer.pick(make.text.note(), (picked) => {
        void picked.text().then((text) =>
          heard.push(`${picked.name}:${String(picked.size)}:${text}`)
        );
      });
      choose(file);
      await Promise.resolve();
      await Promise.resolve();
      expect(heard).toStrictEqual([`${file.name}:${String(file.size)}:${await file.text()}`]);
    });

    it("tells nothing when the person cancels", () => {
      const { transfer, cancel } = harness();
      const heard: PickedFile[] = [];
      transfer.pick(make.text.note(), (file) => heard.push(file));
      cancel();
      expect(heard).toStrictEqual([]);
    });

    it("tells the same file picked twice, twice", () => {
      const { transfer, choose } = harness();
      const heard: string[] = [];
      const file = make.backup.file(make.http.body());
      transfer.pick(make.text.note(), (picked) => heard.push(picked.name));
      choose(file);
      transfer.pick(make.text.note(), (picked) => heard.push(picked.name));
      choose(file);
      expect(heard).toHaveLength(2);
    });

    it("tells only the listener of the latest pick", () => {
      const { transfer, choose } = harness();
      const heard: string[] = [];
      transfer.pick(make.text.note(), () => heard.push("first"));
      transfer.pick(make.text.note(), () => heard.push("second"));
      choose(make.backup.file(make.http.body()));
      expect(heard).toStrictEqual(["second"]);
    });
  });
}
