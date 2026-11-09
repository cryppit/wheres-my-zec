// The case file: where the ZEC is, how we know, who acts next, and a message to send them. Built from the facts the
// other modules gathered; nothing here touches the network.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { caseForTx, caseForAddress, addressType } from "../src/case.js";
import { readBlockchairTx } from "../src/tx.js";
import { readAddress } from "../src/address.js";
import { thorchainOutcome } from "../src/routes/thorchain.js";
import { fixture } from "./fixtures.js";

const TXID = "2746a4c744a2ac34e7b9d72eadc174b4e1a8ee44aad3f46fe8947d86e202a360";
const NOW = "2026-11-09";
const midgard = (name) => JSON.parse(readFileSync(new URL(`./fixtures/thorchain/${name}.json`, import.meta.url), "utf8"));
const txOf = (name) => {
  const f = fixture(name);
  return readBlockchairTx(f.raw, f.dashboard, f.txid);
};
const EVIDENCE = new Set(["Proven", "Reported", "Inferred", "Not visible", "Unknown"]);
const wellFormed = (c) => {
  assert.ok(c.title && typeof c.title === "string");
  assert.ok(EVIDENCE.has(c.evidence), `bad evidence word ${c.evidence}`);
  assert.ok(c.next && typeof c.next.party === "string" && typeof c.next.text === "string");
  assert.ok(Array.isArray(c.lines) && c.lines.every((l) => typeof l === "string"));
  assert.doesNotMatch(c.message, /seed|private key|viewing key/i);
};

test("a busy explorer is Unknown and asks to try again; nothing is decided", () => {
  const c = caseForTx({ txid: TXID, tx: { busy: true }, now: NOW });
  wellFormed(c);
  assert.equal(c.evidence, "Unknown");
  assert.equal(c.next.party, "you");
  assert.match(c.next.text, /try again/i);
});

test("an ID Zcash doesn't know points to the other chains' checker, not to 'lost'", () => {
  const c = caseForTx({ txid: TXID, tx: { notFound: true }, now: NOW });
  wellFormed(c);
  assert.match(c.title, /no zcash transaction/i);
  assert.ok(c.links.some((l) => l.url.startsWith("https://cryppit.github.io/intent-sentinel/")));
  assert.doesNotMatch(c.lines.join(" "), /lost/i);
});

test("an unconfirmed transaction says to wait about 25 seconds a block", () => {
  const tx = { ...txOf("ironwood-from-transparent"), height: null, time: null };
  const c = caseForTx({ txid: tx.txid, tx, now: NOW });
  wellFormed(c);
  assert.match(c.title, /not confirmed/i);
  assert.equal(c.next.party, "nobody");
  assert.match(c.lines.join(" "), /25 seconds/);
});

test("a plain landing is Proven by the chain, and offers the bridge-and-swap check", () => {
  const tx = txOf("ironwood-from-transparent");
  const c = caseForTx({ txid: tx.txid, tx, now: NOW });
  wellFormed(c);
  assert.equal(c.evidence, "Proven");
  assert.equal(c.canCheckRoutes, true);
  assert.equal(c.next.party, "nobody");
  assert.match(c.next.text, /wallet/i);
});

test("a finished THORChain swap names the payout, as THORChain reports it", () => {
  const tx = txOf("transparent-batch");
  const c = caseForTx({ txid: TXID, tx, thorchain: thorchainOutcome(midgard("swap-success"), TXID), now: NOW });
  wellFormed(c);
  assert.equal(c.evidence, "Reported");
  assert.equal(c.next.party, "nobody");
  assert.match(c.title, /THORChain/);
  assert.match(c.lines.join(" "), /0xd0e5999e156957f37E2A676D78248900beF708Ae/);
  assert.equal(c.route, "thorchain");
  assert.equal(c.payoutAsset, "BSC.USDT-0X55D398326F99059FF775485246999027B3197955");
  assert.equal(c.canCheckRoutes, false);
});

