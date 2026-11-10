import { describe, expect, it } from "vitest";
import { make } from "../../../tests/helpers/factory";
import { fake } from "../../../tests/helpers/fakes";
import { englishI18n } from "../../../tests/helpers/i18n";
import type { LoadProgress } from "../progress";
import { createLoadStrip } from "./load-strip";

const i18n = englishI18n();
const T0 = make.time();
const SECOND = 1000;

/** A strip over a fake source, on a fixed clock and manual timers. */
function setup() {
  const source = fake.progressSource();
  const clock = fake.clock(T0);
  const timers = fake.queue();
  const strip = createLoadStrip(document, i18n, source, {
    idPrefix: make.text.token(),
    now: () => clock.now(),
    delay: timers.delay,
  });
  const part = (name: string) => strip.element.querySelector(`.tks-load-${name}`);
  const read = () => ({
    state: strip.element.getAttribute("data-tks-load"),
    message: part("message")?.textContent,
    bold: part("message")?.querySelector("strong")?.textContent,
    count: part("count")?.textContent,
    now: part("bar")?.getAttribute("aria-valuenow"),
    max: part("bar")?.getAttribute("aria-valuemax"),
  });
  return { source, clock, timers, strip, read };
}

describe("createLoadStrip", () => {
  const seconds = i18n.t("options_progress_seconds", { seconds: "42" });
  it.each<
    readonly [string, LoadProgress | undefined, ReturnType<ReturnType<typeof setup>["read"]>]
  >(
    [
      ["loading", { total: 48, answered: 12, unknown: 0 }, {
        state: "loading",
        message: i18n.t("options_progress_loading"),
        bold: undefined,
        count: i18n.plural("options_progress_loading_count", 48, { answered: "12" }),
        now: "12",
        max: "48",
      }],
      ["loading once Steam's pause is over", {
        total: 48,
        answered: 12,
        unknown: 0,
        pausedUntil: T0,
      }, {
        state: "loading",
        message: i18n.t("options_progress_loading"),
        bold: undefined,
        count: i18n.plural("options_progress_loading_count", 48, { answered: "12" }),
        now: "12",
        max: "48",
      }],
      ["paused", { total: 48, answered: 12, unknown: 0, pausedUntil: T0 + 41 * SECOND + 1 }, {
        state: "paused",
        message: i18n.t("options_progress_paused", { time: seconds }),
        bold: seconds,
        count: i18n.t("options_progress_count", { answered: "12", total: "48" }),
        now: "12",
        max: "48",
      }],
      ["done", { total: 48, answered: 48, unknown: 0 }, {
        state: "done",
        message: i18n.plural("options_progress_done", 48),
        bold: undefined,
        count: i18n.t("options_progress_count", { answered: "48", total: "48" }),
        now: "48",
        max: "48",
      }],
      ["done with games left unknown", { total: 48, answered: 48, unknown: 2 }, {
        state: "done",
        message: i18n.plural("options_progress_done_unknown", 46, { unknown: "2" }),
        bold: undefined,
        count: i18n.t("options_progress_count", { answered: "48", total: "48" }),
        now: "48",
        max: "48",
      }],
      ["a page that asked for no game yet", { total: 0, answered: 0, unknown: 0 }, {
        state: "empty",
        message: i18n.t("options_progress_no_games"),
        bold: undefined,
        count: "",
        now: "0",
        max: "1",
      }],
      ["no store page", undefined, {
        state: "none",
        message: i18n.t("options_progress_no_page"),
        bold: undefined,
        count: "",
        now: "0",
        max: "1",
      }],
    ],
  )("draws %s", (_name, progress, expected) => {
    const { source, read } = setup();
    source.send(progress);
    expect(read()).toStrictEqual(expected);
  });

  it("draws at most once a second, and counts down once a second while paused", () => {
    const { source, clock, timers, read } = setup();
    source.send({ total: 2, answered: 0, unknown: 0, pausedUntil: T0 + 2 * SECOND });
    source.send({ total: 2, answered: 1, unknown: 0, pausedUntil: T0 + 2 * SECOND });
    expect(read().now).toBe("0");
    clock.advance(SECOND);
    timers.run();
    expect(read()).toMatchObject({
      now: "1",
      bold: i18n.t("options_progress_seconds", { seconds: "1" }),
    });
    clock.advance(SECOND);
    timers.run();
    expect(read().state).toBe("loading");
    expect(timers.size).toBe(0);
  });

  it("stops listening and drawing when stopped", () => {
    const { source, timers, strip } = setup();
    source.send({ total: 2, answered: 0, unknown: 0, pausedUntil: T0 + SECOND });
    strip.stop();
    expect(source.listening).toBe(0);
    expect(timers.size).toBe(0);
  });
});
