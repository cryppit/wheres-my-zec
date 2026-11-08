// The case file: where the ZEC is, how we know (one evidence word), who acts next, and a message to send them. Built
// only from facts the other modules gathered; nothing here touches the network. The message carries only what the
// person pasted and what the public records show.
import { judge } from "./judge.js";
import { describe as landingWords, formatZec } from "./copy.js";
import { classifyZcashAddress, describeZcashAddress, zcashSendAdvice } from "./zcash-address.js";

const SITE = "https://cryppit.github.io/wheres-my-zec/";
const ADDRESS_OPENER = "Hello, I have a question about a Zcash address.";
const INTENT_SENTINEL = "https://cryppit.github.io/intent-sentinel/";
const explorer = (txid) => ({ label: "See it on Blockchair", url: `https://blockchair.com/zcash/transaction/${txid}` });
const CHAINS = {
  BSC: "BNB Chain", ETH: "Ethereum", BTC: "Bitcoin", BASE: "Base", AVAX: "Avalanche", GAIA: "Cosmos Hub", SOL: "Solana",
  TRON: "Tron", XRP: "the XRP Ledger", DOGE: "Dogecoin", LTC: "Litecoin", BCH: "Bitcoin Cash", THOR: "THORChain", ZEC: "Zcash",
};

/** THORChain amounts are in units of 1e-8 for every asset; "BSC.USDT-0X55…" is USDT on BNB Chain. */
function thorAmount(amount, asset) {
  const [chain, rest = ""] = String(asset).split(".");
  const symbol = rest.split("-")[0] || chain;
  return `${formatZec(Number(amount))} ${symbol} on ${CHAINS[chain] ?? chain}`;
}

function finish(c, ref, now, opener = "Hello, I'm trying to find my ZEC.") {
  const message = [
    opener,
    ref,
    `What the records show: ${c.title}.`,
    ...c.lines.slice(0, 2),
    `Checked ${now} with Where's My ZEC (keyless, read-only): ${SITE}`,
  ].join("\n");
  return { links: [], canCheckRoutes: false, ...c, message };
}

function thorchainCase(o) {
  const nobodyCheck = (payout) => ({ party: "nobody", text: `Nothing to do. Check the receiving address on ${CHAINS[String(payout?.asset).split(".")[0]] ?? "the other chain"} to see the funds.` });
  const payoutLine = (p) => `${thorAmount(p.amount, p.asset)} went to ${p.address}${p.txid ? ` (payout transaction ${p.txid})` : ""}.`;
  const refundLine = (r) => `${formatZec(r.amountZat)} ZEC went back to ${r.address}${r.txid ? ` (transaction ${r.txid})` : ""}.`;
  const sourceNote = "This is THORChain's own record of the swap.";
  switch (o.state) {
    case "done":
      return { title: "Swapped through THORChain", evidence: "Reported", lines: [`THORChain reports the swap finished. ${payoutLine(o.payout)}`, sourceNote], next: nobodyCheck(o.payout) };
    case "partial":
      return {
        title: "Partly swapped through THORChain, the rest sent back",
        evidence: "Reported",
        lines: [o.reason, payoutLine(o.payout), refundLine(o.refund), sourceNote],
        next: { party: "nobody", text: "Nothing to do. Check both addresses: the swapped part on the other chain, the rest in your Zcash wallet." },
      };
    case "refunded":
      return {
        title: "THORChain sent your ZEC back",
        evidence: "Reported",
        lines: [o.reason, refundLine(o.refund), sourceNote],
        next: { party: "nobody", text: "Nothing to do. Your wallet for that address will show the ZEC once it's synced." },
      };
    case "too-small":
      return {
        title: "Too small to send back",
        evidence: "Reported",
        lines: [o.reason, "A deposit smaller than THORChain's fee for sending it back stays with THORChain.", sourceNote],
        next: { party: "nobody", text: "Nobody can return it. Next time, send more than THORChain's minimum for ZEC." },
      };
    case "refund-pending":
      return { title: "THORChain is sending your ZEC back", evidence: "Reported", lines: [o.reason, sourceNote], next: { party: "thorchain", text: "Wait: THORChain has started the refund." } };
    case "pending":
      return {
        title: "Still swapping on THORChain",
        evidence: "Reported",
        lines: ["THORChain has your deposit and the swap isn't finished. Large swaps are done in parts and can take a while.", sourceNote],
        next: { party: "thorchain", text: "Wait, then check again. If it's been many hours, ask in THORChain's community support with this transaction ID." },
      };
    case "not-seen":
      return {
        title: "THORChain has no record of this swap yet",
        evidence: "Unknown",
        lines: [
          "This transaction carries a THORChain swap instruction, but THORChain's records don't show it.",
          "Maya uses the same instructions, and Maya has been halted since 18 Aug 2026, so a swap sent there may be waiting.",
        ],
        next: { party: "thorchain", text: "If it's been more than an hour, ask in THORChain's community support (or Maya's, if you used Maya) with this transaction ID." },
      };
    case "busy":
      return { title: "Couldn't reach THORChain's records", evidence: "Unknown", lines: ["Nothing was decided: the lookup didn't get an answer."], next: { party: "you", text: "Try again in a minute." } };
    default:
      return { title: `THORChain recorded this as "${o.type}"`, evidence: "Reported", lines: [sourceNote], next: { party: "nobody", text: "This wasn't a swap, so there's nothing to chase." } };
  }
}

