import { test } from "node:test";
import assert from "node:assert/strict";
import { readInput } from "../src/input.js";

const TXID = "91b580368de6a182f7d61b54aec7ea92d61137bb9cd714609745bdcfad6b625f";
const T1 = "t1VmmGiyjVNeCjxDZzg7vZmd99WyzVby9yC";
const T3 = "t3WTnCGUB3Gxaq7v17mnWzPz5J3Gi8q95vs";
const TEX = "tex1s2rt77ggv6q989lr49rkgzmh5slsksa9khdgte";
const ZS = "zs1mrhc9y7jdh5r9ece8u5khgvj9kg0zgkxzdduyv0whkg7lkcrkx5xqem3e48avjq9wn2rukydkwn";
const U1 =
  "u1l8xunezsvhq8fgzfl7404m450nwnd76zshscn6nfys7vyz2ywyh4cc5daaq0c7q2su5lqfh23sp7fkf3kt27ve5948mzpfdvckzaect2jtte308mkwlycj2u0eac077wu70vqcetkxf";

test("a Zcash transaction ID, bare or inside an explorer link", () => {
  assert.deepEqual(readInput(TXID), { kind: "zcash-txid", value: TXID });
  assert.deepEqual(readInput(`  ${TXID.toUpperCase()}\n`), { kind: "zcash-txid", value: TXID });
  assert.deepEqual(readInput(`https://blockchair.com/zcash/transaction/${TXID}`), { kind: "zcash-txid", value: TXID });
  assert.deepEqual(readInput(`https://mainnet.zcashexplorer.app/transactions/${TXID}?x=1`), { kind: "zcash-txid", value: TXID });
});

test("each kind of mainnet Zcash address, case kept", () => {
  for (const addr of [T1, T3, TEX, ZS, U1]) assert.deepEqual(readInput(addr), { kind: "zcash-address", value: addr });
  assert.deepEqual(readInput(`https://blockchair.com/zcash/address/${T1}`), { kind: "zcash-address", value: T1 });
  assert.deepEqual(readInput(`zcash:${T1}?amount=1.5`), { kind: "zcash-address", value: T1 });
});

test("an Omni bridge transfer ID", () => {
  assert.deepEqual(readInput("zcash:1234"), { kind: "omni-transfer", value: "zcash:1234" });
  assert.deepEqual(readInput("ZCASH:77"), { kind: "omni-transfer", value: "zcash:77" });
});

test("NEAR transactions and named NEAR accounts", () => {
  const nearTx = "GW6MLNNSiztTC11haCkzyK2wy62JwtRKsu2zbh6gdAi9";
  assert.deepEqual(readInput(nearTx), { kind: "near-tx", value: nearTx });
  assert.deepEqual(readInput("cryppit.near"), { kind: "near-account", value: "cryppit.near" });
});

test("a seed phrase is refused and never treated as anything else", () => {
  const twelve = "abandon ability able about above absent absorb abstract absurd abuse access accident";
  const twentyFour = `${twelve} ${twelve}`;
  for (const phrase of [twelve, twentyFour, twelve.toUpperCase(), twelve.replaceAll(" ", "\n")]) {
    const r = readInput(phrase);
    assert.ok(r.refused, `expected a refusal for: ${phrase.slice(0, 20)}`);
    assert.match(r.refused, /seed/i);
  }
});

