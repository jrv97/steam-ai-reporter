import { describe, expect, it } from "vitest";
import { make } from "../../../tests/helpers/factory";
import { fake } from "../../../tests/helpers/fakes";
import { englishI18n } from "../../../tests/helpers/i18n";
import { createSettle } from "./settle";

describe("createSettle", () => {
  it("logs the first rejection of each streak, and an answer ends the streak", async () => {
    const { logger, sink } = fake.logger();
    const settle = createSettle(logger);
    const problem = new Error();
    const rejecting = fake.rejectingDetector(problem);
    const ids = make.appIds(1);
    await settle(rejecting, ids);
    await settle(rejecting, ids);
    expect(sink.error).toHaveBeenCalledExactlyOnceWith(
      "[tks]",
      englishI18n().t("error_unexpected"),
      problem,
    );
    await settle(fake.detector(() => make.verdicts()), ids);
    await settle(rejecting, ids);
    expect(sink.error).toHaveBeenCalledTimes(2);
  });
});
