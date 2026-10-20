import { vi } from "vitest";
import { createI18n } from "../../src/core/i18n/t";
import { createLogger, type Logger } from "../../src/core/log";
import en from "../../src/locales/en/messages.json";

export interface RecordingLogger {
  readonly logger: Logger;
  /** The console mocks the logger writes to; each call gets `[sar]` and the English text. */
  readonly sink: {
    readonly error: ReturnType<typeof vi.fn>;
    readonly warn: ReturnType<typeof vi.fn>;
    readonly info: ReturnType<typeof vi.fn>;
    readonly debug: ReturnType<typeof vi.fn>;
  };
}

/** A real logger over the English catalog, writing to mocks instead of the console. */
export function recordingLogger(): RecordingLogger {
  const sink = { error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn() };
  return { logger: createLogger(createI18n({ en }, "en"), sink, true), sink };
}
