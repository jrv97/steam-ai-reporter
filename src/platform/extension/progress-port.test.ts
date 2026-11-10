import { describe, expect, it } from "vitest";
import { make } from "../../../tests/helpers/factory";
import { fake } from "../../../tests/helpers/fakes";
import { serveProgress } from "./progress-port";

describe("serveProgress", () => {
  it("posts each progress until the popup leaves", () => {
    const source = fake.progressSource();
    const port = fake.tabPort();
    serveProgress(source, port);
    const sent = [make.progress(), make.progress()];
    for (const each of sent) {
      source.send(each);
    }
    port.drop();
    source.send(make.progress());
    expect(port.posted).toStrictEqual(sent);
    expect(source.listening).toBe(0);
  });

  it("closes the port when the page has no running app", () => {
    const source = fake.progressSource();
    const port = fake.tabPort();
    serveProgress(source, port);
    source.send(undefined);
    expect(port.closed).toBe(true);
  });
});
