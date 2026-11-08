// The "my wallet shows zero" flow: pick what happened, then the wallet, then see the causes that match.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { SITUATIONS, walletsFor, causesFor } from "../src/restore.js";

const rows = [
  { id: "change", situation: "restored", wallets: ["Zodl", "Zkool"] },
  { id: "cake", situation: "restored", wallets: ["Zodl", "Cake Wallet"] },
  { id: "ywallet", situation: "after-update", wallets: ["YWallet"] },
  { id: "branch", situation: "send-failed", wallets: ["Trust Wallet", "Ledger Nano S"] },
];
const real = JSON.parse(readFileSync(new URL("../data/restore.json", import.meta.url), "utf8")).rows;

test("there are four situations, each with a title and a short line", () => {
  assert.deepEqual(SITUATIONS.map((s) => s.id), ["restored", "after-update", "send-failed", "old-funds"]);
  for (const s of SITUATIONS) assert.ok(s.title && s.line, s.id);
});

test("every cause in the table belongs to one of the situations", () => {
  const ids = new Set(SITUATIONS.map((s) => s.id));
  for (const r of real) assert.ok(ids.has(r.situation), `${r.id}: ${r.situation}`);
  for (const s of SITUATIONS) assert.ok(real.some((r) => r.situation === s.id), `no cause for ${s.id}`);
});

test("the wallets offered are only those with a cause in that situation, once each, sorted", () => {
  assert.deepEqual(walletsFor(rows, "restored"), ["Cake Wallet", "Zkool", "Zodl"]);
  assert.deepEqual(walletsFor(rows, "after-update"), ["YWallet"]);
});

test("the causes shown match the situation and the wallet; 'not sure' shows every cause in the situation", () => {
  assert.deepEqual(causesFor(rows, "restored", "Zkool").map((r) => r.id), ["change"]);
  assert.deepEqual(causesFor(rows, "restored", "Zodl").map((r) => r.id), ["change", "cake"]);
  assert.deepEqual(causesFor(rows, "restored", null).map((r) => r.id), ["change", "cake"]);
  assert.deepEqual(causesFor(rows, "send-failed", "Zodl"), []);
});

import { badgeFor } from "../src/restore.js";

test("a cause from the wallet's own guide says so", () => {
  assert.deepEqual(badgeFor({ sourceKind: "official" }), { level: "official", label: "From the wallet's own guide" });
});

test("a users' report confirmed by an official second source says both", () => {
  assert.deepEqual(badgeFor({ sourceKind: "forum", confirmedBy: { url: "https://github.com/x/y/issues/1", kind: "official" } }), {
    level: "confirmed",
    label: "Reported by users · confirmed by the wallet's code or docs",
  });
});

test("a users' report with no official second source is marked not yet confirmed", () => {
  assert.deepEqual(badgeFor({ sourceKind: "forum" }), { level: "reported", label: "Reported by users, not yet confirmed" });
  assert.deepEqual(badgeFor({ sourceKind: "forum", confirmedBy: { url: "https://example.org", kind: "secondary" } }), { level: "reported", label: "Reported by users, not yet confirmed" });
  assert.deepEqual(badgeFor({ sourceKind: "secondary" }), { level: "reported", label: "Reported by users, not yet confirmed" });
});

test("every row in the table gets a badge, and any second source is an https link", () => {
  for (const r of real) {
    assert.ok(["official", "confirmed", "reported"].includes(badgeFor(r).level), r.id);
    if (r.confirmedBy) assert.match(r.confirmedBy.url, /^https:\/\//, r.id);
  }
});
