// Ported from cryppit/shield-receipt src/fetch.ts (MIT, Cryppit) by stripping its TypeScript types; logic unchanged.
// The txid from whatever was pasted, and the transaction from Blockchair's free API (no key). Only the txid is sent;
// the address never leaves the page. A rate limit or a network failure is "busy", never "not found".
import { readBlockchairTx } from "./tx.js";

const API = "https://api.blockchair.com/zcash";

/** The one 64-character hex run in `raw` (a bare txid or an explorer link), lowercased; null if there isn't exactly one. */
export function extractTxid(raw) {
  const runs = raw.match(/[0-9a-fA-F]+/g) ?? [];
  const ids = runs.filter((r) => r.length === 64);
  return ids.length === 1 && runs.every((r) => r.length <= 64) ? ids[0].toLowerCase() : null;
}

                                                                                                                  

class Busy extends Error {}

async function getJson(url, fetchImpl) {
  let res ;
  try {
    res = await fetchImpl(url);
  } catch {
    throw new Busy();
  }
  if (!res.ok) throw new Busy();
  let body ;
  try {
    body = await res.json();
  } catch {
    throw new Error("Blockchair sent a response this page can't read");
  }
  // Blockchair can report a limit or an error inside an HTTP 200 response.
  const code = typeof body === "object" && body !== null && "context" in body ? (body).context?.code : 200;
  if (code !== 200) throw new Busy();
  return body;
}

export async function fetchTx(txid, fetchImpl = fetch) {
  try {
    const [raw, dashboard] = await Promise.all([
      getJson(`${API}/raw/transaction/${txid}`, fetchImpl),
      getJson(`${API}/dashboards/transaction/${txid}`, fetchImpl),
    ]);
    return readBlockchairTx(raw, dashboard, txid);
  } catch (e) {
    if (e instanceof Busy) return { busy: true };
    return { error: e instanceof Error ? e.message : String(e) };
  }
}
