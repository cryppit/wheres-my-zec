// The answer drawn as a route (stops with a logo, a state and how we know) and a "who moves next" bar, like Intent
// Sentinel's. Built from the same case facts; nothing here touches the network.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { caseForTx } from "../src/case.js";
import { thorchainOutcome } from "../src/routes/thorchain.js";
import { shorten } from "../src/journey.js";

const NOW = "2026-11-09";
const TXID = "2746a4c744a2ac34e7b9d72eadc174b4e1a8ee44aad3f46fe8947d86e202a360";
const midgard = (n) => JSON.parse(readFileSync(new URL(`./fixtures/thorchain/${n}.json`, import.meta.url), "utf8"));
const tx = (over = {}) => ({ txid: TXID, height: 1, time: "2026-11-09T00:00:00Z", unknownBundles: [], sprout: false, coinbase: false, outputs: [], pools: [], ...over });
const STATES = new Set(["passed", "here", "ahead", "failed"]);
const CLS = new Set(["proven", "reported", "inferred", "not_visible", "unknown"]);
const shape = (c) => {
  for (const s of c.stops) {
    assert.ok(s.name && STATES.has(s.state) && CLS.has(s.cls), JSON.stringify(s));
    assert.match(s.logo, /^logos\/.+\.(svg|png)$/);
  }
  assert.equal(c.parties.filter((p) => p.lit).length, 1, "exactly one party is lit");
};

test("a shielded landing is two proven stops, and nobody needs to act", () => {
  const c = caseForTx({ txid: TXID, tx: tx({ pools: [{ pool: "ironwood", actions: 2, valueBalanceZat: -100, outputsEnabled: true }], outputs: [{ n: 0, scriptHex: "76a914" + "00".repeat(20) + "88ac", valueZat: 5, address: "t1x" }] }), now: NOW });
  shape(c);
  assert.deepEqual(c.stops.map((s) => [s.name, s.state, s.cls]), [["Sent", "passed", "proven"], ["Ironwood pool", "passed", "proven"]]);
  assert.equal(c.parties.find((p) => p.lit).key, "nobody");
});

test("an unconfirmed send waits at the network, with the block still ahead", () => {
  const c = caseForTx({ txid: TXID, tx: tx({ height: null, time: null }), now: NOW });
  shape(c);
  assert.deepEqual(c.stops.map((s) => s.state), ["here", "ahead"]);
});

test("a finished THORChain swap runs deposit → THORChain → payout chain, with the payout chain's logo", () => {
  const c = caseForTx({ txid: TXID, tx: tx(), thorchain: thorchainOutcome(midgard("swap-success"), TXID), now: NOW });
  shape(c);
  assert.deepEqual(c.stops.map((s) => s.name), ["Your ZEC", "THORChain", "BNB Chain"]);
  assert.deepEqual(c.stops.map((s) => s.state), ["passed", "passed", "passed"]);
  assert.equal(c.stops[2].logo, "logos/binance-smart-chain.svg");
  assert.deepEqual(c.stops.map((s) => s.cls), ["proven", "reported", "reported"]);
});

test("a swap THORChain hasn't recorded stops at THORChain, unknown, and THORChain is lit", () => {
  const c = caseForTx({ txid: TXID, tx: tx(), thorchain: thorchainOutcome(midgard("not-seen"), TXID), now: NOW });
  shape(c);
  assert.deepEqual(c.stops.map((s) => [s.name, s.state, s.cls]), [["Your ZEC", "passed", "proven"], ["THORChain", "here", "unknown"]]);
  assert.equal(c.parties.find((p) => p.lit).key, "thorchain");
});

test("a deposit too small to refund fails at THORChain", () => {
  const id = "2fcd6ba43026158ccaf8750b4400d2d83a008d9ba505e1777a13d2e5dac4d32c";
  const c = caseForTx({ txid: id, tx: tx(), thorchain: thorchainOutcome(midgard("refund-failed"), id), now: NOW });
  shape(c);
  assert.equal(c.stops.at(-1).state, "failed");
});

test("an Omni deposit waits at the bridge before the NEAR account, and the bridge is lit", () => {
  const omni = { route: "omni", state: "deposit", evidence: "Reported", deposits: [{ vout: 0, address: "t1RTEogVdgA8cWY8zm1uomj5ThPZnbp8BB4", forAccount: "x.near", via: "intents.near", refundHelper: "https://cryppit.github.io/zec-refund-helper/#q=a:0" }], refund: { open: true, blocksLeft: 100, secondsLeft: 2500 } };
  const c = caseForTx({ txid: TXID, tx: tx(), omni, now: NOW });
  shape(c);
  assert.deepEqual(c.stops.map((s) => [s.name, s.state]), [["Your ZEC", "passed"], ["Omni bridge", "here"], ["NEAR account", "ahead"]]);
  assert.equal(c.stops[1].logo, "logos/near-protocol.svg");
  assert.equal(c.parties.find((p) => p.lit).key, "omni");
});

test("long addresses and IDs are shortened in the middle for display; short words are left alone", () => {
  assert.equal(shorten("paid t1RTEogVdgA8cWY8zm1uomj5ThPZnbp8BB4 today"), "paid t1RTEogV…bp8BB4 today");
  assert.equal(shorten("tx 2746a4c744a2ac34e7b9d72eadc174b4e1a8ee44aad3f46fe8947d86e202a360."), "tx 2746a4c7…02a360.");
  assert.equal(shorten("THORChain reports the swap finished."), "THORChain reports the swap finished.");
});

test("an Omni answer leads with the refund deadline, the one thing to act on in time", () => {
  const omni = { route: "omni", state: "deposit", evidence: "Reported", deposits: [{ vout: 0, address: "t1RTEogVdgA8cWY8zm1uomj5ThPZnbp8BB4", forAccount: "x.near", via: "intents.near", refundHelper: "https://cryppit.github.io/zec-refund-helper/#q=a:0" }], refund: { open: true, blocksLeft: 100, secondsLeft: 20 * 86_400 } };
  const c = caseForTx({ txid: TXID, tx: tx(), omni, now: NOW });
  assert.match(c.lines[0], /about 20 days left/);
});
