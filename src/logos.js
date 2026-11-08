// Logos for the services, chains and routes the page names: SVGs in logos/ from web3icons (MIT, see logos/LICENSE).
// A service with no logo there gets a lettered tile instead, so nothing ever shows a broken image.

const SERVICES = {
  binance: "binance", coinbase: "coinbase", kraken: "kraken", gemini: "gemini", okx: "okx", kucoin: "kucoin",
  bitget: "bitget", bybit: "bybit", gate: "gate-io", "trust wallet": "trust", exodus: "exodus", "ledger live": "ledger",
  "trezor suite": "trezor", metamask: "metamask",
};
const CHAINS = {
  BSC: "binance-smart-chain", ETH: "ethereum", BTC: "bitcoin", SOL: "solana", BASE: "base", AVAX: "avalanche",
  TRON: "tron", XRP: "xrp", LTC: "litecoin", DOGE: "token-doge", BCH: "token-bch", ZEC: "token-zec", THOR: "rune",
};
// Logos drawn in black: shown on a light disc, or they vanish on the dark page.
const DARK = new Set(["okx", "ledger", "trezor"]);
const ROUTES = { thorchain: "rune", omni: "near-protocol", near: "near-protocol", zcash: "token-zec" };

/** `{ src }` for a service with a logo (`light: true` when it's drawn in black), else `{ mono }`: its first letter. */
export function logoFor(service) {
  const name = String(service ?? "").toLowerCase();
  const key = Object.keys(SERVICES).find((k) => name === k || name.startsWith(`${k} `));
  if (key) return DARK.has(SERVICES[key]) ? { src: `logos/${SERVICES[key]}.svg`, light: true } : { src: `logos/${SERVICES[key]}.svg` };
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
