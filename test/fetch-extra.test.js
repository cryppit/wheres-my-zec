// Two review fixes for the Blockchair reader: answers are never taken from a cache, and a found transaction whose
// block details are missing is "couldn't check", never "still waiting for a block".
import { test } from "node:test";
import assert from "node:assert/strict";
import { fetchTx } from "../src/fetch.js";
import { fixture } from "./fixtures.js";

test("every Blockchair request asks for a fresh answer", async () => {
  const f = fixture("ironwood-from-transparent");
  const inits = [];
  await fetchTx(f.txid, async (url, init) => {
    inits.push(init);
    return new Response(JSON.stringify(url.includes("/raw/") ? f.raw : f.dashboard), { status: 200 });
  });
  assert.equal(inits.length, 2);
  for (const i of inits) assert.equal(i?.cache, "no-store");
});

test("a found transaction with no block details is busy, not 'waiting for a block'", async () => {
  const f = fixture("ironwood-from-transparent");
  const r = await fetchTx(f.txid, async (url) => new Response(JSON.stringify(url.includes("/raw/") ? f.raw : { data: {}, context: { code: 200 } }), { status: 200 }));
  assert.deepEqual(r, { busy: true });
});
