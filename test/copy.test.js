// Ported from cryppit/shield-receipt test/copy.test.ts (MIT, Cryppit); unchanged apart from removed types.
// The words each verdict gets. They say what the chain shows and no more.
import { describe, expect, it } from "./expect.js";

import { describe as words, formatZec } from "../src/copy.js";
                                               

const transparent = (couldShield) => ({ kind: "transparent", output: { n: 3, valueZat: 125045000 }, couldShield });
const ironwood = (amountZat, from = amountZat === null ? null : "transparent") => ({ kind: "shielded", parts: [{ pool: "ironwood", amountZat, from }] });
const all = [
  transparent(true), transparent(false), ironwood(16826521), ironwood(null),
  { kind: "shielded", parts: [{ pool: "sapling", amountZat: 1, from: "transparent" }, { pool: "ironwood", amountZat: null, from: null }] },
  { kind: "shielded", parts: [{ pool: "unknown", amountZat: null, from: null }] },
  ironwood(16826521, "orchard"), { kind: "unclear", pools: ["orchard"] }, { kind: "transparent-only", outputs: 4 },
  { kind: "not-paid", reason: "no-match" }, { kind: "not-paid", reason: "pool-mismatch" }, { kind: "not-paid", reason: "transparent-address" },
  { kind: "unsupported", reason: "sprout" }, { kind: "unsupported", reason: "coinbase" }, { kind: "mempool" },
];

describe("formatZec", () => {
  it("writes zatoshis as ZEC with trailing zeros dropped", () => {
    expect(formatZec(16826521)).toBe("0.16826521");
    expect(formatZec(125045000)).toBe("1.25045");
    expect(formatZec(100000000)).toBe("1");
  });
});

describe("describe", () => {
  it("titles a transparent payment, naming the exchange when given", () => {
    expect(words(transparent(false), { addressGiven: true }).title).toBe("Paid to your transparent address");
    expect(words(transparent(false), { addressGiven: true, exchange: "Binance" }).title).toBe("Binance paid your transparent address");
  });

  it("says a unified address could have taken shielded ZEC", () => {
    expect(words(transparent(true), { addressGiven: true }).lines).toContain("Your address could take shielded ZEC, but this payment used its transparent part.");
    expect(words(transparent(false), { addressGiven: true }).lines.join(" ")).not.toContain("could take shielded");
  });

  it("titles an Ironwood landing and says why the amount is visible", () => {
    const w = words(ironwood(16826521), { addressGiven: true });
    expect(w.title).toBe("Landed shielded, in the Ironwood pool");
    expect(w.lines).toContain("0.16826521 ZEC net went into the Ironwood pool in this transaction. The amount is visible because it came from a transparent address.");
  });

  it("says when the amount isn't visible", () => {
    expect(words(ironwood(null), { addressGiven: true }).lines.join(" ")).toContain("The amount isn't visible because it was sent from a shielded wallet.");
  });

  it("names every pool of a payment into two pools, and an unknown one plainly", () => {
    expect(words(all[4], { addressGiven: true }).title).toBe("Landed shielded, in the Sapling and Ironwood pools");
    expect(words(all[5], { addressGiven: true }).title).toBe("Landed shielded, in a pool this page doesn't know yet");
  });

  it("says value that moved between pools came from the other pool", () => {
    const text = words(ironwood(16826521, "orchard"), { addressGiven: true }).lines.join(" ");
    expect(text).toContain("0.16826521 ZEC net moved into the Ironwood pool from the Orchard pool in this transaction.");
    expect(text).not.toContain("transparent address");
  });

  it("says when the chain can't tell, and why", () => {
    const w = words({ kind: "unclear", pools: ["orchard"] }, { addressGiven: true });
    expect(w.title).toBe("The chain can't tell");
    expect(w.lines.join(" ")).toContain("may also have made shielded outputs");
  });

  it("words every verdict the share view can get without 'not paid to this address'", () => {
    for (const v of all.filter((x) => x.kind !== "not-paid")) expect(words(v, { addressGiven: false }).title).not.toBe("Not paid to this address");
  });

  it("words a t1 address against a shielded transaction truthfully", () => {
    const text = words({ kind: "not-paid", reason: "transparent-address" }, { addressGiven: true }).lines.join(" ");
    expect(text).toContain("a transparent address can't receive shielded ZEC");
    expect(text).not.toContain("moved no shielded value");
  });

  it("never says more than the chain shows", () => {
    for (const v of all) {
      for (const ctx of [{ addressGiven: true }, { addressGiven: false }, { addressGiven: true, exchange: "Kraken" }]) {
        const text = (({ title, lines }) => [title, ...lines].join(" ").toLowerCase())(words(v, ctx));
        expect(text, JSON.stringify(v)).not.toMatch(/hidden|private|to you\b/);
      }
    }
  });
});

describe("after NU7", () => {
  it("says a Zcash block takes about 25 seconds (NU7, 6 Nov 2026), not 75", () => {
    const text = words({ kind: "mempool" }, { addressGiven: false }).lines.join(" ");
    expect(/about 25 seconds/.test(text)).toBe(true);
    expect(/75 seconds/.test(text)).toBe(false);
  });
});
