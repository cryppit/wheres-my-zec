// What an address can receive, ported from Shield Receipt's tests (cryppit/shield-receipt, MIT), plus the send advice
// Where's My ZEC shows. Unified addresses come from the zcash-test-vectors subset in fixtures/zip316-vectors.json.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { readAddress } from "../src/address.js";
import { classifyZcashAddress, zcashSendAdvice } from "../src/zcash-address.js";

const vectors = JSON.parse(readFileSync(new URL("./fixtures/zip316-vectors.json", import.meta.url), "utf8")).unified;
const mainnet = vectors.filter((v) => v.address.startsWith("u1"));
const transparentAndOrchard = mainnet.find((v) => v.p2pkh && v.orchard && !v.sapling);
const shieldedOnly = mainnet.find((v) => !v.p2pkh && !v.p2sh && v.sapling && v.orchard);

// ZIP 320's example pair: the TEX address and the P2PKH address it encodes.
const T1 = "t1VmmGiyjVNeCjxDZzg7vZmd99WyzVby9yC";
const TEX = "tex1s2rt77ggv6q989lr49rkgzmh5slsksa9khdgte";
const T1_SCRIPT = "76a9148286bf790866805397e3a947640b77a43f0b43a588ac";
const ZS = "zs1mrhc9y7jdh5r9ece8u5khgvj9kg0zgkxzdduyv0whkg7lkcrkx5xqem3e48avjq9wn2rukydkwn";
const pick = (o, keys) => Object.fromEntries(keys.map((k) => [k, o[k]]));

test("a t1 address gives its P2PKH script and no shielded receiver", () => {
  const a = readAddress(T1);
  assert.deepEqual(pick(a, ["kind", "network", "valid", "transparentScript"]), { kind: "p2pkh", network: "main", valid: true, transparentScript: T1_SCRIPT });
  assert.deepEqual(a.shielded, { sapling: false, orchard: false });
});

test("a TEX address gives the same script as the t1 address it encodes", () => {
  assert.deepEqual(pick(readAddress(TEX), ["kind", "valid", "transparentScript"]), { kind: "tex", valid: true, transparentScript: T1_SCRIPT });
});

test("a t3 address gives its P2SH script", () => {
  assert.deepEqual(pick(readAddress("t3XAVsEWuV7Pt15MYwNY5qAFTH7sQkk3T5j"), ["kind", "valid", "transparentScript"]), {
    kind: "p2sh", valid: true, transparentScript: "a9148a3a2c1c4b5e6d7f8091a2b3c4d5e6f708192a3b87",
  });
});

test("a unified address takes its script from its P2PKH item and sees its Orchard receiver", () => {
  const a = readAddress(transparentAndOrchard.address);
  assert.deepEqual(pick(a, ["kind", "network", "valid", "transparentScript"]), {
    kind: "unified", network: "main", valid: true, transparentScript: `76a914${transparentAndOrchard.p2pkh}88ac`,
  });
  assert.deepEqual(a.shielded, { sapling: false, orchard: true });
});

test("a unified address with no transparent item has no script", () => {
  const a = readAddress(shieldedOnly.address);
  assert.equal(a.transparentScript, null);
  assert.deepEqual(a.shielded, { sapling: true, orchard: true });
});

test("a Sapling address has its receiver and no script", () => {
  const a = readAddress(ZS);
  assert.deepEqual(pick(a, ["kind", "valid", "transparentScript"]), { kind: "sapling", valid: true, transparentScript: null });
  assert.deepEqual(a.shielded, { sapling: true, orchard: false });
});

test("a testnet address is named as testnet", () => {
  assert.deepEqual(pick(readAddress("textest1qyqszqgpqyqszqgpqyqszqgpqyqszqgpfcjgfy"), ["kind", "network", "valid"]), { kind: "tex", network: "test", valid: true });
});

test("spaces and line breaks pasted around or inside an address are dropped", () => {
  assert.equal(readAddress(`  ${T1}\n`).transparentScript, T1_SCRIPT);
  const a = transparentAndOrchard.address;
  const r = readAddress(`${a.slice(0, 60)}\n${a.slice(60, 120)} ${a.slice(120)}`);
  assert.equal(r.input, a);
  assert.equal(r.valid, true);
});

test("something that isn't an address is invalid, with no script and no receivers", () => {
  const a = readAddress("hello");
  assert.equal(a.valid, false);
  assert.equal(a.transparentScript, null);
  assert.deepEqual(a.shielded, { sapling: false, orchard: false });
});

test("one wrong character fails the checksum", () => {
  const bad = T1.slice(0, -1) + (T1.at(-1) === "C" ? "D" : "C");
  assert.equal(readAddress(bad).valid, false);
});

test("send advice: TEX is paid only from transparent funds, Sapling only from shielded", () => {
  const tex = zcashSendAdvice(classifyZcashAddress(TEX));
  assert.equal(tex.transparent.can, "if-supported");
  assert.equal(tex.shielded.can, "no");
  const zs = zcashSendAdvice(classifyZcashAddress(ZS));
  assert.equal(zs.transparent.can, "no");
  assert.equal(zs.shielded.can, "yes");
});
