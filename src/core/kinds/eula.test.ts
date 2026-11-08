import { describe, expect, it } from "vitest";
import { make } from "../../../tests/helpers/factory";
import { verdictOf } from "../../../tests/helpers/getitems";
import { EULA_KIND, eulaLink } from "./eula";

function fromEula(eula: unknown) {
  return verdictOf(EULA_KIND, { eula });
}

const STORE = "https://store.steampowered.com";

describe("eulaLink", () => {
  it.each([
    ["collapses the doubled slash Steam serves", "//eula/3751950_eula_0", "/eula/3751950_eula_0"],
    ["collapses a tripled slash", "///eula/1_eula_0", "/eula/1_eula_0"],
    ["keeps a clean link", "/eula/1_eula_0", "/eula/1_eula_0"],
    [
      "keeps the query and fragment",
      "//eula/1_eula_0?l=english#top",
      "/eula/1_eula_0?l=english#top",
    ],
    ["drops the default port", ":443/eula/1", "/eula/1"],
  ])("%s: %s", (_name, raw, link) => {
    expect(eulaLink(`${STORE}${raw}`)).toBe(`${STORE}${link}`);
  });

  it("writes the scheme and host in lower case", () => {
    expect(eulaLink("HTTPS://STORE.STEAMPOWERED.COM//eula/1")).toBe(`${STORE}/eula/1`);
  });

  it.each([
    ["another scheme", "http://store.steampowered.com//eula/1_eula_0"],
    ["another scheme", "javascript:alert(1)"],
    ["another scheme", "javascript://store.steampowered.com/eula/1%0Aalert(1)"],
    ["another scheme", "data:text/html,<script>alert(1)</script>"],
    ["another scheme", "ftp://store.steampowered.com/eula/1"],
    ["another scheme", "blob:https://store.steampowered.com/eula/1"],
    ["another host", "https://example.com//eula/1_eula_0"],
    ["another host", "https://steampowered.com/eula/1"],
    ["another host", "https://help.steampowered.com/eula/1"],
    ["another host", "https://store.steampowered.com.example.com/eula/1"],
    ["another host", "https://example.com/store.steampowered.com/eula/1"],
    ["another host", "https://example.com/?next=https://store.steampowered.com/eula/1"],
    ["another host", "https://store.steampowered.com@example.com/eula/1"],
    ["another host", "https://store.steampowered.com:pw@example.com/eula/1"],
    ["another host", "https://store.steampowered.com./eula/1"],
    ["another host", "https://store.steampowered.com\\@example.com/eula/1"],
    ["another host", "https://STORE.STEAMPOWERED.COM.example.com/eula/1"],
    ["credentials", "https://user@store.steampowered.com/eula/1"],
    ["credentials", "https://user:pw@store.steampowered.com/eula/1"],
    ["a port", "https://store.steampowered.com:8443/eula/1"],
    ["a path outside /eula/", `${STORE}/`],
    ["a path outside /eula/", `${STORE}/app/1/`],
    ["a path outside /eula/", `${STORE}/eula`],
    ["a path outside /eula/", `${STORE}/eulas/1`],
    ["a path outside /eula/", `${STORE}/EULA/1`],
    ["a path outside /eula/", `${STORE}//app/1//eula/1`],
    ["dot segments out of /eula/", `${STORE}/eula/../app/1`],
    ["dot segments out of /eula/", `${STORE}/eula/%2e%2e/app/1`],
    ["dot segments out of /eula/", `${STORE}/%65ula/1/..`],
    ["no absolute URL", ""],
    ["no absolute URL", " "],
    ["no absolute URL", "/eula/1"],
    ["no absolute URL", "//store.steampowered.com/eula/1"],
    ["no absolute URL", "eula/1"],
    ["no absolute URL", "null"],
  ])("drops a link with %s: %j", (_reason, raw) => {
    expect(eulaLink(raw)).toBeUndefined();
  });
});

