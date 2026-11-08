// Every service and route the page names gets a logo from logos/ (web3icons, MIT) or a lettered tile, never a broken
// image.
import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { logoFor, chainLogo, routeLogo } from "../src/logos.js";

const acceptance = JSON.parse(readFileSync(new URL("../data/acceptance.json", import.meta.url), "utf8")).rows;
const file = (src) => new URL(`../${src}`, import.meta.url);

test("every service in the table has a logo file that exists, or a lettered tile", () => {
  for (const r of acceptance) {
    const l = logoFor(r.service);
    if (l.src) assert.ok(existsSync(file(l.src)), `${r.service}: ${l.src} is missing`);
    else assert.match(l.mono, /^[A-Z0-9]$/, `${r.service} has no logo and no letter`);
  }
});

test("the big exchanges and hardware wallets use their real logos", () => {
  for (const name of ["Binance", "Coinbase", "Kraken", "Gemini", "OKX", "Ledger Live", "Trezor Suite", "Trust Wallet", "Exodus"]) {
    assert.ok(logoFor(name).src, `${name} should have a logo`);
  }
});

test("a wallet without a usable logo gets its first letter", () => {
  // Gem's repository is GPL-3.0 and Brave's MPL: we don't copy their artwork, so they get a letter.
  assert.deepEqual(logoFor("Gem Wallet"), { mono: "G" });
  assert.deepEqual(logoFor("Brave Wallet"), { mono: "B" });
});

test("THORChain payout chains map to their logos, and an unknown chain gets none", () => {
  assert.equal(chainLogo("BSC.USDT-0X55D398326F99059FF775485246999027B3197955"), "logos/binance-smart-chain.svg");
  assert.equal(chainLogo("ETH.ETH"), "logos/ethereum.svg");
  assert.equal(chainLogo("BTC.BTC"), "logos/bitcoin.svg");
  assert.equal(chainLogo("ZEC.ZEC"), "logos/token-zec.svg");
  assert.equal(chainLogo("FOO.BAR"), null);
  for (const a of ["BSC.X", "ETH.X", "BTC.X", "SOL.X", "BASE.X", "AVAX.X", "TRON.X", "XRP.X", "LTC.X", "DOGE.X", "BCH.X", "ZEC.X"]) {
    assert.ok(existsSync(file(chainLogo(a))), a);
  }
});

test("each route has its logo", () => {
  for (const r of ["thorchain", "omni", "zcash"]) assert.ok(existsSync(file(routeLogo(r))), r);
});

test("logos drawn in black (OKX, Ledger, Trezor) get a light disc so they show on the dark page", () => {
  for (const name of ["OKX", "Ledger Live", "Trezor Suite"]) assert.equal(logoFor(name).light, true, name);
  assert.equal(logoFor("Binance").light, undefined);
  // A black fill and no light flag would vanish: check every logo file the services use.
  for (const r of acceptance) {
    const l = logoFor(r.service);
    if (l.src && /fill="#000(000)?"/i.test(readFileSync(file(l.src), "utf8"))) assert.equal(l.light, true, `${r.service} is black on dark`);
  }
});

test("the Zcash wallets use their own app icons", () => {
  const want = { "Zodl (formerly Zashi)": "zodl", Zodl: "zodl", Zashi: "zodl", Zkool: "zkool", Zingo: "zingo", YWallet: "ywallet", Edge: "edge", "Cake Wallet": "cake", Vultisig: "vultisig", Keystone: "keystone", "MetaMask Zcash Snap (WebZjs)": "metamask", "Ledger Nano S": "ledger" };
  for (const [name, f] of Object.entries(want)) {
    const l = logoFor(name);
    assert.ok(l.src && l.src.startsWith(`logos/${f}.`), `${name} → ${l.src ?? l.mono}`);
    assert.ok(existsSync(file(l.src)), l.src);
  }
});

test("every wallet named in the restore table has a logo or a letter", () => {
  const rows = JSON.parse(readFileSync(new URL("../data/restore.json", import.meta.url), "utf8")).rows;
  for (const w of new Set(rows.flatMap((r) => r.wallets))) {
    const l = logoFor(w);
    assert.ok(l.src ? existsSync(file(l.src)) : /^[A-Z0-9]$/.test(l.mono), w);
  }
});

test("the services added on 9 Nov carry a logo where an MIT one exists", () => {
  assert.equal(logoFor("Atomic Wallet").src, "logos/atomic.svg");
  assert.ok(existsSync(file("logos/atomic.svg")));
  assert.equal(logoFor("NEAR Intents (1Click)").src, "logos/near-protocol.svg");
});
