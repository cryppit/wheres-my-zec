// The dated tables in data/: every row sourced and dated, every value one the page understands, and no advice that
// sends someone's seed anywhere but a wallet app.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const load = (f) => JSON.parse(readFileSync(new URL(`../data/${f}`, import.meta.url), "utf8"));
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const ANSWER = new Set(["yes", "no", "unknown"]);
const TYPES = ["transparent", "tex", "sapling", "unified", "unifiedShieldedOnly"];

test("every acceptance row is sourced, dated and uses only known values", () => {
  const t = load("acceptance.json");
  assert.match(t.checked, DATE);
  assert.ok(t.rows.length >= 20, `only ${t.rows.length} rows`);
  for (const r of t.rows) {
    const where = `acceptance row ${r.service}`;
    assert.ok(r.service && ["exchange", "wallet"].includes(r.kind), where);
    assert.match(r.source, /^https:\/\//, where);
    assert.ok(["official", "registry", "forum", "secondary"].includes(r.sourceKind), where);
    assert.match(r.checked, DATE, where);
    assert.ok(typeof r.note === "string" && r.note.length > 0, where);
    for (const k of TYPES) assert.ok(ANSWER.has(r.sendsTo?.[k]), `${where}: sendsTo.${k} = ${r.sendsTo?.[k]}`);
    if (r.kind === "exchange") assert.ok(r.acceptsShieldedDeposit === null || ANSWER.has(r.acceptsShieldedDeposit), where);
    if (r.kind === "wallet") assert.ok(r.holdsShielded === null || ANSWER.has(r.holdsShielded), where);
  }
});

test("the services the plan named are all in the acceptance table", () => {
  const names = new Set(load("acceptance.json").rows.map((r) => r.service.toLowerCase()));
  for (const s of ["binance", "coinbase", "kraken", "gemini", "okx", "zodl", "zkool", "zingo", "keystone", "ledger live", "trust wallet"]) {
    assert.ok([...names].some((n) => n.startsWith(s)), `${s} is missing`);
  }
});

test("every restore row is sourced, dated, names its wallets and who acts next", () => {
  const t = load("restore.json");
  assert.match(t.checked, DATE);
  assert.ok(t.rows.length >= 5);
  const ids = new Set();
  for (const r of t.rows) {
    const where = `restore row ${r.id}`;
    assert.match(r.id, /^[a-z0-9-]+$/, where);
    assert.ok(!ids.has(r.id), `${where} repeats`);
    ids.add(r.id);
    assert.ok(Array.isArray(r.wallets) && r.wallets.length > 0, where);
    for (const k of ["symptom", "when", "advice"]) assert.ok(typeof r[k] === "string" && r[k].length > 0, `${where}: ${k}`);
    assert.ok(["you", "wallet", "nobody"].includes(r.nextParty), where);
    assert.match(r.source, /^https:\/\//, where);
    assert.ok(["official", "forum", "secondary"].includes(r.sourceKind), where);
    assert.match(r.checked, DATE, where);
  }
});

const UNSAFE = /(paste|enter|type|send|share|give)[^.]{0,40}(seed|recovery phrase|private key|viewing key)[^.]{0,40}(website|site|form|chat|support|telegram|discord|email|us\b)/;
/** A sentence that tells someone to put a seed or key somewhere unsafe; a warning ("never…", "don't…") is fine. */
const unsafeAdvice = (text) => text.toLowerCase().split(/(?<=[.!?])\s+/).some((s) => !/\b(never|don't|do not|not)\b/.test(s) && UNSAFE.test(s));

test("the unsafe-advice check catches instructions and lets warnings through", () => {
  assert.equal(unsafeAdvice("Paste your seed phrase into the recovery website to get your coins back."), true);
  assert.equal(unsafeAdvice("Send your private key to support on Telegram."), true);
  assert.equal(unsafeAdvice("Never type your recovery phrase into a website or 'recovery tool'."), false);
  assert.equal(unsafeAdvice("Restore the seed in Zkool on your own phone."), false);
});

test("no advice tells anyone to put a seed or key into a website, form, chat or another person's hands", () => {
  for (const r of load("restore.json").rows) assert.equal(unsafeAdvice(r.advice), false, r.id);
});
