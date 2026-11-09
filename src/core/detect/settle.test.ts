import { describe, expect, it } from "vitest";
import { make } from "../../../tests/helpers/factory";
import { fake } from "../../../tests/helpers/fakes";
import { englishI18n } from "../../../tests/helpers/i18n";
import { settle } from "./settle";

describe("settle", () => {
  it("logs a rejecting detector's problem and answers unknown error for each ID", async () => {
    const { logger, sink } = fake.logger();
    const problem = new Error();
    const ids = make.appIds(2);
    const verdicts = await settle(fake.rejectingDetector(problem), ids, logger);
    expect(verdicts).toStrictEqual(
      new Map(ids.map((id) => [id, make.verdicts.uniform("error")])),
    );
    expect(sink.error).toHaveBeenCalledExactlyOnceWith(
      "[tks]",
      englishI18n().t("error_unexpected"),
      problem,
    );
  });
});
