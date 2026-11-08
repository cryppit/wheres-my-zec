// Logos for the services, chains and routes the page names: SVGs in logos/ from web3icons (MIT, see logos/LICENSE).
// A service with no logo there gets a lettered tile instead, so nothing ever shows a broken image.

const SERVICES = {
  binance: "binance.svg", coinbase: "coinbase.svg", kraken: "kraken.svg", gemini: "gemini.svg", okx: "okx.svg",
  kucoin: "kucoin.svg", bitget: "bitget.svg", bybit: "bybit.svg", gate: "gate-io.svg", "trust wallet": "trust.svg",
  exodus: "exodus.svg", ledger: "ledger.svg", "ledger live": "ledger.svg", "trezor suite": "trezor.svg", trezor: "trezor.svg",
  metamask: "metamask.svg",
  // App icons from each wallet's own open-source repository (see logos/LICENSE).
  zodl: "zodl.png", zashi: "zodl.png", zkool: "zkool.png", zingo: "zingo.png", ywallet: "ywallet.png", edge: "edge.png",
  "cake wallet": "cake.png", vultisig: "vultisig.png", keystone: "keystone.png",
};
const CHAINS = {
  BSC: "binance-smart-chain", ETH: "ethereum", BTC: "bitcoin", SOL: "solana", BASE: "base", AVAX: "avalanche",
  TRON: "tron", XRP: "xrp", LTC: "litecoin", DOGE: "token-doge", BCH: "token-bch", ZEC: "token-zec", THOR: "rune",
};
// Logos drawn in black or white: shown on a light disc, or they vanish on the dark page.
const DARK = new Set(["okx.svg", "ledger.svg", "trezor.svg", "zodl.png", "keystone.png", "zkool.png"]);
const ROUTES = { thorchain: "rune", omni: "near-protocol", near: "near-protocol", zcash: "token-zec" };

/** `{ src }` for a service with a logo (`light: true` when it's drawn in black), else `{ mono }`: its first letter. */
export function logoFor(service) {
  const name = String(service ?? "").toLowerCase();
  const key = Object.keys(SERVICES).find((k) => name === k || name.startsWith(`${k} `));
  if (key) return DARK.has(SERVICES[key]) ? { src: `logos/${SERVICES[key]}`, light: true } : { src: `logos/${SERVICES[key]}` };
  const letter = /[a-z0-9]/i.exec(String(service ?? ""))?.[0];
  return { mono: (letter ?? "?").toUpperCase() };
}

/** The logo of the chain a THORChain asset lives on ("BSC.USDT-0X55…" is on BNB Chain), or null. */
export function chainLogo(asset) {
  const chain = String(asset ?? "").split(".")[0];
  return CHAINS[chain] ? `logos/${CHAINS[chain]}.svg` : null;
}

/** The logo for a route the case names. */
export function routeLogo(route) {
  return `logos/${ROUTES[route] ?? ROUTES.zcash}.svg`;
}
