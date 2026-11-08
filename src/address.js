// Ported from cryppit/shield-receipt src/address.ts (MIT, Cryppit) by stripping its TypeScript types; logic unchanged.
// What a withdrawal check needs from the address someone gave: the transparent output script a payment to it would use
// (from a t1/t3 address, a TEX address or a unified address's transparent item), and which shielded receivers it has.
// Ironwood pays the same Orchard receiver, so `orchard` covers both pools.
import { base58CheckDecode, bech32Decode, classifyZcashAddress, decodeUnifiedAddress } from "./zcash-address.js";

const hex = (b) => [...b].map((x) => x.toString(16).padStart(2, "0")).join("");
const p2pkh = (hash) => `76a914${hex(hash)}88ac`;
const p2sh = (hash) => `a914${hex(hash)}87`;

function transparentScript(input, kind) {
  if (kind === "p2pkh" || kind === "p2sh") {
    const payload = base58CheckDecode(input);
    if (!payload) return null;
    const hash = payload.subarray(2);
    return kind === "p2pkh" ? p2pkh(hash) : p2sh(hash);
  }
  if (kind === "tex") {
    const d = bech32Decode(input);
    return "error" in d ? null : p2pkh(d.bytes);
  }
  if (kind === "unified") {
    const ua = decodeUnifiedAddress(input);
    if ("error" in ua) return null;
    const item = ua.items.find((i) => i.typecode === 0 || i.typecode === 1);
    if (!item) return null;
    return item.typecode === 0 ? p2pkh(item.data) : p2sh(item.data);
  }
  return null;
}

/** No Zcash address contains whitespace, so a line break or space pasted inside one is dropped. */
export function readAddress(raw) {
  const info = classifyZcashAddress(raw.replace(/\s+/g, ""));
  const facts = {
    input: info.address,
    kind: info.kind,
    network: info.network,
    valid: info.valid,
    transparentScript: info.valid ? transparentScript(info.address, info.kind) : null,
    shielded: { sapling: info.valid && info.receivers.sapling, orchard: info.valid && info.receivers.orchard },
  };
  const error = info.unsupported ?? info.error;
  if (error) facts.error = error;
  return facts;
}
