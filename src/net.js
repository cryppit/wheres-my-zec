// One way to ask a public source: never from a cache, and given up after a few seconds so a slow source can't freeze
// the page (the caller then says it couldn't check).
export const TIMEOUT_MS = 8000;

/**
 * Runs `work(signal)` with a signal that aborts after `ms`, and clears the timer as soon as the work settles. A plain
 * timer, not AbortSignal.timeout: that one's timer doesn't keep Node 22 alive, so a hung request was never cut off there.
 */
export async function withTimeout(work, ms = TIMEOUT_MS) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(new Error(`timed out after ${ms} ms`)), ms);
  try {
    return await work(controller.signal);
  } finally {
    clearTimeout(timer);
  }
}

export function request(fetchImpl, url, timeoutMs = TIMEOUT_MS) {
  return withTimeout((signal) => fetchImpl(url, { cache: "no-store", signal }), timeoutMs);
}