describe("EULA_KIND.fromGetItems", () => {
  it("is disclosed with every entry, in order, as for Elden Ring", () => {
    const [first, second] = [make.text.name(), make.text.name()];
    const verdict = fromEula([
      { name: first, url: `${STORE}//eula/1245620_eula_0` },
      { name: second, url: `${STORE}//eula/1245620_eula_1` },
    ]);
    expect(verdict).toStrictEqual(
      {
        ...make.verdict.bare("eula"),
        items: [
          { name: first, url: `${STORE}/eula/1245620_eula_0` },
          { name: second, url: `${STORE}/eula/1245620_eula_1` },
        ],
      },
    );
  });

  it("keeps the name and drops the link of an entry without an EULA link", () => {
    const names = [make.text.name(), make.text.name(), make.text.name(), make.text.name()];
    const [noLink, otherHost, script, empty] = names;
    const good = make.text.name();
    const verdict = fromEula([
      { name: noLink },
      { name: otherHost, url: "https://example.com//eula/1" },
      { name: script, url: "javascript:alert(1)" },
      { name: empty, url: "" },
      { name: good, url: `${STORE}//eula/9_eula_0` },
    ]);
    expect(verdict).toStrictEqual(
      {
        ...make.verdict.bare("eula"),
        items: [
          ...names.map((name) => ({ name })),
          { name: good, url: `${STORE}/eula/9_eula_0` },
        ],
      },
    );
  });

  it("keeps the name verbatim, markup and spacing included", () => {
    const name = ` ${make.text.markup()}\n`;
    const verdict = fromEula([{ name, url: `${STORE}/eula/1` }]);
    expect(verdict).toMatchObject({ items: [{ name }] });
  });

  it("drops the entries with a blank name and keeps the others in order", () => {
    const [first, second] = [make.text.name(), make.text.name()];
    const verdict = fromEula([
      { name: "", url: `${STORE}/eula/1` },
      { name: first },
      { name: " \n" },
      { name: second, url: `${STORE}/eula/2` },
    ]);
    expect(verdict).toStrictEqual(
      {
        ...make.verdict.bare("eula"),
        items: [{ name: first }, { name: second, url: `${STORE}/eula/2` }],
      },
    );
  });

  it("allows 50 entries and is unknown malformed at 51", () => {
    const name = make.text.name();
    const entries = (count: number) => Array.from({ length: count }, () => ({ name }));
    expect(fromEula(entries(50))).toMatchObject({ state: "disclosed" });
    expect(fromEula(entries(51))).toBe(make.verdict.unknown("malformed"));
  });

  it("allows a name of 4,000 characters and is unknown malformed at 4,001", () => {
    expect(fromEula([{ name: "x".repeat(4000) }]).state).toBe("disclosed");
    expect(fromEula([{ name: "x".repeat(4001) }])).toBe(make.verdict.unknown("malformed"));
  });

  it.each<readonly [string, Readonly<Record<string, unknown>>]>([
    ["no field", {}],
    ["no entries", { eula: [] }],
    [
      "only entries with a blank name",
      { eula: [{ name: "" }, { name: "  ", url: `${STORE}/eula/1` }] },
    ],
  ])("is not disclosed for %s", (_name, details) => {
    expect(verdictOf(EULA_KIND, details)).toStrictEqual(make.verdict.notDisclosed());
  });

  it.each<readonly [string, unknown]>([
    ["text", "none"],
    ["an object", {}],
    ["a list of numbers", [3]],
    ["an entry without a name", [{ url: "https://x" }]],
    ["an entry whose name is a number", [{ name: 4 }]],
  ])("is unknown malformed for a field that is %s", (_name, eula) => {
    expect(fromEula(eula)).toBe(make.verdict.unknown("malformed"));
  });

  it("ignores malformed fields of other kinds", () => {
    const others = { drm_third_party_type: 4, anticheat: "x" };
    const eula = [{ name: make.text.name(), url: `${STORE}/eula/1` }];
    expect(verdictOf(EULA_KIND, { ...others, eula }).state).toBe("disclosed");
  });
});
