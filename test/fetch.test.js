// Ported from cryppit/shield-receipt test/fetch.test.ts (MIT, Cryppit); unchanged apart from removed types.
// extractTxid and fetchTx, with a stub in place of fetch serving recorded Blockchair responses.
import { describe, expect, it } from "./expect.js";

import { extractTxid, fetchTx } from "../src/fetch.js";
import { fixture } from "./fixtures.js";

const TXID = "32cae18d461899d6da39507a7ab35c70796310885b6a1003f4712e9fd1d0c976";

describe("extractTxid", () => {
  it("takes a bare txid, trimmed and lowercased", () => {
    expect(extractTxid(` ${TXID.toUpperCase()}\n`)).toBe(TXID);
  });

  it("takes the txid out of an explorer link", () => {
    expect(extractTxid(`https://blockchair.com/zcash/transaction/${TXID}`)).toBe(TXID);
    expect(extractTxid(`https://zecblock.com/tx/${TXID}?tab=raw`)).toBe(TXID);
  });

  it("rejects anything without exactly one 64-character hex run", () => {
    expect(extractTxid(TXID.slice(1))).toBeNull();
    expect(extractTxid(`${TXID}0`)).toBeNull();
    expect(extractTxid("hello")).toBeNull();
  });
});

                                                    
const stub = (respond) => {
  const urls = [];
  return { urls, fetch: (async (input) => { const url = String(input); urls.push(url); return respond(url); }) };
};
const json = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

describe("fetchTx", () => {
  it("reads a found transaction from the raw and dashboard endpoints, sending only the txid", async () => {
    const f = fixture("ironwood-from-transparent");
    const s = stub((url) => json(url.includes("/raw/") ? f.raw : f.dashboard));
    const result = await fetchTx(TXID, s.fetch);
    expect(result).toMatchObject({ txid: TXID, height: 3535729 });
    expect(s.urls.sort()).toEqual([
      `https://api.blockchair.com/zcash/dashboards/transaction/${TXID}`,
      `https://api.blockchair.com/zcash/raw/transaction/${TXID}`,
    ]);
  });

  it("says not found when Blockchair has no such transaction", async () => {
    const f = fixture("not-found");
    expect(await fetchTx(TXID, stub((url) => json(url.includes("/raw/") ? f.raw : f.dashboard)).fetch)).toEqual({ notFound: true });
  });

  it.each([402, 429, 430, 435, 503])("calls HTTP %i busy, never not found", async (status) => {
    expect(await fetchTx(TXID, stub(() => json({}, status)).fetch)).toEqual({ busy: true });
  });

  it("calls an error inside a 200 response busy", async () => {
    expect(await fetchTx(TXID, stub(() => json({ data: null, context: { code: 430, error: "limit" } })).fetch)).toEqual({ busy: true });
  });

  it("calls a network failure busy", async () => {
    expect(await fetchTx(TXID, stub(() => { throw new TypeError("Failed to fetch"); }).fetch)).toEqual({ busy: true });
  });

  it("reports a response that is not JSON as an error", async () => {
    expect(await fetchTx(TXID, stub(() => new Response("<html>", { status: 200 })).fetch)).toEqual({ error: "Blockchair sent a response this page can't read" });
  });
});
