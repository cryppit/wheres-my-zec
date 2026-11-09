// THORChain swaps from ZEC: spotted by the memo the deposit carries, then read from THORChain's own records (Midgard)
// by txid. Fixtures are real Midgard answers recorded on 9 Nov 2026 (gateway.liquify.com).
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { thorchainMemo, thorchainOutcome, fetchThorchain, confirmWithThornode } from "../src/routes/thorchain.js";

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

test("limit swaps and their changes carry THORChain memos too", () => {
  assert.equal(thorchainMemo([pay, opReturn("=<:ETH.ETH:0xabc:1e8/1/0")]), "=<:ETH.ETH:0xabc:1e8/1/0");
  assert.equal(thorchainMemo([pay, opReturn("m=<:1ZEC:ETH.ETH:1e8")]), "m=<:1ZEC:ETH.ETH:1e8");
});

const action = (type, status, out, reason) => ({
  type, status, in: [{ txID: SWAP.toUpperCase(), coins: [{ asset: "ZEC.ZEC", amount: "100000000" }] }], out,
  metadata: reason ? { refund: { reason } } : {},
});
const coinOut = (asset, amount, address = "t1f2zP1sPiE39kdomdfawXhssTPu8gK3Pv4") => ({ address, txID: "AB".repeat(32), coins: [{ asset, amount }] });

test("a finished swap whose payout isn't recorded yet says so, with no payout", () => {
  const o = thorchainOutcome({ actions: [action("swap", "success", [])] }, SWAP);
  assert.equal(o.state, "done");
  assert.equal(o.payout, null);
});

test("a refund whose ZEC payout isn't recorded yet has no refund line", () => {
  const o = thorchainOutcome({ actions: [action("refund", "success", [], "trading halted")] }, SWAP);
  assert.equal(o.state, "refunded");
  assert.equal(o.refund, null);
});

test("'fail to refund' means THORChain kept it, whatever the status says", () => {
  for (const status of ["success", "pending"]) {
    const o = thorchainOutcome({ actions: [action("refund", status, [], "not enough asset to pay for fees; fail to refund (33472 ZEC.ZEC)")] }, SWAP);
    assert.equal(o.state, "too-small", status);
  }
});

test("ZEC sent back inside the swap action itself makes it a partial fill", () => {
  const o = thorchainOutcome({ actions: [action("swap", "success", [coinOut("ETH.ETH", "5000000", "0xabc"), coinOut("ZEC.ZEC", "2000000")])] }, SWAP);
  assert.equal(o.state, "partial");
  assert.equal(o.refund.amountZat, 2_000_000);
});

test("a long reason from THORChain is cut short", () => {
  const o = thorchainOutcome({ actions: [action("refund", "success", [coinOut("ZEC.ZEC", "1")], "x".repeat(500))] }, SWAP);
  assert.ok(o.reason.length < 220, `reason is ${o.reason.length} characters`);
});

test("an empty answer from the first host is checked against the second", async () => {
  const asked = [];
  const fetchImpl = async (url) => {
    asked.push(url);
    return new Response(JSON.stringify(asked.length === 1 ? { actions: [], count: "0" } : load("swap-success")), { status: 200 });
  };
  const o = await fetchThorchain(SWAP, fetchImpl);
  assert.equal(asked.length, 2);
  assert.equal(o.state, "done");
});

// Midgard can keep saying "pending" after THORChain has paid (seen 9 Nov 2026: a refund Midgard listed as pending
// had been signed and sent per THORNode). So a "pending" answer is checked against THORNode's tx/status before we
// show it. Fixtures status-*.json are real THORNode answers recorded on 9 Nov 2026 (gateway.liquify.com).
const pendingRefund = () => {
  const data = load("refund-full");
  for (const a of data.actions) if (a.type === "refund") { a.status = "pending"; for (const o of a.out ?? []) o.txID = ""; }
  return data;
};
const pendingSwap = () => {
  const data = load("swap-success");
  data.actions[0].status = "pending";
  for (const o of data.actions[0].out ?? []) o.txID = "";
  return data;
};

test("a refund Midgard calls pending but THORNode shows as sent is refunded, with THORNode's ZEC transaction", () => {
  const o = confirmWithThornode(thorchainOutcome(pendingRefund(), FULL_REFUND), load("status-refund-full"));
  assert.equal(o.state, "refunded");
  assert.equal(o.nextParty, "nobody");
  assert.equal(o.confirmedBy, "thornode");
  assert.equal(o.refund.address, "t1f2zP1sPiE39kdomdfawXhssTPu8gK3Pv4");
  assert.equal(o.refund.amountZat, 152_909_074);
  assert.match(o.refund.txid, /^8cfaada3ec[0-9a-f]{54}$/);
  assert.match(o.reason, /price/i);
});

test("a swap Midgard calls pending but THORNode shows as sent is done, with the payout and not the RUNE fee", () => {
  const o = confirmWithThornode(thorchainOutcome(pendingSwap(), SWAP), load("status-swap"));
  assert.equal(o.state, "done");
  assert.equal(o.confirmedBy, "thornode");
  assert.equal(o.payout.address, "0xd0e5999e156957f37E2A676D78248900beF708Ae");
  assert.ok(o.payout.asset.startsWith("BSC.USDT"));
  assert.equal(o.payout.amount, "8147348419");
  assert.match(o.payout.txid, /^731BC074C0/i);
});

test("THORNode still waiting to sign keeps it pending", () => {
  const status = load("status-refund-full");
  status.stages.outbound_signed.completed = false;
  status.out_txs = [];
  const o = confirmWithThornode(thorchainOutcome(pendingRefund(), FULL_REFUND), status);
  assert.equal(o.state, "refund-pending");
  assert.equal(o.nextParty, "thorchain");
});

test("an answer that isn't pending is never changed by THORNode", () => {
  const done = thorchainOutcome(load("swap-success"), SWAP);
  assert.deepEqual(confirmWithThornode(done, load("status-dust")), done);
  assert.deepEqual(confirmWithThornode(done, null), done);
});

test("fetchThorchain checks a pending answer with THORNode, sending only the txid", async () => {
  const asked = [];
  const fetchImpl = async (url) => {
    asked.push(url);
    if (url.includes("/thorchain/tx/status/")) return new Response(JSON.stringify(load("status-refund-full")), { status: 200 });
    return new Response(JSON.stringify(pendingRefund()), { status: 200 });
  };
  const o = await fetchThorchain(FULL_REFUND, fetchImpl);
  assert.equal(o.state, "refunded");
  assert.equal(asked.length, 2);
  assert.match(asked[1], /\/thorchain\/tx\/status\/22AA3A8B56BC7DC2AA6A6A2F1DA72331DB6E4109B2BD7AF224A094E3F451C73A$/);
});

test("if THORNode can't be reached, Midgard's pending answer stands", async () => {
  const fetchImpl = async (url) => {
    if (url.includes("/thorchain/tx/status/")) throw new Error("offline");
    return new Response(JSON.stringify(pendingRefund()), { status: 200 });
  };
  const o = await fetchThorchain(FULL_REFUND, fetchImpl);
  assert.equal(o.state, "refund-pending");
});
