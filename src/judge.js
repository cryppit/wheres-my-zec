// Ported from cryppit/shield-receipt src/judge.ts (MIT, Cryppit) by stripping its TypeScript types; logic unchanged.
// Where a withdrawal landed, from the transaction and the address someone gave. The chain shows a transparent payment
// to the address's script directly; for a shielded payment it shows only which pool value went into (and how much,
// net, when it came from outside the pool), never who received it, so that is all a shielded verdict claims.

const canReceive = (addr, pool) =>
  addr === null || (pool === "sapling" ? addr.shielded.sapling : addr.shielded.orchard);
const hasShieldedReceiver = (addr) => addr.shielded.sapling || addr.shielded.orchard;

/**
 * How one pool took part. Value entering (balance below zero) is a landing, from another pool whose balance is above
 * zero if there is one, else from transparent inputs. A pool whose balance is above zero paid out: if nothing else
 * received value (no transparent outputs, no other pool taking value in), it can only have paid within itself, so it
 * is a shielded-to-shielded landing with the fee as its balance; otherwise the chain can't tell whether it also made
 * shielded outputs.
 */
function role(p, tx) {
  if (p.actions === 0 || !p.outputsEnabled) return null;
  const others = tx.pools.filter((o) => o !== p);
  if (p.valueBalanceZat < 0) {
    const source = others.find((o) => o.valueBalanceZat > 0);
    return { landing: { pool: p.pool, amountZat: -p.valueBalanceZat, from: source ? source.pool : "transparent" } };
  }
  const elsewhere = tx.outputs.length > 0 || others.some((o) => o.valueBalanceZat < 0);
  return elsewhere ? { unclear: p.pool } : { landing: { pool: p.pool, amountZat: null, from: null } };
}

/** `addr` null is the share-link view: pool facts only. */
export function judge(tx, addr) {
  const script = addr?.transparentScript;
  const match = script ? tx.outputs.find((o) => o.scriptHex === script) : undefined;
  if (match && addr) return { kind: "transparent", output: { n: match.n, valueZat: match.valueZat }, couldShield: hasShieldedReceiver(addr) };
  if (tx.sprout) return { kind: "unsupported", reason: "sprout" };
  if (tx.coinbase) return { kind: "unsupported", reason: "coinbase" };

  const parts = [];
  const unclear = [];
  for (const p of tx.pools) {
    if (!canReceive(addr, p.pool)) continue;
    const r = role(p, tx);
    if (r && "landing" in r) parts.push(r.landing);
    if (r && "unclear" in r) unclear.push(r.unclear);
  }
  // An unknown bundle may pay any shielded receiver, so it counts for any address that has one.
  if (tx.unknownBundles.length > 0 && (addr === null || hasShieldedReceiver(addr))) parts.push({ pool: "unknown", amountZat: null, from: null });
  if (parts.length > 0) return { kind: "shielded", parts };
  if (unclear.length > 0) return { kind: "unclear", pools: unclear };

  if (tx.height === null) return { kind: "mempool" };
  if (addr === null) return { kind: "transparent-only", outputs: tx.outputs.length };
  const movedShielded = tx.pools.some((p) => p.actions > 0) || tx.unknownBundles.length > 0;
  if (!movedShielded) return { kind: "not-paid", reason: "no-match" };
  return { kind: "not-paid", reason: hasShieldedReceiver(addr) ? "pool-mismatch" : "transparent-address" };
}
