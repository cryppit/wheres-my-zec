// What a pasted line is, before anything is looked up. Seeds and keys are refused here, so they can never reach a
// lookup. Addresses keep their case (base58 needs it); hex and Bech32 are lowercased. Checksums are checked later, in
// the address module: this only decides which kind of answer to look for.

const BASE58 = "[1-9A-HJ-NP-Za-km-z]";
const KEY_REFUSAL =
  "That looks like a private key or viewing key. Never paste one into any website, this one included: anyone who sees a private key can take the funds. We don't need it, and nothing was sent.";
const SEED_REFUSAL =
  "That looks like a seed phrase (recovery words). Never paste it into any website, this one included: anyone who sees it can take the funds. We don't need it, and nothing was sent. If you typed it into another site, move your funds to a new wallet now.";
const HELP =
  "We don't recognise that. Paste a Zcash transaction ID, a Zcash address, a block explorer link, or an Omni transfer ID like zcash:1234.";

/**
 * A run of 12 or more words: a recovery phrase, whatever the wallet or language, however it was copied (numbered,
 * with commas, quoted, with a full stop). Any 12-word paste is treated as one: refusing a sentence is the safe mistake.
 */
function isSeedPhrase(text) {
  const words = text
    .replace(/\b\d+\s*[.)]/g, " ")
    .replace(/[,;"'“”‘’()[\]]/g, " ")
    .replace(/[.!?]+(\s|$)/g, " ")
    .split(/[\s　]+/)
    .filter(Boolean);
  return words.length >= 12 && words.every((w) => /^\p{L}{1,12}$/u.test(w));
}

/** Spending keys, viewing keys and private keys of every kind we know, checked with all whitespace removed. */
function isKey(raw) {
  const text = raw.replace(/\s+/g, "");
  return (
    /^secret-/i.test(text) ||
    /^(zxviews?|zxviewtestsapling|uview|uivk|zivk|uviewtest|uivktest)[0-9a-z]{20,}$/i.test(text) ||
    new RegExp(`^(SK|ZiVK)${BASE58}{45,60}$`).test(text) ||
    new RegExp(`^[xyztuv]prv${BASE58}{100,}$`).test(text) ||
    new RegExp(`^[5KL]${BASE58}{50,51}$`).test(text)
  );
}

/** A Zcash payment URI (ZIP 321) gives its address; an explorer link gives its last path segment. */
function unwrap(text) {
  const uri = /^zcash:([^?]+)(\?.*)?$/i.exec(text);
  if (uri && !/^\d+$/.test(uri[1])) return uri[1];
  if (!/^https?:\/\//i.test(text)) return text;
  try {
    return new URL(text).pathname.split("/").filter(Boolean).at(-1) ?? text;
  } catch {
    return text;
  }
}

export function readInput(raw) {
  const trimmed = String(raw ?? "").trim();
  if (!trimmed) return { error: "Paste a Zcash transaction ID, a Zcash address or a block explorer link." };
  if (isSeedPhrase(trimmed)) return { refused: SEED_REFUSAL };
  if (isKey(trimmed)) return { refused: KEY_REFUSAL };
  const text = unwrap(trimmed);
  if (isKey(text)) return { refused: KEY_REFUSAL };

  const omni = /^zcash:(\d+)$/i.exec(text);
  if (omni) return { kind: "omni-transfer", value: `zcash:${omni[1]}` };

  if (new RegExp(`^(tm|t2)${BASE58}{33}$`).test(text) || /^(utest1|ztestsapling1|textest1)[0-9a-z]+$/i.test(text)) {
    return { error: "That's a test network address. Test-network coins have no value, so there's nothing to recover; this page checks real (mainnet) ZEC." };
  }
  if (new RegExp(`^t[13]${BASE58}{33}$`).test(text)) return { kind: "zcash-address", value: text };
  // Bech32 is all lower case or all upper case; read either as lower case.
  const bech = /^(TEX1|ZS1|U1)[02-9AC-HJ-NP-Z]{30,}$/.test(text) ? text.toLowerCase() : text;
  if (/^(tex1|zs1|u1)[02-9ac-hj-np-z]{30,}$/.test(bech)) return { kind: "zcash-address", value: bech };

  if (/^0x[0-9a-f]{40}([0-9a-f]{24})?$/i.test(text)) {
    return { error: "That's an Ethereum-style (EVM) hash or address, not Zcash. For a swap from another chain, use Intent Sentinel." };
  }
  if (/^[0-9a-f]{64}$/i.test(text)) return { kind: "zcash-txid", value: text.toLowerCase() };
  if (/^[a-z0-9_-]+(\.[a-z0-9_-]+)*\.near$/.test(text)) return { kind: "near-account", value: text };
  if (new RegExp(`^${BASE58}{43,44}$`).test(text)) return { kind: "near-tx", value: text };
  return { error: HELP };
}
