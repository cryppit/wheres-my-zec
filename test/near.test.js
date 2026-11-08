// The Omni bridge proves a refund request against its Zcash light client on NEAR, so the light client's memory sets the
// deadline. These tests read that client the way the page does (NEAR RPC view calls, nothing user-specific sent) and
// turn a deposit's block height into blocks and days left.
import { test } from "node:test";
import assert from "node:assert/strict";
import { fetchZcashLightClient, refundWindow } from "../src/routes/near.js";

const view = (value) => ({ jsonrpc: "2.0", id: 1, result: { result: [...Buffer.from(JSON.stringify(value))], logs: [], block_height: 1 } });
const CLIENT = { keeps: 103_680, tip: 3_552_701, spacingSec: 25, nu7Height: 3_543_405 };

/** A NEAR RPC stub answering the three view calls, recording each request body. */
function rpc(answers, bodies = []) {
  return async (url, init) => {
    const body = JSON.parse(init.body);
    bodies.push({ url, body });
    const method = body.params.method_name;
    if (!(method in answers)) return new Response(JSON.stringify({ error: { message: "no method" } }), { status: 200 });
    return new Response(JSON.stringify(view(answers[method])), { status: 200 });
  };
}
const answers = {
  get_mainchain_size: 103_680,
  get_last_block_header: { block_height: 3_552_701, block_hash: "x" },
  get_config: { post_nu7_pow_target_spacing: 25, post_blossom_pow_target_spacing: 75, nu7_activation_height: 3_543_405 },
};

test("reads the light client's size, tip and block spacing with view calls that carry no user data", async () => {
  const bodies = [];
  const c = await fetchZcashLightClient(rpc(answers, bodies));
  assert.deepEqual(c, CLIENT);
  assert.equal(bodies.length, 3);
  for (const { url, body } of bodies) {
    assert.equal(url, "https://rpc.mainnet.fastnear.com");
    assert.equal(body.params.request_type, "call_function");
    assert.equal(body.params.account_id, "zcash-client.bridge.near");
    assert.equal(body.params.args_base64, "e30="); // {}
  }
});

test("a failed or odd answer is busy, never a deadline", async () => {
  assert.deepEqual(await fetchZcashLightClient(async () => { throw new Error("offline"); }), { busy: true });
  assert.deepEqual(await fetchZcashLightClient(async () => new Response("", { status: 502 })), { busy: true });
  assert.deepEqual(await fetchZcashLightClient(rpc({ ...answers, get_mainchain_size: "lots" })), { busy: true });
});

test("the oldest block the client keeps matches what we read from NEAR on 14 Oct (3,413,659 kept, 3,413,658 gone)", () => {
  const client = { keeps: 103_680, tip: 3_517_338, spacingSec: 75 };
  assert.equal(refundWindow(3_413_659, client).open, true);
  assert.equal(refundWindow(3_413_659, client).blocksLeft, 0);
  assert.equal(refundWindow(3_413_658, client).open, false);
});

test("an open window gives blocks and seconds left at today's 25-second spacing", () => {
  const w = refundWindow(3_543_000, CLIENT);
  // kept while tip <= h + keeps - 1: 3,543,000 + 103,679 - 3,552,701 = 93,978 blocks
  assert.deepEqual(w, { open: true, blocksLeft: 93_978, secondsLeft: 93_978 * 25 });
});

test("a deposit older than the client's memory is closed", () => {
  assert.deepEqual(refundWindow(3_400_000, CLIENT), { open: false, blocksLeft: 0, secondsLeft: 0 });
});
