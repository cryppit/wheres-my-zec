// The whole flow behind the paste box, with the network stubbed: which hosts get asked, and only when they should be.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { check, checkRoutes } from "../src/check.js";
import { fixture } from "./fixtures.js";

const NOW = "2026-11-09";
const json = (body, status = 200) => new Response(JSON.stringify(body), { status });
const midgard = (name) => JSON.parse(readFileSync(new URL(`./fixtures/thorchain/${name}.json`, import.meta.url), "utf8"));

/** A fetch that answers Blockchair from a fixture, Midgard from another, and records every URL. */
function stubFetch({ tx, thor = "not-seen", omni = 404 }) {
  const asked = [];
  // Midgard's record names the deposit it answers for; point the recorded one at this test's transaction.
  const thorBody = midgard(thor);
  for (const a of thorBody.actions) for (const i of a.in) i.txID = tx.txid.toUpperCase();
  const fetchImpl = async (url) => {
    asked.push(url);
    if (url.includes("api.blockchair.com/zcash/raw/")) return json(tx.raw);
    if (url.includes("api.blockchair.com/zcash/dashboards/")) return json(tx.dashboard);
    if (url.includes("/v2/actions?txid=")) return json(thorBody);
    if (url.includes("get_deposit_message")) return omni === 404 ? new Response("", { status: 404 }) : new Response(omni, { status: 200 });
    throw new Error(`unexpected ${url}`);
  };
  return { fetchImpl, asked };
}

/** A copy of a fixture whose transaction carries a THORChain memo in an extra OP_RETURN output. */
function withMemo(name, memo) {
  const f = fixture(name);
  const t = f.raw.data[f.txid].decoded_raw_transaction;
  const hex = Buffer.from(memo).toString("hex");
  t.vout.push({ n: t.vout.length, valueZat: 0, scriptPubKey: { hex: `6a${(memo.length).toString(16).padStart(2, "0")}${hex}`, type: "nulldata" } });
  return f;
}

test("a seed phrase is refused without any network call", async () => {
  const { fetchImpl, asked } = stubFetch({ tx: fixture("transparent-batch") });
  const r = await check("abandon ability able about above absent absorb abstract absurd abuse access accident", { fetchImpl, now: NOW });
  assert.ok(r.refused);
  assert.equal(asked.length, 0);
});

test("an address is answered locally, with the acceptance table, and nothing is sent", async () => {
  const { fetchImpl, asked } = stubFetch({ tx: fixture("transparent-batch") });
  const acceptance = { rows: [{ service: "Zodl", sendsTo: { tex: "yes" } }] };
  const r = await check("tex1s2rt77ggv6q989lr49rkgzmh5slsksa9khdgte", { fetchImpl, now: NOW, acceptance });
  assert.match(r.case.title, /TEX/);
  assert.deepEqual(r.case.services.can, ["Zodl"]);
  assert.equal(asked.length, 0);
});

test("a plain transaction asks only Blockchair, and only with the txid", async () => {
  const f = fixture("ironwood-from-transparent");
  const { fetchImpl, asked } = stubFetch({ tx: f });
  const r = await check(f.txid, { fetchImpl, now: NOW });
  assert.equal(r.case.evidence, "Proven");
  assert.equal(r.case.canCheckRoutes, true);
  assert.equal(asked.length, 2);
  assert.ok(asked.every((u) => u.startsWith("https://api.blockchair.com/zcash/") && u.endsWith(f.txid)));
});

test("a transaction with a THORChain memo is also looked up on THORChain, by txid only", async () => {
  const f = withMemo("transparent-batch", "=:ETH.ETH:0xabc");
  const { fetchImpl, asked } = stubFetch({ tx: f, thor: "swap-success" });
  const r = await check(f.txid, { fetchImpl, now: NOW });
  const thor = asked.filter((u) => u.includes("/v2/actions?txid="));
  assert.equal(thor.length, 1);
  assert.ok(thor[0].endsWith(f.txid.toUpperCase()));
  assert.equal(r.case.evidence, "Reported");
});

test("the bridge-and-swap check sends the transparent output addresses to the Omni indexer, and only then", async () => {
  const f = fixture("transparent-batch");
  const msg = readFileSync(new URL("./fixtures/omni/deposit-message.json", import.meta.url), "utf8");
  const { fetchImpl, asked } = stubFetch({ tx: f, omni: msg });
  const first = await check(f.txid, { fetchImpl, now: NOW });
  assert.equal(asked.some((u) => u.includes("get_deposit_message")), false);
  const r = await checkRoutes(first, { fetchImpl, now: NOW });
  assert.ok(asked.some((u) => u.includes("get_deposit_message")));
  assert.match(r.case.title, /Omni bridge/);
});

test("a busy explorer gives the busy case, not an error", async () => {
  const r = await check("91b580368de6a182f7d61b54aec7ea92d61137bb9cd714609745bdcfad6b625f", { fetchImpl: async () => new Response("", { status: 430 }), now: NOW });
  assert.equal(r.case.evidence, "Unknown");
  assert.match(r.case.next.text, /try again/i);
});

test("something unrecognised comes back as the reader's own help text", async () => {
  const r = await check("hello", { fetchImpl: async () => { throw new Error("no network expected"); }, now: NOW });
  assert.match(r.error, /recognise/);
});
