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
  const text = c.lines.join(" ");
  assert.match(text, /Can pay it: Zodl/);
  assert.match(text, /Can't: Binance, Kraken/);
  assert.equal(c.next.party, "you");
});

test("an address with a typo is refused before anything else", () => {
  const bad = "t1VmmGiyjVNeCjxDZzg7vZmd99WyzVby9yD";
  const c = caseForAddress({ address: readAddress(bad), acceptance, now: NOW });
  wellFormed(c);
  assert.match(c.title, /don't send/i);
});
