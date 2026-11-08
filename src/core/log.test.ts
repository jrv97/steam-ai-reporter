import { describe, expect, it } from "vitest";
import { make } from "../../tests/helpers/factory";
import { fake } from "../../tests/helpers/fakes";
import { englishI18n } from "../../tests/helpers/i18n";
import { SarError } from "./errors";
import { createLogger } from "./log";

const i18n = englishI18n();

function setup(debug = false) {
  const sink = fake.console();
  const logger = createLogger(i18n, sink, debug);
  return { sink, logger };
}

describe("SarError", () => {
  it("carries a catalog key and params, not prose", () => {
    const cause = new TypeError();
    const params = { name: make.text.name() };
    const error = new SarError("error_backup_read", params, { cause });
    expect(error).toBeInstanceOf(Error);
    expect(error.name).toBe("SarError");
    expect(error.code).toBe("error_backup_read");
    expect(error.message).toBe("error_backup_read");
    expect(error.params).toStrictEqual(params);
    expect(error.cause).toBe(cause);
  });
});

describe("createLogger", () => {
  it("logs a SarError as the catalog text of its own code and params, with a [sar] prefix", () => {
    const { sink, logger } = setup();
    const params = { name: make.text.name() };
    const error = new SarError("error_backup_read", params);
    logger.error(error);
    const text = i18n.t("error_backup_read", params);
    expect(text).not.toBe(i18n.t("error_unexpected"));
    expect(sink.error).toHaveBeenCalledWith("[sar]", text, error);
  });

  it("logs any other value under error_unexpected", () => {
    const { sink, logger } = setup();
    const problem = make.text.note();
    logger.error(problem);
    expect(sink.error).toHaveBeenCalledWith("[sar]", i18n.t("error_unexpected"), problem);
  });

  it("writes warnings and info by key", () => {
    const { sink, logger } = setup();
    logger.warn("ext_short_name", {});
    logger.info("ext_name", {});
    expect(sink.warn).toHaveBeenCalledWith("[sar]", i18n.t("ext_short_name"));
    expect(sink.info).toHaveBeenCalledWith("[sar]", i18n.t("ext_name"));
  });

  it("writes no debug line while debug logging is off", () => {
    const { sink, logger } = setup(false);
    logger.debug("ext_name", {});
    expect(sink.debug).not.toHaveBeenCalled();
  });

  it("writes debug lines while debug logging is on", () => {
    const { sink, logger } = setup(true);
    logger.debug("ext_name", {});
    expect(sink.debug).toHaveBeenCalledWith("[sar]", i18n.t("ext_name"));
  });
});
