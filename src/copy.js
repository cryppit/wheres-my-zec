// Ported from cryppit/shield-receipt src/copy.ts (MIT, Cryppit) by stripping its TypeScript types.
// The words for each verdict: short sentences that say what the chain shows. A shielded landing names the pool, never
// who received it; nothing here calls a payment hidden or private, and nothing says "not paid" without an address.
                                                       

const POOL_NAME = { ironwood: "Ironwood", orchard: "Orchard", sapling: "Sapling" } ;

/** Zatoshis as ZEC, up to 8 decimals, trailing zeros dropped. */
export function formatZec(zat) {
  const whole = Math.floor(zat / 1e8);
  const frac = String(zat % 1e8).padStart(8, "0").replace(/0+$/, "");
  return frac ? `${whole}.${frac}` : String(whole);
}

const joinAnd = (names) => (names.length <= 1 ? (names[0] ?? "") : `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`);
const SAME_WITHDRAWAL = "Check that the txid and the address come from the same withdrawal.";

function partLine(p) {
  const pool = p.pool === "unknown" ? "a pool this page doesn't know yet" : `the ${POOL_NAME[p.pool]} pool`;
  if (p.amountZat === null) {
    const name = p.pool === "unknown" ? "A pool this page doesn't know yet" : `The ${POOL_NAME[p.pool]} pool`;
    return `${name} received a payment in this transaction. The amount isn't visible because it was sent from a shielded wallet.`;
  }
  const amount = formatZec(p.amountZat);
  if (p.from && p.from !== "transparent") return `${amount} ZEC net moved into ${pool} from the ${POOL_NAME[p.from]} pool in this transaction.`;
  return `${amount} ZEC net went into ${pool} in this transaction. The amount is visible because it came from a transparent address.`;
}

export function describe(v, ctx) {
  const who = ctx.exchange?.trim() || undefined;
  switch (v.kind) {
    case "transparent":
      return {
        title: who ? `${who} paid your transparent address` : "Paid to your transparent address",
        lines: [
          `Output ${v.output.n} sent ${formatZec(v.output.valueZat)} ZEC to ${v.couldShield ? "the transparent part of the address you gave" : "the address you gave"}. The amount and address of a transparent payment are public.`,
          v.couldShield
            ? "Your address could take shielded ZEC, but this payment used its transparent part."
            : "The address you gave is transparent, so this is the only way it could be paid.",
        ],
      };
    case "shielded": {
      const known = v.parts.filter((p) => p.pool !== "unknown").map((p) => POOL_NAME[p.pool]);
      const where = known.length === 0
        ? "in a pool this page doesn't know yet"
        : `in the ${joinAnd(known)} pool${known.length > 1 ? "s" : ""}${v.parts.length > known.length ? " and a pool this page doesn't know yet" : ""}`;
      const lines = v.parts.map(partLine);
      lines.push(ctx.addressGiven
        ? "No transparent output paid your address. The chain doesn't show who received a shielded payment: your wallet will show whether it was yours."
        : "This shows where the transaction's value went, not who received it.");
      return { title: `${who ? `${who}'s payment landed shielded` : "Landed shielded"}, ${where}`, lines };
    }
    case "unclear": {
      const pools = joinAnd(v.pools.map((p) => `the ${POOL_NAME[p]} pool`));
      return {
        title: "The chain can't tell",
        lines: [
          ...(ctx.addressGiven ? ["No transparent output pays the address you gave."] : []),
          `This transaction spent ZEC from ${pools} to other outputs. It may also have made shielded outputs, which the chain doesn't show.`,
          ctx.addressGiven ? "Your wallet will show whether it received anything." : "Add the address you gave to rule out a transparent payment.",
        ],
      };
    }
    case "transparent-only":
      return {
        title: "No shielded pool received value",
        lines: [`This transaction paid ${v.outputs} transparent output${v.outputs === 1 ? "" : "s"}. Add the address you gave to see whether one of them was yours.`],
      };
    case "not-paid": {
      const lines = {
        "no-match": ["No output of this transaction pays the address you gave, and it moved no shielded value.", SAME_WITHDRAWAL],
        "transparent-address": ["No output of this transaction pays the address you gave. It moved shielded value, but a transparent address can't receive shielded ZEC.", SAME_WITHDRAWAL],
        "pool-mismatch": ["This transaction moved shielded value, but only into pools the address you gave has no receiver for.", SAME_WITHDRAWAL],
      }[v.reason];
      return { title: "Not paid to this address", lines };
    }
    case "unsupported":
      return v.reason === "sprout"
        ? { title: "This page doesn't read Sprout", lines: ["This transaction uses the old Sprout pool, which this page doesn't read."] }
        : { title: "A mining reward", lines: ["This is a mining reward (coinbase), not a withdrawal."] };
    case "mempool":
      return { title: "Not confirmed yet", lines: ["This transaction is still waiting for a block. Check again after it confirms; a Zcash block takes about 25 seconds since the NU7 upgrade."] };
  }
}