test("a THORChain refund says why and where the ZEC went back", () => {
  const id = "22aa3a8b56bc7dc2aa6a6a2f1da72331db6e4109b2bd7af224a094e3f451c73a";
  const c = caseForTx({ txid: id, tx: txOf("transparent-batch"), thorchain: thorchainOutcome(midgard("refund-full"), id), now: NOW });
  wellFormed(c);
  assert.match(c.title, /sent .*back/i);
  const text = c.lines.join(" ");
  assert.match(text, /price/i);
  assert.match(text, /t1f2zP1sPiE39kdomdfawXhssTPu8gK3Pv4/);
  assert.match(text, /1\.52909074 ZEC/);
});

test("a deposit too small to refund is said plainly, with nobody to chase", () => {
  const id = "2fcd6ba43026158ccaf8750b4400d2d83a008d9ba505e1777a13d2e5dac4d32c";
  const c = caseForTx({ txid: id, tx: txOf("transparent-batch"), thorchain: thorchainOutcome(midgard("refund-failed"), id), now: NOW });
  wellFormed(c);
  assert.equal(c.next.party, "nobody");
  assert.match(c.lines.join(" "), /too small/i);
});

test("THORChain with no record yet: Unknown, THORChain is next, and Maya's halt is mentioned", () => {
  const c = caseForTx({ txid: TXID, tx: txOf("transparent-batch"), thorchain: thorchainOutcome(midgard("not-seen"), TXID), now: NOW });
  wellFormed(c);
  assert.equal(c.evidence, "Unknown");
  assert.equal(c.next.party, "thorchain");
  assert.match(c.lines.join(" "), /Maya/);
});

test("an Omni bridge deposit names the NEAR account and links to the Refund Helper", () => {
  const omni = {
    route: "omni", state: "deposit", evidence: "Reported", nextParty: "see-refund-helper",
    deposits: [{ vout: 0, address: "t1RTEogVdgA8cWY8zm1uomj5ThPZnbp8BB4", forAccount: "f3de655c605a4ca01e000e7961a969687678efaf3bd6c6dff13cea3cb50ab807", via: "intents.near", refundHelper: `https://cryppit.github.io/zec-refund-helper/#q=${TXID}:0` }],
  };
  const c = caseForTx({ txid: TXID, tx: txOf("transparent-batch"), omni, now: NOW });
  wellFormed(c);
  assert.match(c.title, /Omni bridge/);
  assert.equal(c.route, "omni");
  assert.ok(c.links.some((l) => l.url === `https://cryppit.github.io/zec-refund-helper/#q=${TXID}:0`));
  assert.match(c.lines.join(" "), /f3de655c/);
});

test("the support message carries the txid, what the chain shows and the date, and nothing private", () => {
  const tx = txOf("ironwood-from-transparent");
  const c = caseForTx({ txid: tx.txid, tx, now: NOW });
  assert.match(c.message, new RegExp(tx.txid));
  assert.ok(c.message.includes(c.title));
  assert.match(c.message, /2026-11-09/);
});

const acceptance = [
  { service: "Binance", kind: "exchange", sendsTo: { transparent: "yes", tex: "yes", sapling: "no", unified: "no", unifiedShieldedOnly: "no" } },
  { service: "Zodl", kind: "wallet", sendsTo: { transparent: "yes", tex: "yes", sapling: "yes", unified: "yes", unifiedShieldedOnly: "yes" } },
  { service: "Kraken", kind: "exchange", sendsTo: { transparent: "yes", tex: "unknown", sapling: "no", unified: "unknown", unifiedShieldedOnly: "no" } },
];

test("address types map onto the acceptance table's columns", () => {
  assert.equal(addressType(readAddress("t1VmmGiyjVNeCjxDZzg7vZmd99WyzVby9yC")), "transparent");
  assert.equal(addressType(readAddress("tex1s2rt77ggv6q989lr49rkgzmh5slsksa9khdgte")), "tex");
  assert.equal(addressType(readAddress("zs1mrhc9y7jdh5r9ece8u5khgvj9kg0zgkxzdduyv0whkg7lkcrkx5xqem3e48avjq9wn2rukydkwn")), "sapling");
});

