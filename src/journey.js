// The answer drawn as a route: stops with a logo, a state (passed, here, ahead, failed) and how we know it (proven,
// reported, inferred, not_visible, unknown), plus a "who moves next" bar with one party lit. Shapes follow Intent
// Sentinel's so the two sites read the same.

const PARTY_LABELS = { you: "You", wallet: "Your wallet", thorchain: "THORChain", omni: "Omni bridge", nobody: "Nobody" };

export const stop = (name, logo, state, cls, label = null) => ({ name, logo, state, cls, ...(label ? { label } : {}) });

/** The parties to show, You first and Nobody last, with the one that moves next lit. */
export function partiesFor(next, operators = []) {
  const lit = next === "see-refund-helper" ? "omni" : next;
  const keys = [...new Set(["you", ...operators, ...(PARTY_LABELS[lit] && lit !== "nobody" && lit !== "you" ? [lit] : []), "nobody"])];
  return keys.map((key) => ({ key, label: PARTY_LABELS[key] ?? key, lit: key === lit }));
}

/** Long addresses and IDs shortened in the middle (first 8, last 6) for display; the copyable message keeps them whole. */
export function shorten(text) {
  return String(text).replace(/\b[0-9A-Za-z]{30,}\b/g, (t) => `${t.slice(0, 8)}…${t.slice(-6)}`);
}