function omniCase(o) {
  return {
    title: "A deposit into the Omni bridge",
    evidence: "Reported",
    lines: [
      ...o.deposits.map((d) => `Output ${d.vout} paid the bridge's deposit address ${d.address}, for NEAR account ${d.forAccount ?? "(not named)"}${d.via ? ` via ${d.via}` : ""}.`),
      "The Refund Helper checks whether the bridge credited it and, if not, gives the refund steps and the deadline.",
    ],
    links: o.deposits.map((d) => ({ label: `Status and refund steps (output ${d.vout})`, url: d.refundHelper })),
    next: { party: "omni", text: "Open the Refund Helper for this deposit's status and, if it's stuck, the refund steps." },
  };
}

/** The case for a pasted transaction ID. `tx` is fetchTx's answer; `thorchain` and `omni` are route answers, if asked. */
export function caseForTx({ txid, tx, thorchain, omni, now }) {
  const ref = `Transaction: ${txid}`;
  if (!tx || tx.busy || tx.error) {
    return finish({ title: "Couldn't reach the Zcash explorer", evidence: "Unknown", lines: ["Nothing was decided: the lookup didn't get an answer."], next: { party: "you", text: "Try again in a minute." } }, ref, now);
  }
  if (tx.notFound) {
    return finish({
      title: "No Zcash transaction with this ID",
      evidence: "Unknown",
      lines: [
        "The Zcash explorer has no transaction with this ID. Check you copied all of it.",
        "If it's from another chain (Bitcoin, Ethereum, Solana, NEAR), Intent Sentinel follows swaps across 31 chains.",
      ],
      links: [{ label: "Check it in Intent Sentinel", url: INTENT_SENTINEL }],
      next: { party: "you", text: "Copy the ID again, or check it in Intent Sentinel." },
    }, ref, now);
  }
  if (tx.undecoded) {
    return finish({ title: "The explorer has it but can't read it yet", evidence: "Unknown", lines: ["This can happen with a new transaction format after a network upgrade."], links: [explorer(txid)], next: { party: "you", text: "Try again later." } }, ref, now);
  }
  if (tx.height === null) {
    const w = landingWords({ kind: "mempool" }, { addressGiven: false });
    return finish({ title: w.title, evidence: "Proven", lines: w.lines, links: [explorer(txid)], next: { party: "nobody", text: "Wait for a block, then check again." } }, ref, now);
  }

  if (thorchain) return finish({ links: [explorer(txid)], ...thorchainCase(thorchain) }, ref, now);
  if (omni?.state === "deposit") {
    const c = omniCase(omni);
    return finish({ ...c, links: [...c.links, explorer(txid)] }, ref, now);
  }

  const w = landingWords(judge(tx, null), { addressGiven: false });
  const routeNote = omni?.state === "none"
    ? ["The Omni bridge has no deposit at this transaction's addresses."]
    : omni?.state === "busy" ? ["Couldn't reach the Omni bridge's records; try the check again."] : [];
  return finish({
    title: w.title,
    evidence: "Proven",
    lines: [...w.lines, ...routeNote],
    links: [explorer(txid)],
    canCheckRoutes: !omni,
    next: { party: "nobody", text: "The chain shows where this transaction's ZEC went. If your wallet doesn't show it, see \"My wallet shows zero\"." },
  }, ref, now);
}

/** The acceptance table's column for an address. */
export function addressType(facts) {
  switch (facts.kind) {
    case "p2pkh":
    case "p2sh":
      return "transparent";
    case "tex":
      return "tex";
    case "sapling":
      return "sapling";
    case "unified":
      return facts.transparentScript ? "unified" : "unifiedShieldedOnly";
    default:
      return null;
  }
}

/** The case for a pasted address: what it is, who can pay it, and who can't (from the dated table). */
export function caseForAddress({ address, acceptance, now }) {
  const info = classifyZcashAddress(address.input);
  const advice = zcashSendAdvice(info);
  const ref = `Address: ${address.input}`;
  if (!info.valid || info.network !== "main") {
    return finish({ title: advice.next.split(":")[0].replace(/\.$/, ""), evidence: "Proven", lines: [advice.next], next: { party: "you", text: "Copy the address again from where you got it." } }, ref, now, ADDRESS_OPENER);
  }
  const type = addressType(address);
  const by = (v) => (acceptance ?? []).filter((r) => r.sendsTo?.[type] === v).map((r) => r.service);
  const can = by("yes");
  const cant = by("no");
  const unknown = by("unknown");
  const desc = describeZcashAddress(info);
  return finish({
    title: desc.charAt(0).toUpperCase() + desc.slice(1),
    evidence: "Proven",
    lines: [
      advice.next,
      `From a transparent wallet: ${advice.transparent.why}`,
      `From a shielded balance: ${advice.shielded.why}`,
      ...(can.length ? [`Can pay it: ${can.join(", ")}.`] : []),
      ...(cant.length ? [`Can't: ${cant.join(", ")}.`] : []),
      ...(unknown.length ? [`Not checked yet: ${unknown.join(", ")}.`] : []),
    ],
    next: { party: "you", text: "Give this address only to a service that can pay it." },
  }, ref, now, ADDRESS_OPENER);
}
