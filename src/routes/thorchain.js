// THORChain swaps from ZEC. A deposit to THORChain carries its instructions in an OP_RETURN memo ("=:BSC.USDT:0x…",
// "=<:" for a limit swap), so the memo is how we know to ask, and THORChain's own records (Midgard,
// `/v2/actions?txid=`) say what happened. Only the txid is sent. Matching outputs against THORChain's vault would miss
// older swaps: the vault address rotates. Everything here is THORChain's report of itself, so the evidence is Reported.

import { request } from "../net.js";

const MIDGARD = ["https://gateway.liquify.com/chain/thorchain_midgard", "https://midgard.ninerealms.com"];
// Memo prefixes from THORChain's memo docs (dev.thorchain.org/concepts/memos.html), long and short forms.
const MEMO = /^(=<|m=<|=|swap|s|\+|add|a|-|withdraw|wd|trade\+|trade-|secure\+|secure-|loan\+|loan-|\$\+|\$-|donate|d|pool\+|pool-|tcy\+|tcy-|tcy|switch|reference|r|name|n|~|noop|bond|unbond|rebond|leave):/i;
const ZEC = "ZEC.ZEC";
const MAX_REASON = 160;

/** The data pushed by an OP_RETURN script (`6a` then one push), as bytes; null if the script is anything else. */
function opReturnData(scriptHex) {
  if (!/^6a([0-9a-f]{2})+$/.test(scriptHex) || scriptHex.length < 4) return null;
  const bytes = Uint8Array.from(scriptHex.slice(2).match(/../g), (b) => parseInt(b, 16));
  let len = bytes[0];
  let at = 1;
  if (len === 0x4c) [len, at] = [bytes[1], 2];
  else if (len === 0x4d) [len, at] = [bytes[1] | (bytes[2] << 8), 3];
  else if (len > 0x4b) return null;
  const data = bytes.subarray(at, at + len);
  return data.length === len ? data : null;
}

/** The THORChain memo in a transaction's outputs, or null when it has none. */
export function thorchainMemo(outputs) {
  for (const o of outputs ?? []) {
    const data = opReturnData(String(o.scriptHex ?? ""));
    if (!data) continue;
    let text;
    try {
      text = new TextDecoder("utf-8", { fatal: true }).decode(data);
    } catch {
      continue;
    }
    if (MEMO.test(text)) return text;
  }
  return null;
}

const failedRefund = (raw) => /fail to refund/i.test(String(raw ?? ""));

/** THORChain's refund reason, in plain words; its own text is quoted only when we don't know it, and cut short. */
function plainReason(raw) {
  const r = String(raw ?? "");
  if (failedRefund(r)) return "The deposit was too small to pay THORChain's fee for sending it back, so THORChain kept it.";
  if (/less than price limit/i.test(r)) return "The price moved past the limit set for this swap, so THORChain sent the ZEC back.";
  if (/limit swap expired/i.test(r)) return "The limit order expired before it could fill, so THORChain sent the ZEC back.";
  if (/trading halted|halted/i.test(r)) return "Trading was paused on THORChain, so it sent the ZEC back.";
  if (/swap has been completed/i.test(r)) return "Part of the swap filled; THORChain sent the rest back as ZEC.";
  if (!r) return "THORChain sent the ZEC back.";
  const short = r.length > MAX_REASON ? `${r.slice(0, MAX_REASON)}…` : r;
  return `THORChain sent the ZEC back. Its reason: "${short}".`;
}

const coin = (o) => o.coins?.[0] ?? {};
const hasTx = (action, txid) => (action.in ?? []).some((i) => String(i.txID ?? "").toLowerCase() === txid.toLowerCase());
const payoutOf = (a) => {
  const o = (a?.out ?? []).find((x) => !x.affiliate && coin(x).asset && coin(x).asset !== ZEC);
  return o ? { address: o.address, asset: coin(o).asset, amount: coin(o).amount, txid: o.txID || null } : null;
};
const refundOf = (a) => {
  const o = (a?.out ?? []).find((x) => coin(x).asset === ZEC);
  return o ? { address: o.address, amountZat: Number(coin(o).amount), txid: o.txID || null } : null;
};

/** What THORChain did with a deposit, from its Midgard actions for that txid. */
export function thorchainOutcome(data, txid) {
  const actions = (data?.actions ?? []).filter((a) => hasTx(a, txid));
  if (actions.length === 0) return { route: "thorchain", state: "not-seen", evidence: "Unknown", nextParty: "thorchain" };
  const swap = actions.find((a) => a.type === "swap");
  const refund = actions.find((a) => a.type === "refund");
  const base = { route: "thorchain", evidence: "Reported" };

  if (refund) {
    const raw = refund.metadata?.refund?.reason;
    const reason = plainReason(raw);
    if (failedRefund(raw)) return { ...base, state: "too-small", nextParty: "nobody", reason };
    if (refund.status !== "success") return { ...base, state: "refund-pending", nextParty: "thorchain", reason };
    const payout = swap?.status === "success" ? payoutOf(swap) ?? payoutOf(refund) : payoutOf(refund);
    return { ...base, state: payout ? "partial" : "refunded", nextParty: "nobody", reason, refund: refundOf(refund), ...(payout ? { payout } : {}) };
  }
  if (swap) {
    if (swap.status !== "success") return { ...base, state: "pending", nextParty: "thorchain" };
    const back = refundOf(swap);
    if (back) return { ...base, state: "partial", nextParty: "nobody", reason: plainReason("swap has been completed"), payout: payoutOf(swap), refund: back };
    return { ...base, state: "done", nextParty: "nobody", payout: payoutOf(swap) };
  }
  return { ...base, state: "other", nextParty: "nobody", type: actions[0].type };
}

/** Ask Midgard about one txid (only the txid is sent). An empty answer is checked with the next host, which may be
 * further along; every host failing is "busy", never "not seen". */
export async function fetchThorchain(txid, fetchImpl = fetch, { timeoutMs } = {}) {
  let notSeen = null;
  for (const host of MIDGARD) {
    try {
      const res = await request(fetchImpl, `${host}/v2/actions?txid=${txid.toUpperCase()}`, timeoutMs);
      if (!res.ok) continue;
      const outcome = thorchainOutcome(await res.json(), txid);
      if (outcome.state !== "not-seen") return outcome;
      notSeen = outcome;
    } catch {
      // try the next host
    }
  }
  return notSeen ?? { state: "busy", evidence: "Unknown" };
}
