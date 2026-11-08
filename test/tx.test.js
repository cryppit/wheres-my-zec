// Ported from cryppit/shield-receipt test/tx.test.ts (MIT, Cryppit); unchanged apart from removed types.
// readBlockchairTx on recorded mainnet transactions (blocks 3,535,673 to 3,535,729, recorded 30 Oct 2026).
import { describe, expect, it } from "./expect.js";

import { readBlockchairTx } from "../src/tx.js";
import { edited, fixture } from "./fixtures.js";

const read = (f) => {
  const r = readBlockchairTx(f.raw, f.dashboard, f.txid);
  if ("notFound" in r || "undecoded" in r) throw new Error("fixture not read");
  return r;
};

describe("readBlockchairTx", () => {
  it("reads an Ironwood payment from a transparent wallet", () => {
    const tx = read(fixture("ironwood-from-transparent"));
    expect(tx.height).toBe(3535729);
    expect(tx.time).toBe("2026-10-30T09:44:39Z");
    expect(tx.outputs).toEqual([{ n: 0, scriptHex: "76a91413bbd8bc8df03a5a9cda88103f583aa8bc043e2488ac", valueZat: 22490026931, address: "t1KfwsnwJeNRVjQGBDZhwKskpQbih2qx5Ua" }]);
    expect(tx.pools).toEqual([{ pool: "ironwood", actions: 1, valueBalanceZat: -16826521, outputsEnabled: true }]);
    expect(tx).toMatchObject({ unknownBundles: [], sprout: false, coinbase: false });
  });

  it("reads a Sapling payment from its outputs and the top-level value balance", () => {
    const tx = read(fixture("sapling-payout"));
    expect(tx.pools).toEqual([expect.objectContaining({ pool: "sapling", valueBalanceZat: -125045000 })]);
    expect(tx.pools[0].actions).toBeGreaterThan(0);
  });

  it("reads a shielded-only Orchard transfer", () => {
    const tx = read(fixture("orchard-shielded-only"));
    expect(tx.outputs).toEqual([]);
    expect(tx.pools).toEqual([{ pool: "orchard", actions: 16, valueBalanceZat: 80000, outputsEnabled: true }]);
  });

  it("reads every output of a batch payment", () => {
    expect(read(fixture("p2sh-batch")).outputs).toHaveLength(41);
    expect(read(fixture("transparent-batch")).outputs).toHaveLength(4);
  });

  it("says when a transaction is not found", () => {
    const f = fixture("not-found");
    expect(readBlockchairTx(f.raw, f.dashboard, f.txid)).toEqual({ notFound: true });
  });

  it("says when Blockchair has the transaction but can't decode it (for example a new format after an upgrade)", () => {
    const f = fixture("ironwood-from-transparent");
    const raw = { data: { [f.txid]: { raw_transaction: "0600…" } }, context: { code: 200 } };
    expect(readBlockchairTx(raw, f.dashboard, f.txid)).toEqual({ undecoded: true });
  });

  it("gives a mempool transaction no height (synthetic: block_id -1)", () => {
    const tx = read(edited("ironwood-from-transparent", (_tx, dash) => { dash.block_id = -1; }));
    expect(tx.height).toBeNull();
  });

  it("lists a shielded bundle it does not know (synthetic: a post-NU7 bundle)", () => {
    const tx = read(edited("ironwood-from-transparent", (t) => { t.zfuture = { actions: [{}], valueBalanceZat: -5 }; }));
    expect(tx.unknownBundles).toEqual(["zfuture"]);
  });

  it("flags Sprout and coinbase transactions (synthetic)", () => {
    expect(read(edited("transparent-batch", (t) => { t.vjoinsplit = [{}]; })).sprout).toBe(true);
    expect(read(edited("transparent-batch", (t, dash) => { t.vin = [{ coinbase: "" }]; dash.is_coinbase = true; })).coinbase).toBe(true);
  });
});
