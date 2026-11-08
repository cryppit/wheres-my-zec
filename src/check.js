// Everything behind the paste box, with the network injected: what to ask, of whom, and only when. Seeds and keys are
// refused before anything is sent; an address is answered here, from the dated table, with nothing sent; a transaction
// sends only its txid (to Blockchair, and to THORChain when the transaction carries a THORChain memo). The Omni check
// sends the transaction's transparent output addresses, and runs only when the person presses the button for it.
import { readInput } from "./input.js";
import { readAddress } from "./address.js";
import { fetchTx } from "./fetch.js";
import { fetchThorchain, thorchainMemo } from "./routes/thorchain.js";
import { fetchOmniDeposits } from "./routes/omni.js";
import { fetchZcashLightClient, refundWindow } from "./routes/near.js";
import { caseForAddress, caseForTx } from "./case.js";

const INTENT_SENTINEL = "https://cryppit.github.io/intent-sentinel/";

/** A case for an ID that another Cryppit tool follows end to end: nothing is sent from here. */
function handOff(input, now) {
  const title = input.kind === "omni-transfer" ? "An Omni bridge transfer" : input.kind === "near-account" ? "A NEAR account" : "An ID from another chain";
  return {
    case: {
      title,
      evidence: "Unknown",
      lines: ["Intent Sentinel follows swaps and bridge transfers across 31 chains, step by step. Copy the ID and paste it there."],
      links: [{ label: "Open Intent Sentinel", url: INTENT_SENTINEL }],
      next: { party: "you", text: "Paste the same ID into Intent Sentinel." },
      canCheckRoutes: false,
      copy: input.value,
      message: `Hello, I'm trying to find my ZEC.\nID: ${input.value}\nChecked ${now} with Where's My ZEC.`,
    },
  };
}

export async function check(raw, { fetchImpl = fetch, now, acceptance, onStep = () => {} } = {}) {
  const input = readInput(raw);
  if (input.refused) return { refused: input.refused };
  if (input.error) return { error: input.error };
  if (input.kind === "zcash-address") {
    return { input, case: caseForAddress({ address: readAddress(input.value), acceptance: acceptance?.rows ?? [], now }) };
  }
  if (input.kind !== "zcash-txid") return { input, ...handOff(input, now) };

  const txid = input.value;
  onStep("Reading the Zcash chain…");
  const tx = await fetchTx(txid, fetchImpl);
  const memo = tx && Array.isArray(tx.outputs) && tx.height !== null ? thorchainMemo(tx.outputs) : null;
  if (memo) onStep("It's a THORChain swap. Asking THORChain's records…");
  const thorchain = memo ? await fetchThorchain(txid, fetchImpl) : undefined;
  return { input, tx, case: caseForTx({ txid, tx, thorchain, now }) };
}

/** The button: ask the Omni bridge's records about this transaction's transparent outputs. */
export async function checkRoutes(prev, { fetchImpl = fetch, now } = {}) {
  const txid = prev.input.value;
  let omni = await fetchOmniDeposits(txid, prev.tx.outputs, fetchImpl);
  // A deposit's refund deadline comes from NEAR's Zcash light client: read it only once a deposit is found.
  if (omni.state === "deposit" && Number.isInteger(prev.tx.height)) {
    const client = await fetchZcashLightClient(fetchImpl);
    omni = { ...omni, refund: client.busy ? { busy: true } : refundWindow(prev.tx.height, client) };
  }
  return { ...prev, omni, case: caseForTx({ txid, tx: prev.tx, omni, now }) };
}
