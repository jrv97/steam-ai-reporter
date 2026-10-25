import { describe, expect, it } from "vitest";
import { verdictOf } from "../../../tests/helpers/getitems";
import { UNKNOWN } from "../types";
import { EULA_KIND, eulaLink } from "./eula";

function fromEula(eula: unknown) {
  return verdictOf(EULA_KIND, { eula });
}

describe("eulaLink", () => {
  it("collapses the doubled slash Steam serves", () => {
    expect(eulaLink("https://store.steampowered.com//eula/3751950_eula_0")).toBe(
      "https://store.steampowered.com/eula/3751950_eula_0",
    );
    expect(eulaLink("https://store.steampowered.com///eula/1_eula_0")).toBe(
      "https://store.steampowered.com/eula/1_eula_0",
    );
  });

  it("keeps a clean link, and the query and fragment", () => {
    expect(eulaLink("https://store.steampowered.com/eula/1_eula_0")).toBe(
      "https://store.steampowered.com/eula/1_eula_0",
    );
    expect(eulaLink("https://store.steampowered.com//eula/1_eula_0?l=english#top")).toBe(
      "https://store.steampowered.com/eula/1_eula_0?l=english#top",
    );
  });

  it("writes the scheme and host in lower case", () => {
    expect(eulaLink("HTTPS://STORE.STEAMPOWERED.COM//eula/1")).toBe(
      "https://store.steampowered.com/eula/1",
    );
  });

  it("drops a link on another scheme", () => {
    const schemes = [
      "http://store.steampowered.com//eula/1_eula_0",
      "javascript:alert(1)",
      "javascript://store.steampowered.com/eula/1%0Aalert(1)",
      "data:text/html,<script>alert(1)</script>",
      "ftp://store.steampowered.com/eula/1",
      "blob:https://store.steampowered.com/eula/1",
    ];
    for (const raw of schemes) {
      expect(eulaLink(raw)).toBeUndefined();
    }
  });

  it("drops a link on another host, however the host is dressed", () => {
    const hosts = [
      "https://example.com//eula/1_eula_0",
      "https://steampowered.com/eula/1",
      "https://help.steampowered.com/eula/1",
      "https://store.steampowered.com.example.com/eula/1",
      "https://example.com/store.steampowered.com/eula/1",
      "https://example.com/?next=https://store.steampowered.com/eula/1",
      "https://store.steampowered.com@example.com/eula/1",
      "https://store.steampowered.com:pw@example.com/eula/1",
      "https://store.steampowered.com./eula/1",
      "https://store.steampowered.com\\@example.com/eula/1",
      "https://STORE.STEAMPOWERED.COM.example.com/eula/1",
    ];
    for (const raw of hosts) {
      expect(eulaLink(raw)).toBeUndefined();
    }
  });

  it("drops a link with credentials or a port", () => {
    expect(eulaLink("https://user@store.steampowered.com/eula/1")).toBeUndefined();
    expect(eulaLink("https://user:pw@store.steampowered.com/eula/1")).toBeUndefined();
    expect(eulaLink("https://store.steampowered.com:8443/eula/1")).toBeUndefined();
    expect(eulaLink("https://store.steampowered.com:443/eula/1")).toBe(
      "https://store.steampowered.com/eula/1",
    );
  });

  it("drops a link outside /eula/, also when dot segments lead out of it", () => {
    const paths = [
      "https://store.steampowered.com/",
      "https://store.steampowered.com/app/1/",
      "https://store.steampowered.com/eula",
      "https://store.steampowered.com/eulas/1",
      "https://store.steampowered.com/EULA/1",
      "https://store.steampowered.com//app/1//eula/1",
      "https://store.steampowered.com/eula/../app/1",
      "https://store.steampowered.com/eula/%2e%2e/app/1",
      "https://store.steampowered.com/%65ula/1/..",
    ];
    for (const raw of paths) {
      expect(eulaLink(raw)).toBeUndefined();
    }
  });

  it("drops what is not an absolute URL", () => {
    for (const raw of ["", " ", "/eula/1", "//store.steampowered.com/eula/1", "eula/1", "null"]) {
      expect(eulaLink(raw)).toBeUndefined();
    }
  });
});

