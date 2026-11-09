// Cryppit Pin v2: the page's data tables are fingerprinted (an RFC 6962 Merkle root over each file's path and sha256)
// and pinned once a day on NEAR. Expected roots below were computed independently in Python (hashlib) on 9 Nov 2026.
import { test } from "node:test";
import assert from "node:assert/strict";
import { merkleRoot, dataRoot, fetchLastPin, pinStatus, pinLine, pinCommand, PIN_FILES, PIN_ACCOUNT } from "../src/pin.js";

const enc = (s) => new TextEncoder().encode(s);

test("the Merkle root matches RFC 6962 for 1, 2, 3 and 5 leaves", async () => {
  assert.equal(await merkleRoot([enc("")]), "6e340b9cffb37a989ca544e6bb780a2c78901d3fb33738768511a30617afa01d");
  assert.equal(await merkleRoot([enc("a")]), "022a6979e6dab7aa5ae4c3e5e45f7e977112a7e63593820dbec1ec738a24f93c");
  assert.equal(await merkleRoot([enc("a"), enc("b")]), "b137985ff484fb600db93107c77b0365c80d78f5b429ded0fd97361d077999eb");
  assert.equal(await merkleRoot(["a", "b", "c"].map(enc)), "36642e73c2540ab121e3a6bf9545b0a24982cd830eb13d3cd19de3ce6c021ec1");
  assert.equal(await merkleRoot(["a", "b", "c", "d", "e"].map(enc)), "fe14a5426fbd70c0fa73f52342afed0da0bd23c4838662ccf6b88a3070ead97b");
});

test("an empty tree is refused: a pin needs at least one file", async () => {
  await assert.rejects(() => merkleRoot([]), /at least one/);
});

const files = [
  { path: "data/restore.json", bytes: enc("[]") },
  { path: "data/acceptance.json", bytes: enc('{"x":1}') },
];

test("the data root covers each file's path and content, in path order, whatever order they came in", async () => {
  const r = await dataRoot(files);
  assert.deepEqual(r, { root: "aa69c229d1035417dc24e5933f155835956cfe8dc4559e581968babac35262c8", leafCount: 2 });
  assert.deepEqual(await dataRoot([...files].reverse()), r);
});

test("changing one byte of one table changes the root", async () => {
  const changed = [files[0], { path: "data/acceptance.json", bytes: enc('{"x":2}') }];
  assert.notEqual((await dataRoot(changed)).root, (await dataRoot(files)).root);
});

test("the pinned files are the two published tables", () => {
  assert.deepEqual(PIN_FILES, ["data/acceptance.json", "data/restore.json"]);
  assert.equal(PIN_ACCOUNT, "wmz-pin.cryppit.testnet");
});

const PIN = { day: "2026-11-10", merkle_root: "aa69c229d1035417dc24e5933f155835956cfe8dc4559e581968babac35262c8", leaf_count: 2, prev_pin: null, block_height: 1, block_timestamp_ns: "1" };
const rpcAnswer = (value) => new Response(JSON.stringify({ jsonrpc: "2.0", id: 1, result: { result: [...enc(JSON.stringify(value))] } }), { status: 200 });

test("fetchLastPin asks NEAR testnet for last_pin with a view call that carries nothing about the person", async () => {
  const asked = [];
  const pin = await fetchLastPin(async (url, init) => {
    asked.push({ url, body: JSON.parse(init.body) });
    return rpcAnswer(PIN);
  });
  assert.deepEqual(pin, PIN);
  assert.equal(asked.length, 1);
  assert.equal(asked[0].url, "https://rpc.testnet.fastnear.com");
  const p = asked[0].body.params;
  assert.equal(p.request_type, "call_function");
  assert.equal(p.account_id, "wmz-pin.cryppit.testnet");
  assert.equal(p.method_name, "last_pin");
  assert.equal(p.args_base64, "e30=");
});

test("no pin yet is null; a failed read is busy, never 'no pin'", async () => {
  assert.equal(await fetchLastPin(async () => rpcAnswer(null)), null);
  for (const bad of [async () => new Response("", { status: 503 }), async () => { throw new Error("offline"); }, async () => new Response("{}", { status: 200 })]) {
    assert.deepEqual(await fetchLastPin(bad), { busy: true });
  }
});

test("pinStatus compares the tables the page loaded with the last pin", () => {
  assert.deepEqual(pinStatus(PIN, PIN.merkle_root), { state: "match", day: "2026-11-10" });
  assert.deepEqual(pinStatus(PIN, "00".repeat(32)), { state: "changed", day: "2026-11-10" });
  assert.deepEqual(pinStatus(null, PIN.merkle_root), { state: "none" });
  assert.deepEqual(pinStatus({ busy: true }, PIN.merkle_root), { state: "busy" });
});

test("the page line says what the pin proves, in plain words", () => {
  assert.match(pinLine({ state: "match", day: "2026-11-10" }), /^These tables match their fingerprint pinned on NEAR for 2026-11-10/);
  assert.match(pinLine({ state: "changed", day: "2026-11-10" }), /changed since the last NEAR pin \(2026-11-10\)/);
  assert.match(pinLine({ state: "none" }), /not pinned on NEAR yet/);
  assert.match(pinLine({ state: "busy" }), /couldn't reach NEAR/i);
});

test("pinCommand prints the near CLI call for the founder to sign; it signs nothing itself", () => {
  const cmd = pinCommand({ day: "2026-11-10", root: PIN.merkle_root, leafCount: 2, prevPin: null });
  assert.equal(
    cmd,
    `near contract call-function as-transaction wmz-pin.cryppit.testnet pin json-args '{"day":"2026-11-10","merkle_root":"${PIN.merkle_root}","leaf_count":2,"prev_pin":null}' prepaid-gas '30 Tgas' attached-deposit '0 NEAR' sign-as wmz-pin.cryppit.testnet network-config testnet sign-with-keychain send`,
  );
  assert.match(pinCommand({ day: "2026-11-11", root: PIN.merkle_root, leafCount: 2, prevPin: "2026-11-10" }), /"prev_pin":"2026-11-10"/);
});

test("before the contract is deployed, NEAR's 'no such account' answer means not pinned yet, not busy", async () => {
  const missing = async () => new Response(JSON.stringify({ jsonrpc: "2.0", id: 1, error: { name: "HANDLER_ERROR", cause: { name: "UNKNOWN_ACCOUNT", info: { requested_account_id: "wmz-pin.cryppit.testnet" } } } }), { status: 200 });
  assert.equal(await fetchLastPin(missing), null);
  const noCode = async () => new Response(JSON.stringify({ jsonrpc: "2.0", id: 1, result: { error: "wasm execution failed with error: CompilationError(CodeDoesNotExist { account_id: \"wmz-pin.cryppit.testnet\" })" } }), { status: 200 });
  assert.equal(await fetchLastPin(noCode), null);
});
