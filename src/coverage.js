// What the page shows about coverage: every exchange and wallet in the dated table with its logo, what it can pay and
// its source, and the link a wallet or exchange team uses to ask to be added or corrected (a GitHub issue form, so
// every change is public and sourced, like the NU7 readiness board).
import { logoFor } from "./logos.js";

export const PAY_TYPES = [
  { key: "transparent", label: "t1" },
  { key: "tex", label: "TEX" },
  { key: "sapling", label: "Sapling" },
  { key: "unified", label: "Unified" },
  { key: "unifiedShieldedOnly", label: "Shielded-only" },
];
const REPO = "https://github.com/cryppit/wheres-my-zec";

/** Exchanges then wallets, each sorted by name, with counts. */
export function coverage(rows) {
  const items = (rows ?? [])
    .map((r) => ({
      name: r.service,
      kind: r.kind,
      logo: logoFor(r.service),
      pays: PAY_TYPES.map((t) => ({ key: t.key, label: t.label, answer: r.sendsTo?.[t.key] ?? "unknown" })),
      note: r.note,
      source: r.source,
      sourceKind: r.sourceKind,
      checked: r.checked,
    }))
    .sort((a, b) => a.kind.localeCompare(b.kind) || a.name.localeCompare(b.name));
  const counts = { exchange: items.filter((i) => i.kind === "exchange").length, wallet: items.filter((i) => i.kind === "wallet").length };
  return { items, counts };
}

/** The issue form for adding a service, or for correcting one already listed. */
export function addServiceUrl(name) {
  const title = name ? `Correct: ${name}` : "Add: ";
  return `${REPO}/issues/new?template=add-or-correct-a-service.yml&title=${encodeURIComponent(title)}`;
}
