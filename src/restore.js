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
