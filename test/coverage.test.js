// What the page shows about coverage: every exchange and wallet in the dated table, with its logo, what it can pay,
// and its source; and the link a wallet team uses to ask to be added or corrected.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { coverage, addServiceUrl, PAY_TYPES } from "../src/coverage.js";

const rows = JSON.parse(readFileSync(new URL("../data/acceptance.json", import.meta.url), "utf8")).rows;

test("every row in the table appears once, exchanges then wallets, each sorted by name", () => {
  const c = coverage(rows);
  assert.equal(c.items.length, rows.length);
  assert.deepEqual(c.counts, { exchange: rows.filter((r) => r.kind === "exchange").length, wallet: rows.filter((r) => r.kind === "wallet").length });
  const kinds = c.items.map((i) => i.kind);
  assert.deepEqual(kinds, [...kinds].sort());
  const exchanges = c.items.filter((i) => i.kind === "exchange").map((i) => i.name);
  assert.deepEqual(exchanges, [...exchanges].sort((a, b) => a.localeCompare(b)));
});

test("each item says, for every address type, yes, no or not checked, with a short label", () => {
  assert.deepEqual(PAY_TYPES.map((t) => t.key), ["transparent", "tex", "sapling", "unified", "unifiedShieldedOnly"]);
  for (const item of coverage(rows).items) {
    assert.equal(item.pays.length, 5);
    for (const p of item.pays) assert.ok(["yes", "no", "unknown"].includes(p.answer) && p.label, `${item.name}: ${JSON.stringify(p)}`);
    assert.match(item.source, /^https:\/\//);
    assert.ok(item.logo.src || item.logo.mono, item.name);
  }
});

test("Binance and Zodl carry their real logos", () => {
  const byName = Object.fromEntries(coverage(rows).items.map((i) => [i.name, i]));
  assert.equal(byName.Binance.logo.src, "logos/binance.svg");
  assert.equal(byName["Zodl (formerly Zashi)"].logo.src, "logos/zodl.png");
});

test("the add-or-correct link opens our GitHub issue form, prefilled, with nothing private in it", () => {
  assert.equal(addServiceUrl(), "https://github.com/cryppit/wheres-my-zec/issues/new?template=add-or-correct-a-service.yml&title=Add%3A%20");
  assert.equal(addServiceUrl("Gem Wallet"), "https://github.com/cryppit/wheres-my-zec/issues/new?template=add-or-correct-a-service.yml&title=Correct%3A%20Gem%20Wallet");
});

test("the services checked on 9 Nov from their own pages, APIs or code are listed", () => {
  const names = new Set(rows.map((r) => r.service));
  for (const n of ["NEAR Intents (1Click)", "Robinhood", "ChangeNOW", "SwapKit (THORSwap)", "Vizor", "HitBTC", "Atomic Wallet", "Noir Wallet", "LeoDex (Mane)", "Zallet", "Zafu", "zecd", "Konclave"]) {
    assert.ok(names.has(n), `${n} is missing`);
  }
  const byName = Object.fromEntries(rows.map((r) => [r.service, r]));
  // HitBTC's own API: address_regex ^t[13]… — t1/t3 only.
  assert.deepEqual(byName.HitBTC.sendsTo, { transparent: "yes", tex: "no", sapling: "no", unified: "no", unifiedShieldedOnly: "no" });
  // NEAR Intents' docs say transparent only; its bridge code says more. Until the docs agree, TEX and unified stay unknown.
  assert.equal(byName["NEAR Intents (1Click)"].sendsTo.tex, "unknown");
  assert.equal(byName["NEAR Intents (1Click)"].sendsTo.unified, "unknown");
  // Zodl's own code and its 2.0.3 post; Zodl's Keystone screen says Keystone can't pay TEX.
  assert.equal(byName["Zodl (formerly Zashi)"].sendsTo.sapling, "yes");
  assert.equal(byName["Zodl (formerly Zashi)"].sendsTo.unifiedShieldedOnly, "yes");
  assert.equal(byName.Keystone.sendsTo.tex, "no");
});

test("the hero's service count matches the table", () => {
  const html = readFileSync(new URL("../index.html", import.meta.url), "utf8");
  const n = rows.length;
  assert.match(html, new RegExp(`<b>${n} exchanges &amp; wallets</b>`));
  assert.match(html, new RegExp(`<span id="cover-count">${n}</span>`));
});
