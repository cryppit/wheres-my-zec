// THORChain swaps from ZEC: spotted by the memo the deposit carries, then read from THORChain's own records (Midgard)
// by txid. Fixtures are real Midgard answers recorded on 9 Nov 2026 (gateway.liquify.com).
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { thorchainMemo, thorchainOutcome, fetchThorchain } from "../src/routes/thorchain.js";

const load = (name) => JSON.parse(readFileSync(new URL(`./fixtures/thorchain/${name}.json`, import.meta.url), "utf8"));
const hex = (s) => Buffer.from(s, "utf8").toString("hex");
const opReturn = (memo) => {
  const len = Buffer.byteLength(memo);
  const push = len <= 75 ? len.toString(16).padStart(2, "0") : `4c${len.toString(16).padStart(2, "0")}`;
  return { n: 1, scriptHex: `6a${push}${hex(memo)}`, valueZat: 0, address: null };
};
const pay = { n: 0, scriptHex: "76a914baba02baba02baba02baba02baba02baba02baba88ac", valueZat: 6_500_000, address: "t1KdYwS1PP8GYkPdRWYfY1A9BVnhjqqGGE9" };

const SWAP = "2746a4c744a2ac34e7b9d72eadc174b4e1a8ee44aad3f46fe8947d86e202a360";
const PARTIAL = "fc77d2e6372498ccda456bbb12eb7d74024763d7ef447175ae373aacff614f3c";
const FULL_REFUND = "22aa3a8b56bc7dc2aa6a6a2f1da72331db6e4109b2bd7af224a094e3f451c73a";
const DUST = "2fcd6ba43026158ccaf8750b4400d2d83a008d9ba505e1777a13d2e5dac4d32c";

test("reads a THORChain memo from the deposit's OP_RETURN output", () => {
  const memo = "=:BSC.USDT:0xd0e5999e156957f37E2A676D78248900beF708Ae:0/1/0:g1:50";
  assert.equal(thorchainMemo([pay, opReturn(memo)]), memo);
  assert.equal(thorchainMemo([pay, opReturn("SWAP:ETH.ETH:0xabc")]), "SWAP:ETH.ETH:0xabc");
  assert.equal(thorchainMemo([pay, opReturn("s:BTC.BTC:bc1qxyz")]), "s:BTC.BTC:bc1qxyz");
});

test("no OP_RETURN, or one that isn't a THORChain memo, means no THORChain lookup", () => {
  assert.equal(thorchainMemo([pay]), null);
  assert.equal(thorchainMemo([pay, opReturn("hello world")]), null);
  assert.equal(thorchainMemo([pay, { n: 1, scriptHex: "6a", valueZat: 0, address: null }]), null);
});

test("a finished swap: the payout, its chain and its transaction, as THORChain reports it", () => {
  const o = thorchainOutcome(load("swap-success"), SWAP);
  assert.equal(o.state, "done");
  assert.equal(o.evidence, "Reported");
  assert.equal(o.nextParty, "nobody");
  assert.deepEqual(o.payout, {
    address: "0xd0e5999e156957f37E2A676D78248900beF708Ae",
    asset: "BSC.USDT-0X55D398326F99059FF775485246999027B3197955",
    amount: "8147348419",
    txid: "731BC074C0C5" + o.payout.txid.slice(12),
  });
});

test("a partial fill: part swapped, the rest sent back as ZEC", () => {
  const o = thorchainOutcome(load("refund"), PARTIAL);
  assert.equal(o.state, "partial");
  assert.equal(o.nextParty, "nobody");
  assert.equal(o.refund.address, "t1f2zP1sPiE39kdomdfawXhssTPu8gK3Pv4");
  assert.equal(o.refund.amountZat, 73_763_692);
  assert.ok(o.payout.asset.startsWith("BSC.USDT"));
});

test("a full refund gives the reason in plain words and where the ZEC went back", () => {
  const o = thorchainOutcome(load("refund-full"), FULL_REFUND);
  assert.equal(o.state, "refunded");
  assert.equal(o.nextParty, "nobody");
  assert.equal(o.refund.address, "t1f2zP1sPiE39kdomdfawXhssTPu8gK3Pv4");
  assert.equal(o.refund.amountZat, 152_909_074);
  assert.match(o.reason, /price/i);
});

test("a deposit too small to pay for its own refund is named as lost, not as pending", () => {
  const o = thorchainOutcome(load("refund-failed"), DUST);
  assert.equal(o.state, "too-small");
  assert.equal(o.nextParty, "nobody");
  assert.match(o.reason, /too small/i);
});

test("a transaction THORChain has no record of is Unknown, never 'not a swap'", () => {
  const o = thorchainOutcome(load("not-seen"), SWAP);
  assert.equal(o.state, "not-seen");
  assert.equal(o.evidence, "Unknown");
  assert.equal(o.nextParty, "thorchain");
});

test("a swap still streaming is pending, and THORChain moves next", () => {
  const data = load("swap-success");
  data.actions[0].status = "pending";
  data.actions[0].out = [];
  const o = thorchainOutcome(data, SWAP);
  assert.equal(o.state, "pending");
  assert.equal(o.nextParty, "thorchain");
});

test("fetchThorchain sends only the txid, uppercased, and calls a failure busy", async () => {
  const seen = [];
  const ok = async (url) => {
    seen.push(url);
    return new Response(JSON.stringify(load("swap-success")), { status: 200 });
  };
  const o = await fetchThorchain(SWAP, ok);
  assert.equal(o.state, "done");
  assert.equal(seen.length, 1);
  assert.match(seen[0], /\/v2\/actions\?txid=2746A4C744A2AC34E7B9D72EADC174B4E1A8EE44AAD3F46FE8947D86E202A360$/);
  for (const bad of [async () => new Response("", { status: 503 }), async () => { throw new Error("offline"); }]) {
    assert.deepEqual(await fetchThorchain(SWAP, bad), { state: "busy", evidence: "Unknown" });
  }
});
