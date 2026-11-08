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

test("Keystone advice never sends people to firmware that rejects Zodl's large signing requests (3.1.x and 3.2.0, KeystoneHQ/keystone3-firmware#2294)", () => {
  const old = real.find((r) => r.id === "keystone-old-firmware-ironwood");
  assert.match(old.advice, /3\.1|3\.2/, "the update advice must warn about 3.1.x / 3.2.0");
  const qr = real.find((r) => r.id === "keystone-invalid-qr-large-pczt");
  assert.ok(qr, "a cause for 'Invalid QR Code' on large Zodl requests");
  assert.equal(qr.situation, "send-failed");
  assert.deepEqual(qr.wallets, ["Keystone", "Zodl"]);
  assert.match(qr.source, /keystone3-firmware\/issues\/2294$/);
  assert.equal(qr.sourceKind, "secondary");
});

test("the causes found on the forum on 9 Nov are in the table, and their advice keeps seeds safe", () => {
  const ids = ["ledger-zondax-sapling-after-nu7", "ledger-mobile-old-coins-unsupported-version", "pre-sapling-birthday-refused", "exchange-held-shielded-deposit", "zecwallet-lite-abandoned", "legacy-sapling-key-zallet-import", "pay-recipient-sent-funds-back", "zodl-sync-stuck-partway", "cake-disposable-taddress-restore"];
  for (const id of ids) assert.ok(real.some((r) => r.id === id), `${id} is missing`);
  const byId = Object.fromEntries(real.map((r) => [r.id, r]));
  // zecwallet-cli's flag is --nosync and it still dials its dead server first: we don't tell people to use it.
  assert.doesNotMatch(byId["zecwallet-lite-abandoned"].advice, /--no-?sync/);
  // Typing a Ledger's 24 words into a hot wallet exposes every coin on that Ledger: say to move the rest first.
  assert.match(byId["ledger-zondax-sapling-after-nu7"].advice, /different recovery phrase/);
  // No promise on Cake's behalf that the issue never made.
  assert.doesNotMatch(byId["cake-disposable-taddress-restore"].advice, /team has said/);
});

test("Argos is a rescue tool we point to, not a wallet someone picks as theirs", () => {
  assert.ok(!walletsFor(real, "old-funds").includes("Argos"));
  assert.ok(real.every((r) => !r.wallets.includes("Argos")));
});
