// The "my wallet shows zero" table, filtered by the wallets someone picks: causes naming both wallets come first.

/** Every wallet named in the table, once, sorted. */
export function walletsIn(rows) {
  return [...new Set((rows ?? []).flatMap((r) => r.wallets ?? []))].sort((a, b) => a.localeCompare(b));
}

/** The causes that name the wallet used before or the one showing zero now; all of them when neither is picked. */
export function matchRestore(rows, before, now) {
  const picks = [before, now].filter(Boolean).map((w) => w.toLowerCase());
  if (picks.length === 0) return [...(rows ?? [])];
  const hits = (r) => picks.filter((p) => (r.wallets ?? []).some((w) => w.toLowerCase() === p)).length;
  return (rows ?? [])
    .map((r, i) => ({ r, i, n: hits(r) }))
    .filter((x) => x.n > 0)
    .sort((a, b) => b.n - a.n || a.i - b.i)
    .map((x) => x.r);
}
