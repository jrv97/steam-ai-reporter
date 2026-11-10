import * as v from "valibot";
import type { ProgressSource } from "../../core/progress";
import type { TabPort } from "./progress-port";

// The popup's end of the progress port, apart from the content script's so that content.js
// carries no schema it never reads.

const CountSchema = v.pipe(v.number(), v.safeInteger(), v.minValue(0));

/** Reads a `LoadProgress` that crossed the port. */
const LoadProgressSchema = v.pipe(
  v.object({
    total: CountSchema,
    answered: CountSchema,
    unknown: CountSchema,
    pausedUntil: v.exactOptional(v.pipe(v.number(), v.safeInteger())),
  }),
  v.check(({ total, answered, unknown }) => unknown <= answered && answered <= total),
);

/**
 * The popup's end: the progress of the store page in the tab `connect` reaches. No tab, a failed
 * connection or a tab with no content script is heard as no store page; a message that is no
 * progress is ignored.
 */
export function tabProgress(connect: () => Promise<TabPort | undefined>): ProgressSource {
  return {
    subscribe(listener) {
      let port: TabPort | undefined;
      let open = true;
      connect().then((connected) => {
        if (!open) {
          connected?.disconnect();
          return;
        }
        port = connected;
        if (connected === undefined) {
          listener(undefined);
          return;
        }
        connected.onMessage((message) => {
          const read = v.safeParse(LoadProgressSchema, message);
          if (read.success) {
            listener(read.output);
          }
        });
        connected.onDisconnect(() => {
          listener(undefined);
        });
      }, () => {
        if (open) {
          listener(undefined);
        }
      });
      return () => {
        open = false;
        port?.disconnect();
      };
    },
  };
}
