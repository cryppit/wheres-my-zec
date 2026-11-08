// Filtering the "my wallet shows zero" table by the wallets someone picks.
import { test } from "node:test";
import assert from "node:assert/strict";
import { matchRestore, walletsIn } from "../src/restore.js";

const rows = [
  { id: "change", wallets: ["Zodl", "Zkool"] },
  { id: "ywallet", wallets: ["YWallet"] },
  { id: "snap", wallets: ["MetaMask Snap"] },
  { id: "trust", wallets: ["Trust Wallet", "Zodl"] },
];

test("every wallet named in the table, once, sorted", () => {
  assert.deepEqual(walletsIn(rows), ["MetaMask Snap", "Trust Wallet", "YWallet", "Zkool", "Zodl"]);
});

test("no pick shows every cause", () => {
  assert.equal(matchRestore(rows, "", "").length, 4);
});

test("one pick shows the causes that name that wallet", () => {
  assert.deepEqual(matchRestore(rows, "", "Zodl").map((r) => r.id), ["change", "trust"]);
  assert.deepEqual(matchRestore(rows, "YWallet", "").map((r) => r.id), ["ywallet"]);
});

test("two picks put the causes naming both wallets first", () => {
  assert.deepEqual(matchRestore(rows, "Trust Wallet", "Zodl").map((r) => r.id), ["trust", "change"]);
});
