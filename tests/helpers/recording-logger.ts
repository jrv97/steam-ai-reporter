import { type Mock, vi } from "vitest";
import { createI18n } from "../../src/core/i18n/t";
import { createLogger, type Logger } from "../../src/core/log";
import en from "../../src/locales/en/messages.json";

/** One console method, as `ConsoleSink` takes it. */
type ConsoleMethod = (...data: readonly unknown[]) => void;

/** Console mocks that stand in for the browser console. */
export interface ConsoleMocks {
  readonly error: Mock<ConsoleMethod>;
  readonly warn: Mock<ConsoleMethod>;
  readonly info: Mock<ConsoleMethod>;
  readonly debug: Mock<ConsoleMethod>;
}

export interface RecordingLogger {
  readonly logger: Logger;
  /** The console mocks the logger writes to; each call gets `[sar]` and the English text. */
  readonly sink: ConsoleMocks;
}

/** Fresh console mocks, for code that takes a console sink. */
export function consoleMocks(): ConsoleMocks {
  return {
    error: vi.fn<ConsoleMethod>(),
    warn: vi.fn<ConsoleMethod>(),
    info: vi.fn<ConsoleMethod>(),
    debug: vi.fn<ConsoleMethod>(),
  };
}

/** A real logger over the English catalog, writing to mocks instead of the console. */
export function recordingLogger(): RecordingLogger {
  const sink = consoleMocks();
  return { logger: createLogger(createI18n({ en }, "en"), sink, true), sink };
}
