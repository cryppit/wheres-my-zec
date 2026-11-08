// NEAR's Zcash light client (zcash-client.bridge.near) decides how long a stuck Omni deposit can still be refunded:
// request_refund proves the deposit's block against it, and it keeps only its newest blocks. This reads it straight from
// NEAR with three view calls that carry nothing about the person (no address, no txid), and turns a deposit's block
// height into blocks and seconds left. Since NU7 (6 Nov 2026) Zcash blocks are 25 s apart, so its 103,680 blocks last
// about 30 days, not 90.
import { withTimeout } from "../net.js";

const NEAR_RPC = "https://rpc.mainnet.fastnear.com";
const CLIENT = "zcash-client.bridge.near";

function view(fetchImpl, method) {
  return withTimeout(async (signal) => {
    const res = await fetchImpl(NEAR_RPC, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: method,
        method: "query",
        params: { request_type: "call_function", finality: "final", account_id: CLIENT, method_name: method, args_base64: "e30=" },
      }),
      cache: "no-store",
      signal,
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const body = await res.json();
    const bytes = body?.result?.result;
    if (!Array.isArray(bytes)) throw new Error("no result");
    return JSON.parse(new TextDecoder().decode(Uint8Array.from(bytes)));
  });
}

/** How many blocks the client keeps, its newest block, and today's block spacing; `{ busy: true }` on any failure. */
export async function fetchZcashLightClient(fetchImpl = fetch) {
  try {
    const [keeps, header, config] = await Promise.all([view(fetchImpl, "get_mainchain_size"), view(fetchImpl, "get_last_block_header"), view(fetchImpl, "get_config")]);
    const tip = header?.block_height;
    const spacingSec = config?.post_nu7_pow_target_spacing ?? config?.post_blossom_pow_target_spacing;
    const nu7Height = config?.nu7_activation_height;
    if (![keeps, tip, spacingSec].every((n) => Number.isInteger(n) && n > 0)) return { busy: true };
    return { keeps, tip, spacingSec, nu7Height };
  } catch {
    return { busy: true };
  }
}

/**
 * Whether the client still holds a deposit's block. It keeps blocks tip - keeps + 1 .. tip, so the block at `height`
 * stays while tip <= height + keeps - 1; each further block takes `spacingSec`.
 */
export function refundWindow(height, client) {
  const blocksLeft = height + client.keeps - 1 - client.tip;
  if (blocksLeft < 0) return { open: false, blocksLeft: 0, secondsLeft: 0 };
  return { open: true, blocksLeft, secondsLeft: blocksLeft * client.spacingSec };
}
