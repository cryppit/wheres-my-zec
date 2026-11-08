// The few vitest calls the tests ported from Shield Receipt use, on node:test and node:assert, so those tests run here
// unchanged and this repo keeps no dependencies.
import { describe, it as nodeIt } from "node:test";
import assert from "node:assert/strict";

/** `it`, plus vitest's `it.each(cases)(name, fn)` with `%i`/`%s` in the name. */
export const it = Object.assign((name, fn) => nodeIt(name, fn), {
  each: (cases) => (name, fn) => {
    for (const c of cases) nodeIt(name.replace(/%[is]/, String(c)), () => fn(c));
  },
});
export { describe };

const CONTAINING = Symbol("objectContaining");

/** vitest's toEqual ignores keys whose value is undefined; so does this. */
function clean(v) {
  if (Array.isArray(v)) return v.map(clean);
  if (v && typeof v === "object" && Object.getPrototypeOf(v) === Object.prototype) {
    return Object.fromEntries(Object.entries(v).filter(([, x]) => x !== undefined).map(([k, x]) => [k, clean(x)]));
  }
  return v;
}

/** The parts of `actual` that `expected` names, recursively, so a subset can be compared with deepStrictEqual. */
function subset(actual, expected) {
  if (Array.isArray(expected)) return Array.isArray(actual) ? expected.map((e, i) => subset(actual[i], e)) : actual;
  if (expected && typeof expected === "object" && actual && typeof actual === "object") {
    return Object.fromEntries(Object.keys(expected).map((k) => [k, subset(actual[k], expected[k])]));
  }
  return actual;
}

/** Replaces each expect.objectContaining(x) in `expected` by x, and the matching part of `actual` by its subset. */
function align(actual, expected) {
  if (expected && expected[CONTAINING]) return [subset(actual, expected[CONTAINING]), expected[CONTAINING]];
  if (Array.isArray(expected) && Array.isArray(actual)) {
    const pairs = expected.map((e, i) => align(actual[i], e));
    return [actual.length === expected.length ? pairs.map((p) => p[0]) : actual, pairs.map((p) => p[1])];
  }
  if (expected && typeof expected === "object" && actual && typeof actual === "object" && !Array.isArray(expected)) {
    const a = { ...actual };
    const e = { ...expected };
    for (const k of Object.keys(expected)) [a[k], e[k]] = align(actual[k], expected[k]);
    return [a, e];
  }
  return [actual, expected];
}

export function expect(actual) {
  return {
    toBe: (e) => assert.strictEqual(actual, e),
    toEqual: (e) => {
      const [a, x] = align(actual, e);
      assert.deepStrictEqual(clean(a), clean(x));
    },
    toMatchObject: (e) => assert.deepStrictEqual(clean(subset(actual, e)), clean(e)),
    toBeNull: () => assert.strictEqual(actual, null),
    toHaveLength: (n) => assert.strictEqual(actual.length, n),
    toBeGreaterThan: (n) => assert.ok(actual > n, `${actual} is not greater than ${n}`),
    not: { toBe: (e) => assert.notStrictEqual(actual, e) },
  };
}

expect.objectContaining = (obj) => ({ [CONTAINING]: obj });
