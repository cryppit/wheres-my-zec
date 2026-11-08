// One way to ask a public source: never from a cache, and given up after a few seconds so a slow source can't freeze
// the page (the caller then says it couldn't check).
export const TIMEOUT_MS = 8000;

export function request(fetchImpl, url, timeoutMs = TIMEOUT_MS) {
  return fetchImpl(url, { cache: "no-store", signal: AbortSignal.timeout(timeoutMs) });
}