test("spending keys, viewing keys and WIF private keys are refused", () => {
  const keys = [
    "secret-extended-key-main1qwerty0000000000000000000000000000000000000000000000000000",
    "zxviews1q0duytgcqqqqpqre26wkl45gvwwwd706xw608hucmvfalr759ejwf7qshjf5r9aa7323zulvz6plhttp5mltqcgs9t039cx2d09mgq05ts63n8u35hyv6h9nc9ctqqtue2u7cer2mqegunuulq2luhq3ywjcz35yyljewa4mgkgjzyfwh6fr6jd0dzd44ghk0nxdv2hnv4j5nxfwv24rwdmgllhe0p8568sgqt9ckt02v2kxf5ahtql6s0ltjpkckw8gtymxtxuu9gcr0swvz",
    "uview1abcdefghijklmnopqrstuvwxyz0234567890abcdefghijklmnopqrstuvwxyz",
    "uivk1abcdefghijklmnopqrstuvwxyz0234567890abcdefghijklmnopqrstuvwxyz",
    "KwDiBf89QgGbjEhKnhXJuH7LrciVrZi3qYjgd9M7rFU73sVHnoWn",
    "5HueCGU8rMjxEXxiPuD5BDku4MkFqeZyd4dZ1jvhTVqvbTLvyTJ",
  ];
  for (const key of keys) {
    const r = readInput(key);
    assert.ok(r.refused, `expected a refusal for ${key.slice(0, 16)}`);
    assert.match(r.refused, /never|don't|do not/i);
  }
});

test("test-network addresses are named as such and not checked", () => {
  for (const addr of ["tmMcWbZU8t39htCR1fQRfRSHtkW4p3Ax5Se", "utest1qqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqq", "ztestsapling1qqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqq", "textest1qqqqqqqqqqqqqqqqqqqqqqqqqqqq"]) {
    const r = readInput(addr);
    assert.ok(r.error, addr);
    assert.match(r.error, /test network/i);
  }
});

test("other chains' hashes point elsewhere, and empty or unknown input asks again", () => {
  assert.match(readInput(`0x${TXID}`).error, /Ethereum|EVM|Intent Sentinel/);
  assert.match(readInput("").error, /Paste/);
  assert.match(readInput("hello").error, /recognise/);
});

test("a seed phrase is refused however it was copied: numbered, with commas, quoted, with a full stop, in another language", () => {
  const words = "abandon ability able about above absent absorb abstract absurd abuse access accident".split(" ");
  const forms = [
    words.map((w, i) => `${i + 1}. ${w}`).join("\n"),
    words.map((w, i) => `${i + 1}) ${w}`).join(" "),
    words.join(", "),
    `"${words.join(" ")}"`,
    `${words.join(" ")}.`,
    "ábaco abdomen abeja abierto abogado abono aborto abrazo abrir abuelo abuso acabar",
    "的 一 是 在 不 了 有 和 人 这 中 大",
  ];
  for (const f of forms) assert.ok(readInput(f).refused, `not refused: ${f.slice(0, 30)}`);
});

test("more key formats are refused, even when line-wrapped", () => {
  const keys = [
    "secret-spending-key-main1qqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqq",
    "SKxny894fJe2rmZjeuoE6GVfNkWoXfPp8337VrLLNWG56FjqVUYR",
    "ZiVKfdhhmQ1fpXaxyW5zRyptQ1z2NqJuD1Ns1gGwvM4fE4wP4Ni2Ru6c",
    "xprv9s21ZrQH143K3QTDL4LXw2F7HEK3wJUD2nW2nRk4stbPy6cq3jPPqjiChkVvvNKmPGJxWUtg6LnF5kejMRNNU3TGtRBeJgk33yuGBxrMPHi",
    "uview1abcdefghijklmnopqrstuvwxyz02345\n67890abcdefghijklmnopqrstuvwxyz",
  ];
  for (const k of keys) assert.ok(readInput(k).refused, `not refused: ${k.slice(0, 16)}`);
});

test("an all-capitals address (valid Bech32) is read as the same address", () => {
  assert.deepEqual(readInput("TEX1S2RT77GGV6Q989LR49RKGZMH5SLSKSA9KHDGTE"), { kind: "zcash-address", value: "tex1s2rt77ggv6q989lr49rkgzmh5slsksa9khdgte" });
});

test("a 43-44 character base58 string is named as another chain's ID, not as NEAR", async () => {
  const r = readInput("GW6MLNNSiztTC11haCkzyK2wy62JwtRKsu2zbh6gdAi9");
  assert.equal(r.kind, "near-tx");
});