describe("EULA_KIND.fromGetItems", () => {
  it("is disclosed with every entry, in order, as for Elden Ring", () => {
    const verdict = fromEula([
      { name: "ELDEN RING EULA", url: "https://store.steampowered.com//eula/1245620_eula_0" },
      { name: "ELDEN RING EULA (JP)", url: "https://store.steampowered.com//eula/1245620_eula_1" },
    ]);
    expect(verdict).toStrictEqual({
      state: "disclosed",
      kind: "eula",
      source: "api",
      items: [
        { name: "ELDEN RING EULA", url: "https://store.steampowered.com/eula/1245620_eula_0" },
        { name: "ELDEN RING EULA (JP)", url: "https://store.steampowered.com/eula/1245620_eula_1" },
      ],
    });
  });

  it("keeps the name and drops the link of an entry whose URL is not an EULA link", () => {
    const verdict = fromEula([
      { name: "Terms", url: "https://example.com//eula/1" },
      { name: "More terms", url: "javascript:alert(1)" },
      { name: "Other", url: "" },
      { name: "Good", url: "https://store.steampowered.com//eula/9_eula_0" },
    ]);
    expect(verdict).toStrictEqual({
      state: "disclosed",
      kind: "eula",
      source: "api",
      items: [
        { name: "Terms" },
        { name: "More terms" },
        { name: "Other" },
        { name: "Good", url: "https://store.steampowered.com/eula/9_eula_0" },
      ],
    });
  });

  it("keeps the name verbatim, markup and spacing included", () => {
    const name = " <img src=x onerror=alert(1)> EULA\n";
    const verdict = fromEula([{ name, url: "https://store.steampowered.com/eula/1" }]);
    expect(verdict).toMatchObject({ items: [{ name }] });
  });

  it("keeps the kind disclosed for an entry that has a name and no link", () => {
    expect(fromEula([{ name: "Game terms" }])).toStrictEqual({
      state: "disclosed",
      kind: "eula",
      source: "api",
      items: [{ name: "Game terms" }],
    });
  });

  it("drops the entries with a blank name and keeps the others in order", () => {
    const verdict = fromEula([
      { name: "", url: "https://store.steampowered.com/eula/1" },
      { name: "First" },
      { name: " \n" },
      { name: "Second", url: "https://store.steampowered.com/eula/2" },
    ]);
    expect(verdict).toMatchObject({
      state: "disclosed",
      items: [{ name: "First" }, { name: "Second", url: "https://store.steampowered.com/eula/2" }],
    });
  });

  it("is not disclosed when every entry has a blank name", () => {
    const none = { state: "not-disclosed", source: "api" };
    expect(fromEula([{ name: "" }, { name: "  ", url: "https://store.steampowered.com/eula/1" }]))
      .toStrictEqual(none);
  });

  it("allows 50 entries and is unknown malformed at 51", () => {
    const entries = (count: number) => Array.from({ length: count }, () => ({ name: "Agreement" }));
    expect(fromEula(entries(50))).toMatchObject({ state: "disclosed" });
    expect(fromEula(entries(51))).toBe(UNKNOWN.malformed);
  });

  it("allows a name of 4,000 characters and is unknown malformed at 4,001", () => {
    expect(fromEula([{ name: "x".repeat(4000) }]).state).toBe("disclosed");
    expect(fromEula([{ name: "x".repeat(4001) }])).toBe(UNKNOWN.malformed);
  });

  it("is not disclosed without entries", () => {
    expect(verdictOf(EULA_KIND, {})).toStrictEqual({ state: "not-disclosed", source: "api" });
    expect(fromEula([])).toStrictEqual({ state: "not-disclosed", source: "api" });
  });

  it("is unknown malformed when the field is malformed, and only then", () => {
    for (const eula of ["none", {}, [3], [{ url: "https://x" }], [{ name: 4 }]]) {
      expect(fromEula(eula)).toBe(UNKNOWN.malformed);
    }
    const others = { drm_third_party_type: 4, anticheat: "x" };
    const eula = [{ name: "Game terms", url: "https://store.steampowered.com/eula/1" }];
    expect(verdictOf(EULA_KIND, { ...others, eula }).state).toBe("disclosed");
  });
});
