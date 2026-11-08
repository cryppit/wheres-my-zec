// A slow source must not freeze the page: every lookup carries a timeout signal, and the flow reports each step.
import { test } from "node:test";
import assert from "node:assert/strict";
import { fetchTx } from "../src/fetch.js";
import { fetchThorchain } from "../src/routes/thorchain.js";
import { fetchOmniDeposits } from "../src/routes/omni.js";
import { check } from "../src/check.js";
import { fixture } from "./fixtures.js";

const recordInits = () => {
  const inits = [];
  const fetchImpl = async (url, init) => {
    inits.push(init);
    return new Response("", { status: 404 });
  };
  return { inits, fetchImpl };
};

test("every network lookup carries a timeout signal", async () => {
  for (const call of [
    (f) => fetchTx("a".repeat(64), f),
    (f) => fetchThorchain("a".repeat(64), f),
    (f) => fetchOmniDeposits("a".repeat(64), [{ n: 0, address: "t1VmmGiyjVNeCjxDZzg7vZmd99WyzVby9yC" }], f),
  ]) {
    const { inits, fetchImpl } = recordInits();
    await call(fetchImpl);
    assert.ok(inits.length > 0);
    for (const i of inits) assert.ok(i?.signal instanceof AbortSignal, "no timeout signal");
  }
});

test("a lookup that times out is busy, never 'not found'", async () => {
  const hang = async (url, init) => new Promise((_, reject) => init.signal.addEventListener("abort", () => reject(init.signal.reason)));
  const r = await fetchThorchain("a".repeat(64), hang, { timeoutMs: 20 });
  assert.equal(r.state, "busy");
});

test("the flow says which source it is reading", async () => {
  const f = fixture("ironwood-from-transparent");
  const steps = [];
  await check(f.txid, {
    now: "2026-11-09 UTC",
    onStep: (s) => steps.push(s),
    fetchImpl: async (url) => new Response(JSON.stringify(url.includes("/raw/") ? f.raw : f.dashboard), { status: 200 }),
  });
  assert.deepEqual(steps, ["Reading the Zcash chain…"]);
});
