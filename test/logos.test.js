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

test("a wallet without a logo gets its first letter", () => {
  assert.deepEqual(logoFor("Zodl (formerly Zashi)"), { mono: "Z" });
  assert.deepEqual(logoFor("YWallet"), { mono: "Y" });
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