test("an address answer says what it is, who can pay it and who can't, with unknowns named", () => {
  const zs = "zs1mrhc9y7jdh5r9ece8u5khgvj9kg0zgkxzdduyv0whkg7lkcrkx5xqem3e48avjq9wn2rukydkwn";
  const c = caseForAddress({ address: readAddress(zs), acceptance, now: NOW });
  wellFormed(c);
  assert.match(c.title, /Sapling/);
  assert.deepEqual(c.services, { can: ["Zodl"], cant: ["Binance", "Kraken"], unknown: [] });
  assert.doesNotMatch(c.lines.join(" "), /Can pay it/);
  assert.equal(c.route, "zcash");
  assert.equal(c.next.party, "you");
});

test("an address with a typo is refused before anything else", () => {
  const bad = "t1VmmGiyjVNeCjxDZzg7vZmd99WyzVby9yD";
  const c = caseForAddress({ address: readAddress(bad), acceptance, now: NOW });
  wellFormed(c);
  assert.match(c.title, /don't send/i);
});

test("an address message asks about the address, not about finding ZEC", () => {
  const c = caseForAddress({ address: readAddress("tex1s2rt77ggv6q989lr49rkgzmh5slsksa9khdgte"), acceptance, now: NOW });
  assert.match(c.message, /^Hello, I have a question about a Zcash address\./);
  assert.doesNotMatch(c.message, /find my ZEC/);
});

const synthetic = (over) => ({
  txid: "a".repeat(64), height: 1, time: "2026-11-09T00:00:00Z", unknownBundles: [], sprout: false, coinbase: false,
  outputs: [{ n: 0, scriptHex: `76a914${"00".repeat(20)}88ac`, valueZat: 5, address: "t1VmmGiyjVNeCjxDZzg7vZmd99WyzVby9yC" }], pools: [], ...over,
});

test("an ID the explorer doesn't know stays out of the message, with a warning in case it was a key", () => {
  const c = caseForTx({ txid: TXID, tx: { notFound: true }, now: NOW });
  assert.doesNotMatch(c.message, new RegExp(TXID));
  assert.match(c.lines.join(" "), /private key/i);
});

test("evidence words are honest: 'the chain can't tell' is Not visible, Sprout is Unknown, unconfirmed is Reported", () => {
  assert.equal(caseForTx({ txid: "a".repeat(64), tx: synthetic({ pools: [{ pool: "orchard", actions: 2, valueBalanceZat: 1000, outputsEnabled: true }] }), now: NOW }).evidence, "Not visible");
  assert.equal(caseForTx({ txid: "a".repeat(64), tx: synthetic({ sprout: true }), now: NOW }).evidence, "Unknown");
  assert.equal(caseForTx({ txid: "a".repeat(64), tx: synthetic({ height: null, time: null }), now: NOW }).evidence, "Reported");
  assert.equal(caseForTx({ txid: "a".repeat(64), tx: synthetic({}), now: NOW }).evidence, "Proven");
});

test("no answer asks for an address field the page doesn't have", () => {
  for (const tx of [synthetic({}), synthetic({ pools: [{ pool: "orchard", actions: 2, valueBalanceZat: 1000, outputsEnabled: true }] })]) {
    const c = caseForTx({ txid: tx.txid, tx, now: NOW });
    assert.doesNotMatch(c.lines.join(" ") + c.message, /Add the address/i);
  }
});

test("missing THORChain payout or refund records don't crash, and say they aren't recorded yet", () => {
  const done = caseForTx({ txid: TXID, tx: synthetic({}), thorchain: { route: "thorchain", state: "done", evidence: "Reported", nextParty: "nobody", payout: null }, now: NOW });
  assert.match(done.lines.join(" "), /doesn't show the payout yet/i);
  const back = caseForTx({ txid: TXID, tx: synthetic({}), thorchain: { route: "thorchain", state: "refunded", evidence: "Reported", nextParty: "nobody", reason: "x", refund: null }, now: NOW });
  assert.match(back.lines.join(" "), /doesn't show the refund transaction yet/i);
});

test("a busy Omni check can be tried again; a cut-short one says how far it got", () => {
  assert.equal(caseForTx({ txid: TXID, tx: synthetic({}), omni: { route: "omni", state: "busy", evidence: "Unknown" }, now: NOW }).canCheckRoutes, true);
  const c = caseForTx({ txid: TXID, tx: synthetic({}), omni: { route: "omni", state: "none", evidence: "Reported", checked: 50, total: 60 }, now: NOW });
  assert.match(c.lines.join(" "), /first 50 of its 60/);
  assert.equal(c.canCheckRoutes, false);
});

test("a t3 address warns that some services take only t1 addresses", () => {
  const c = caseForAddress({ address: readAddress("t3XAVsEWuV7Pt15MYwNY5qAFTH7sQkk3T5j"), acceptance, now: NOW });
  assert.match(c.lines.join(" "), /t1/);
});

const omniDeposit = (window) => ({
  route: "omni", state: "deposit", evidence: "Reported", nextParty: "see-refund-helper",
  deposits: [{ vout: 0, address: "t1RTEogVdgA8cWY8zm1uomj5ThPZnbp8BB4", forAccount: "x.near", via: "intents.near", refundHelper: "https://cryppit.github.io/zec-refund-helper/#q=a:0" }],
  ...(window ? { refund: window } : {}),
});

test("an Omni deposit shows the refund deadline read from NEAR's Zcash light client", () => {
  const c = caseForTx({ txid: TXID, tx: synthetic({}), omni: omniDeposit({ open: true, blocksLeft: 93_978, secondsLeft: 93_978 * 25 }), now: NOW });
  const text = c.lines.join(" ");
  assert.match(text, /NEAR's Zcash light client/);
  assert.match(text, /about 27 days/);
  assert.match(text, /2026-12-06|2026-12-07/);
});

test("a closed window says a self-serve refund would fail and only the bridge team can return it", () => {
  const c = caseForTx({ txid: TXID, tx: synthetic({}), omni: omniDeposit({ open: false, blocksLeft: 0, secondsLeft: 0 }), now: NOW });
  assert.match(c.lines.join(" "), /no longer holds this deposit's block/);
  assert.match(c.next.text, /bridge team/i);
});

test("if NEAR couldn't be read, the deposit is still shown, with the deadline as unknown", () => {
  const c = caseForTx({ txid: TXID, tx: synthetic({}), omni: omniDeposit({ busy: true }), now: NOW });
  assert.match(c.lines.join(" "), /couldn't read the refund deadline/i);
});

// Where's My ZEC can't see whether the bridge credited a deposit (the Refund Helper does), and nearly every deposit is
// credited. So the deadline is only ever stated for a deposit the bridge never credited, never as a plain countdown,
// and a deposit below the bridge's minimum is named as kept with no refund (found 9 Nov 2026: 54 such deposits).
test("the refund deadline is conditional on the bridge never having credited the deposit", () => {
  const c = caseForTx({ txid: TXID, tx: synthetic({}), omni: omniDeposit({ open: true, blocksLeft: 93_978, secondsLeft: 93_978 * 25 }), now: NOW });
  const first = c.lines[0];
  assert.match(first, /never credited/i);
  assert.match(first, /most deposits are credited/i);
  assert.match(c.lines.join(" "), /below the bridge's minimum/i);
  assert.doesNotMatch(first, /^NEAR's Zcash light client still holds/);
});

test("a closed window is also conditional on the bridge never having credited it", () => {
  const c = caseForTx({ txid: TXID, tx: synthetic({}), omni: omniDeposit({ open: false, blocksLeft: 0, secondsLeft: 0 }), now: NOW });
  assert.match(c.lines[0], /never credited/i);
});
