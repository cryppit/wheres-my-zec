// Omni bridge deposits: the bridge's indexer knows a deposit address by the message it was made for. A ZEC deposit
// carries no marker, so the transaction's transparent output addresses are asked about, only after the person presses
// the button that says so. The full status and refund steps are the Refund Helper's job; this links to it.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fetchOmniDeposits, omniCandidates } from "../src/routes/omni.js";

const MSG = readFileSync(new URL("./fixtures/omni/deposit-message.json", import.meta.url), "utf8");
const TXID = "6de202d64d2b7c04154ed73f892c7dd7f288d440bde80d39059d2341fd9abadc";
const DEPOSIT = "t1RTEogVdgA8cWY8zm1uomj5ThPZnbp8BB4";
const CHANGE = "t1VmmGiyjVNeCjxDZzg7vZmd99WyzVby9yC";
const out = (n, address) => ({ n, scriptHex: "76a914" + "00".repeat(20) + "88ac", valueZat: 1_000, address });
const memo = { n: 2, scriptHex: "6a0461626364", valueZat: 0, address: null };

test("only transparent outputs are candidates, at most four", () => {
  assert.deepEqual(omniCandidates([out(0, DEPOSIT), memo, out(1, CHANGE)]).map((o) => o.n), [0, 1]);
  assert.equal(omniCandidates(Array.from({ length: 9 }, (_, i) => out(i, CHANGE))).length, 4);
});

test("an output the indexer knows is an Omni deposit, with the NEAR account it was for and a Refund Helper link", async () => {
  const asked = [];
  const fetchImpl = async (url) => {
    asked.push(url);
    return url.includes(DEPOSIT) ? new Response(MSG, { status: 200 }) : new Response("", { status: 404 });
  };
  const r = await fetchOmniDeposits(TXID, [out(0, DEPOSIT), out(1, CHANGE)], fetchImpl);
  assert.equal(r.state, "deposit");
  assert.equal(r.evidence, "Reported");
  assert.deepEqual(r.deposits, [{
    vout: 0,
    address: DEPOSIT,
    forAccount: "f3de655c605a4ca01e000e7961a969687678efaf3bd6c6dff13cea3cb50ab807",
    via: "intents.near",
    refundHelper: `https://cryppit.github.io/zec-refund-helper/#q=${TXID}:0`,
  }]);
  assert.equal(asked.length, 2);
  assert.ok(asked.every((u) => u.startsWith("https://mainnet.api.bridge.nearone.org/api/v3/utxo/get_deposit_message?chain=zcash&address=")));
});

test("no output known to the indexer: not an Omni deposit", async () => {
  const r = await fetchOmniDeposits(TXID, [out(0, CHANGE)], async () => new Response("", { status: 404 }));
  assert.deepEqual(r, { route: "omni", state: "none", evidence: "Reported" });
});

test("a failed lookup is busy, never 'not a deposit'", async () => {
  for (const bad of [async () => new Response("", { status: 502 }), async () => { throw new Error("offline"); }]) {
    assert.deepEqual(await fetchOmniDeposits(TXID, [out(0, DEPOSIT)], bad), { route: "omni", state: "busy", evidence: "Unknown" });
  }
});

test("a transaction with no transparent outputs needs no lookup", async () => {
  let called = false;
  const r = await fetchOmniDeposits(TXID, [memo], async () => { called = true; });
  assert.equal(called, false);
  assert.equal(r.state, "none");
});
