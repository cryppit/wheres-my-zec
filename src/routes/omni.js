// Omni bridge deposits of ZEC. A deposit carries no marker in the transaction; the bridge's indexer knows each deposit
// address by the message it was made for. So the transaction's transparent output addresses are asked about, and only
// after the person presses the button that says so. The full status and the refund steps live in the Refund Helper
// (same author, MIT), which this links to rather than repeating.

const INDEXER = "https://mainnet.api.bridge.nearone.org/api/v3/utxo/get_deposit_message";
const REFUND_HELPER = "https://cryppit.github.io/zec-refund-helper/";
const MAX_OUTPUTS = 4;

/** The outputs worth asking about: transparent addresses only, the first four. */
export function omniCandidates(outputs) {
  return (outputs ?? []).filter((o) => typeof o.address === "string" && /^t[13]/.test(o.address)).slice(0, MAX_OUTPUTS);
}

/** The NEAR account a deposit message credits: the order inside `safe_deposit.msg`, else the recipient itself. */
function forAccount(msg) {
  try {
    const inner = JSON.parse(msg?.safe_deposit?.msg ?? "null");
    if (inner && typeof inner.receiver_id === "string") return inner.receiver_id;
  } catch {
    // fall through to the recipient
  }
  return typeof msg?.recipient_id === "string" ? msg.recipient_id : null;
}

/** Which of a transaction's outputs are Omni bridge deposits. Any failed lookup makes the answer busy. */
export async function fetchOmniDeposits(txid, outputs, fetchImpl = fetch) {
  const candidates = omniCandidates(outputs);
  if (candidates.length === 0) return { route: "omni", state: "none", evidence: "Reported" };
  const deposits = [];
  for (const o of candidates) {
    let res;
    try {
      res = await fetchImpl(`${INDEXER}?chain=zcash&address=${encodeURIComponent(o.address)}`, { cache: "no-store" });
    } catch {
      return { route: "omni", state: "busy", evidence: "Unknown" };
    }
    if (res.status === 404 || res.status === 400) continue;
    if (!res.ok) return { route: "omni", state: "busy", evidence: "Unknown" };
    let msg;
    try {
      msg = await res.json();
    } catch {
      return { route: "omni", state: "busy", evidence: "Unknown" };
    }
    deposits.push({
      vout: o.n,
      address: o.address,
      forAccount: forAccount(msg),
      via: typeof msg?.recipient_id === "string" ? msg.recipient_id : null,
      refundHelper: `${REFUND_HELPER}#q=${txid}:${o.n}`,
    });
  }
  return deposits.length > 0
    ? { route: "omni", state: "deposit", evidence: "Reported", nextParty: "see-refund-helper", deposits }
    : { route: "omni", state: "none", evidence: "Reported" };
}
