import type { CapsuleRenderer, ScanBatch } from "../../src/core/scan/renderer";

export interface RecordingRenderer extends CapsuleRenderer {
  /** Every batch the scanner sent, in order. */
  readonly batches: ScanBatch[];
}

/**
 * A renderer that records batches. With `badges`, it also does what a real renderer must: it puts
 * one `span.sar-badge` into each found or changed host's anchor unless the host already has one.
 */
export function recordingRenderer(options: { readonly badges?: boolean; } = {}): RecordingRenderer {
  const batches: ScanBatch[] = [];
  return {
    batches,
    render(batch) {
      batches.push(batch);
      if (options.badges !== true) {
        return;
      }
      for (const host of [...batch.found, ...batch.changed]) {
        if (host.element.querySelector(".sar-badge") === null) {
          const badge = document.createElement("span");
          badge.className = "sar-badge";
          host.anchor.append(badge);
        }
      }
    },
  };
}
