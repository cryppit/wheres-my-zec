// The "my wallet shows zero" flow: what happened, then which wallet, then the known causes that match.

export const SITUATIONS = [
  { id: "restored", title: "I restored my seed in another wallet", line: "The new wallet shows less, or nothing." },
  { id: "after-update", title: "After an app update or network upgrade", line: "The balance vanished, or the app stopped working." },
  { id: "send-failed", title: "A send or a swap failed", line: "The coins left, or never left, and nothing arrived." },
  { id: "old-funds", title: "Old coins or an old key", line: "A paper wallet, a key file, or coins from years ago." },
];

/** The wallets with a known cause in this situation, each once, sorted. */
export function walletsFor(rows, situation) {
  const names = (rows ?? []).filter((r) => r.situation === situation).flatMap((r) => r.wallets ?? []);
  return [...new Set(names)].sort((a, b) => a.localeCompare(b));
}

/** The causes for this situation that name the wallet; every cause in the situation when no wallet is picked. */
export function causesFor(rows, situation, wallet) {
  const inSituation = (rows ?? []).filter((r) => r.situation === situation);
  if (!wallet) return inSituation;
  const w = wallet.toLowerCase();
  return inSituation.filter((r) => (r.wallets ?? []).some((x) => x.toLowerCase() === w));
}

/**
 * How sure a cause is, for the badge on its card: from the wallet's own guide; a users' report that the wallet's own
 * code or docs confirm (`confirmedBy` with kind "official"); or a users' report not yet confirmed.
 */
export function badgeFor(row) {
  if (row.sourceKind === "official") return { level: "official", label: "From the wallet's own guide" };
  if (row.confirmedBy?.kind === "official") return { level: "confirmed", label: "Reported by users · confirmed by the wallet's code or docs" };
  return { level: "reported", label: "Reported by users, not yet confirmed" };
}
