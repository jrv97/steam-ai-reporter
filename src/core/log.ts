import { TksError } from "./errors";
import type { MessageKey, MessageParams } from "./i18n/keys.gen";
import type { I18n } from "./i18n/t";

/** The part of `console` the logger writes to. */
export interface ConsoleSink {
  error(...data: readonly unknown[]): void;
  warn(...data: readonly unknown[]): void;
  info(...data: readonly unknown[]): void;
  debug(...data: readonly unknown[]): void;
}

/** Logs catalog messages by key (rule 9), each line prefixed with `[tks]`. */
export interface Logger {
  /** A `TksError` logs its own message; anything else logs `error_unexpected` and the value. */
  error(problem: unknown): void;
  warn<K extends MessageKey>(code: K, params: MessageParams[K]): void;
  info<K extends MessageKey>(code: K, params: MessageParams[K]): void;
  /** Written only when debug logging is on (`settings.debug`). */
  debug<K extends MessageKey>(code: K, params: MessageParams[K]): void;
}

const LOG_PREFIX = "[tks]";

export function createLogger(i18n: I18n, sink: ConsoleSink, debug: boolean): Logger {
  return {
    error(problem) {
      if (problem instanceof TksError) {
        sink.error(LOG_PREFIX, i18n.t(problem.code, problem.params), problem);
      } else {
        sink.error(LOG_PREFIX, i18n.t("error_unexpected"), problem);
      }
    },
    warn(code, params) {
      sink.warn(LOG_PREFIX, i18n.t(code, params));
    },
    info(code, params) {
      sink.info(LOG_PREFIX, i18n.t(code, params));
    },
    debug(code, params) {
      if (debug) {
        sink.debug(LOG_PREFIX, i18n.t(code, params));
      }
    },
  };
}

/** Failures of one repeated operation, logged once per streak. */
export interface FailureStreak {
  /** Logs `problem` when it starts a streak, and nothing while the streak lasts. */
  failed(problem: unknown): void;
  /** Ends the streak, so the next failure logs again. */
  worked(): void;
}

/** A `FailureStreak` that hands the first failure of each streak to `log`. */
export function createFailureStreak(log: (problem: unknown) => void): FailureStreak {
  let failing = false;
  return {
    failed(problem) {
      if (!failing) {
        log(problem);
      }
      failing = true;
    },
    worked() {
      failing = false;
    },
  };
}
