// Omni bridge deposits of ZEC. A deposit carries no marker in the transaction; the bridge's indexer knows each deposit
// address by the message it was made for. So the transaction's transparent output addresses are asked about, and only
// after the person presses the button that says so. The full status and the refund steps live in the Refund Helper
// (same author, MIT), which this links to rather than repeating.

import { request } from "../net.js";

const INDEXER = "https://mainnet.api.bridge.nearone.org/api/v3/utxo/get_deposit_message";
const REFUND_HELPER = "https://cryppit.github.io/zec-refund-helper/";
const MAX_LOOKUPS = 50;

/** The outputs worth asking about: transparent addresses only, each address once, in output order. */
export function omniCandidates(outputs) {
  const seen = new Set();
  return (outputs ?? []).filter((o) => {
    if (typeof o.address !== "string" || !/^t[13]/.test(o.address) || seen.has(o.address)) return false;
    seen.add(o.address);
    return true;
  });
}

/** The NEAR account a deposit message credits: the order inside `safe_deposit.msg`, else the recipient itself. */
function forAccount(msg) {
  try {
    const inner = JSON.parse(msg?.safe_deposit?.msg ?? "null");
    if (inner && typeof inner.receiver_id === "string") return inner.receiver_id;
  } catch {
    // fall through to the recipient
  }
  return msg.recipient_id;
}

const busy = { route: "omni", state: "busy", evidence: "Unknown" };

/**
 * Which of a transaction's outputs are Omni bridge deposits. Only a 404 counts as "not a deposit"; any other failure,
 * or an answer without a recipient, makes the whole answer busy. A batch is checked up to 50 addresses, and says so.
 */
export async function fetchOmniDeposits(txid, outputs, fetchImpl = fetch) {
  const all = omniCandidates(outputs);
  const candidates = all.slice(0, MAX_LOOKUPS);
  const deposits = [];
  for (const o of candidates) {
    let res;
    try {
      res = await request(fetchImpl, `${INDEXER}?chain=zcash&address=${encodeURIComponent(o.address)}`);
    } catch {
      return busy;
    }
    if (res.status === 404) continue;
    if (!res.ok) return busy;
    let msg;
    try {
      msg = await res.json();
    } catch {
      return busy;
    }
    if (!msg || typeof msg.recipient_id !== "string") return busy;
    deposits.push({ vout: o.n, address: o.address, forAccount: forAccount(msg), via: msg.recipient_id, refundHelper: `${REFUND_HELPER}#q=${txid}:${o.n}` });
  }
  return deposits.length > 0
    ? { route: "omni", state: "deposit", evidence: "Reported", nextParty: "see-refund-helper", deposits }
    : { route: "omni", state: "none", evidence: "Reported", checked: candidates.length, total: all.length };
}
