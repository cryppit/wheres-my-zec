// Cryppit Pin v2. The page's two data tables are fingerprinted together: each file becomes one Merkle leaf,
// "<path>\n<sha256 hex of its bytes>", leaves in path order, and the root is RFC 6962's Merkle tree hash (the same
// tree as Intent Sentinel's pin). Once a UTC day is over, that day's root is pinned on NEAR (contract/ in this repo),
// so anyone can prove what the tables said that day. The page reads the last pin with one view call that carries
// nothing about the person, and says whether the tables it loaded still match it.

import { withTimeout } from "./net.js";

export const PIN_FILES = ["data/acceptance.json", "data/restore.json"];
export const PIN_ACCOUNT = "wmz-pin.cryppit.testnet";
const NETWORK = "testnet";
const RPC = "https://rpc.testnet.fastnear.com";

const hex = (buf) => Array.from(new Uint8Array(buf), (b) => b.toString(16).padStart(2, "0")).join("");
const sha256 = (bytes) => crypto.subtle.digest("SHA-256", bytes);
const concat = (...parts) => {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let at = 0;
  for (const p of parts) {
    out.set(p, at);
    at += p.length;
  }
  return out;
};

/** RFC 6962 Merkle tree hash of `leaves` (byte arrays), as raw bytes. */
async function mth(leaves) {
  if (leaves.length === 1) return new Uint8Array(await sha256(concat(Uint8Array.of(0), leaves[0])));
  let k = 1;
  while (k * 2 < leaves.length) k *= 2;
  const [left, right] = await Promise.all([mth(leaves.slice(0, k)), mth(leaves.slice(k))]);
  return new Uint8Array(await sha256(concat(Uint8Array.of(1), left, right)));
}

/** The RFC 6962 root of at least one leaf, as 64 lowercase hex characters. */
export async function merkleRoot(leaves) {
  if (!leaves?.length) throw new Error("a Merkle root needs at least one leaf");
  return hex(await mth(leaves));
}

/** The root over the data files ({path, bytes}), in path order whatever order they come in. */
export async function dataRoot(files) {
  const sorted = [...files].sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));
  const enc = new TextEncoder();
  const leaves = await Promise.all(sorted.map(async (f) => enc.encode(`${f.path}\n${hex(await sha256(f.bytes))}`)));
  return { root: await merkleRoot(leaves), leafCount: sorted.length };
}

/** The contract's last pin, `null` before the first, or `{busy: true}` when NEAR can't be read (never "no pin"). */
export async function fetchLastPin(fetchImpl = fetch, timeoutMs) {
  const body = JSON.stringify({
    jsonrpc: "2.0",
    id: 1,
    method: "query",
    params: { request_type: "call_function", finality: "final", account_id: PIN_ACCOUNT, method_name: "last_pin", args_base64: "e30=" },
  });
  try {
    const res = await withTimeout((signal) => fetchImpl(RPC, { method: "POST", headers: { "content-type": "application/json" }, body, cache: "no-store", signal }), timeoutMs);
    if (!res.ok) return { busy: true };
    const answer = await res.json();
    // Before the contract is deployed NEAR says the account (or its code) doesn't exist: that's "not pinned yet".
    if (answer?.error?.cause?.name === "UNKNOWN_ACCOUNT" || /CodeDoesNotExist/.test(String(answer?.result?.error ?? ""))) return null;
    const bytes = answer?.result?.result;
    if (!Array.isArray(bytes)) return { busy: true };
    return JSON.parse(new TextDecoder().decode(Uint8Array.from(bytes)));
  } catch {
    return { busy: true };
  }
}

/** Whether the tables the page loaded (`root`) match the last pin. */
export function pinStatus(lastPin, root) {
  if (lastPin?.busy) return { state: "busy" };
  if (!lastPin) return { state: "none" };
  return { state: lastPin.merkle_root === root ? "match" : "changed", day: lastPin.day };
}

/** The page's line about the pin, in plain words. */
export function pinLine(s) {
  if (s.state === "match") return `These tables match their fingerprint pinned on NEAR for ${s.day}, so nobody can quietly rewrite what they said that day.`;
  if (s.state === "changed") return `These tables changed since the last NEAR pin (${s.day}); the next daily pin covers today's version.`;
  if (s.state === "none") return "These tables are not pinned on NEAR yet.";
  return "Couldn't reach NEAR to check the tables' pin right now.";
}

/** The near CLI command that pins a day, for the founder to run and sign. This module never signs anything. */
export function pinCommand({ day, root, leafCount, prevPin }) {
  const args = JSON.stringify({ day, merkle_root: root, leaf_count: leafCount, prev_pin: prevPin ?? null });
  return `near contract call-function as-transaction ${PIN_ACCOUNT} pin json-args '${args}' prepaid-gas '30 Tgas' attached-deposit '0 NEAR' sign-as ${PIN_ACCOUNT} network-config ${NETWORK} sign-with-keychain send`;
}
