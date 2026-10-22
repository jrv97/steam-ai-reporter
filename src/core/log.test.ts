import { describe, expect, it, vi } from "vitest";
import { englishI18n } from "../../tests/helpers/i18n";
import { SarError } from "./errors";
import { createLogger } from "./log";

const i18n = englishI18n();

function setup(debug = false) {
  const sink = { error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn() };
  const logger = createLogger(i18n, sink, debug);
  return { sink, logger };
}

describe("SarError", () => {
  it("carries a catalog key and params, not prose", () => {
    const cause = new TypeError();
    const error = new SarError("error_unexpected", {}, { cause });
    expect(error).toBeInstanceOf(Error);
    expect(error.name).toBe("SarError");
    expect(error.code).toBe("error_unexpected");
    expect(error.message).toBe("error_unexpected");
    expect(error.params).toStrictEqual({});
    expect(error.cause).toBe(cause);
  });
});

describe("createLogger", () => {
  it("logs a SarError as catalog text with the [sar] prefix", () => {
    const { sink, logger } = setup();
    const error = new SarError("error_unexpected", {});
    logger.error(error);
    expect(sink.error).toHaveBeenCalledWith("[sar]", i18n.t("error_unexpected"), error);
  });

  it("logs any other value under error_unexpected", () => {
    const { sink, logger } = setup();
    logger.error(42);
    expect(sink.error).toHaveBeenCalledWith("[sar]", i18n.t("error_unexpected"), 42);
  });

  it("writes warnings and info by key", () => {
    const { sink, logger } = setup();
    logger.warn("ext_short_name", {});
    logger.info("ext_name", {});
    expect(sink.warn).toHaveBeenCalledWith("[sar]", i18n.t("ext_short_name"));
    expect(sink.info).toHaveBeenCalledWith("[sar]", i18n.t("ext_name"));
  });

  it("writes debug lines only when debug logging is on", () => {
    const quiet = setup(false);
    quiet.logger.debug("ext_name", {});
    expect(quiet.sink.debug).not.toHaveBeenCalled();
    const verbose = setup(true);
    verbose.logger.debug("ext_name", {});
    expect(verbose.sink.debug).toHaveBeenCalledWith("[sar]", i18n.t("ext_name"));
  });
});
