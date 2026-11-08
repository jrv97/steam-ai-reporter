import { countingStore } from "./counting-store";
import { fakeArea, fakeChanges, faultyArea } from "./fake-area";
import { closedBreaker } from "./fake-breaker";
import {
  fakeDetector,
  heldDetector,
  pageDetector,
  partialDetector,
  rejectingDetector,
} from "./fake-detector";
import { fakeFileTransfer, fakeFileTransferHarness } from "./fake-file-transfer";
import { fakeFetch, fakeHttp, timedHttp, withheldHttp } from "./fake-http";
import { fixedClock } from "./fixed-clock";
import { fakeGm, fakeWatch, faultyGm } from "./gm-fake";
import { loggingStore } from "./logging-store";
import { manualQueue } from "./manual-queue";
import { memoryStore } from "./memory-store";
import { consoleMocks, recordingLogger } from "./recording-logger";
import { recordingRenderer } from "./recording-renderer";
import { noFaults } from "./storage-faults";
import { useTimerClock } from "./timer-clock";

/** The only source of test doubles: fakes of the ports and of the browser APIs under them. */
export const fake = {
  /** An `Http` answering from routes (see `make.item.route`), recording calls and overlap. */
  http: fakeHttp,
  /** A `fetch` answering from the same routes with real `Response` objects. */
  fetch: fakeFetch,
  /** A fake `Http` that also records when each request went out by a `Clock`. */
  timedHttp,
  /** An `Http` that withholds every request. */
  withheldHttp,
  /** A `storage.local` area that clones values in and out and records calls. */
  area: fakeArea,
  /** A `storage.local` area that injects `faults`. */
  faultyArea,
  /** A `storage.onChanged` for the `local` area that a test fires by hand. */
  changes: fakeChanges,
  /** A `GM_addValueChangeListener` that a test triggers by hand, per key. */
  watch: fakeWatch,
  /** The `GM` storage calls, storing serialized values. */
  gm: fakeGm,
  /** The `GM` storage calls, injecting `faults`. */
  faultyGm,
  /** Fault settings for `faultyArea` and `faultyGm`: none until a test sets them. */
  faults: noFaults,
  /** A `Detector` answering each ID with `verdictsFor(id)`, recording calls. */
  detector: fakeDetector,
  /** A `Detector` whose every call rejects. */
  rejectingDetector,
  /** A `Detector` that answers only the IDs a map holds and leaves the rest out. */
  partialDetector,
  /** A `Detector` whose call answers only once the test calls `release`. */
  heldDetector,
  /** A stand-in HTML fallback: one app page request per ID over an `Http`, all at once. */
  pageDetector,
  /** A `Breaker` that never opens. */
  closedBreaker,
  /** A `FileTransfer` in memory that lets a test act as the person. */
  fileTransfer: fakeFileTransfer,
  /** `fileTransfer` as the file transfer contract's harness. */
  fileTransferHarness: fakeFileTransferHarness,
  /** A `KeyValueStore` in memory, with optional initial values. */
  store: memoryStore,
  /** A `KeyValueStore` wrapper that counts calls and can break and heal. */
  countingStore,
  /** A `KeyValueStore` wrapper that logs calls and can act between two reads. */
  loggingStore,
  /** A real logger over the English catalog, writing to mocks. */
  logger: recordingLogger,
  /** Console mocks for code that takes a console sink, such as `start`. */
  console: consoleMocks,
  /** A `CapsuleRenderer` that records batches, and draws badges with `{ badges: true }`. */
  renderer: recordingRenderer,
  /** `frame` and `delay` callbacks that a test runs by hand. */
  queue: manualQueue,
  /** A `Clock` that stands still at `t` until a test moves it. */
  clock: fixedClock,
  /** Fake timers and `Date` from `T0`, and a `Clock` on them; call `vi.useRealTimers()` after. */
  timerClock: useTimerClock,
} as const;
