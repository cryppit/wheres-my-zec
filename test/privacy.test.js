// The page may talk only to the public sources the code reads, each named in the privacy note, and nothing it shows
// from those sources can become HTML. Modelled on Intent Sentinel's test.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";

const pages = ["index.html", "restore.html"].map((f) => readFileSync(f, "utf8"));
const html = pages[0];
const srcFiles = [...readdirSync("src").filter((f) => f.endsWith(".js")).map((f) => `src/${f}`), ...readdirSync("src/routes").map((f) => `src/routes/${f}`)];
const code = srcFiles.map((f) => readFileSync(f, "utf8")).join("\n");
const cspOf = (page) => /Content-Security-Policy" content="([^"]+)"/.exec(page)?.[1] ?? "";
const connect = cspOf(html).split(";").find((d) => d.trim().startsWith("connect-src")) ?? "";
// Hosts the code only links to, never fetches.
const LINK_ONLY = ["blockchair.com", "cryppit.github.io", "github.com", "forum.zcashcommunity.com", "zips.z.cash"];
const fetched = [...new Set([...code.matchAll(/https:\/\/([a-z0-9.-]+\.[a-z]{2,})/g)].map((m) => m[1]))].filter((h) => !LINK_ONLY.includes(h));

test("every page has a CSP, no referrer, scripts only from this site, and no analytics or storage", () => {
  for (const page of pages) {
    assert.match(page, /Content-Security-Policy/);
    assert.match(page, /name="referrer" content="no-referrer"/);
    assert.match(cspOf(page), /script-src 'self'/);
    assert.doesNotMatch(page, /<script[^>]+src="https?:/);
  }
  assert.doesNotMatch(pages.join("") + code, /localStorage|sessionStorage|indexedDB|gtag|plausible|googletagmanager|document\.cookie/);
});

test("connect-src lists exactly the hosts the code fetches, with no wildcard", () => {
  assert.doesNotMatch(connect, /\*|https:(\s|;|$)/);
  for (const h of fetched) assert.ok(connect.includes(`https://${h}`), `${h} is missing from connect-src`);
  const listed = [...connect.matchAll(/https:\/\/([a-z0-9.-]+)/g)].map((m) => m[1]);
  for (const h of listed) assert.ok(fetched.includes(h), `${h} is in connect-src but the code never fetches it`);
});

test("the privacy note names every host and what it sees", () => {
  const note = /<section[^>]*id="privacy"[^>]*>([\s\S]*?)<\/section>/.exec(html)?.[1] ?? "";
  for (const h of fetched) assert.ok(note.includes(h), `${h} is not named in the privacy note`);
  assert.match(note, /only the transaction ID/i);
  assert.match(note, /seed/i);
  assert.match(note, /IP address/);
  assert.match(note, /nothing is stored/i);
});

test("nothing from a source can become HTML: no innerHTML, outerHTML, insertAdjacentHTML or document.write", () => {
  assert.doesNotMatch(code, /\.innerHTML|\.outerHTML|insertAdjacentHTML|document\.write/);
});

test("every page checks it isn't framed by another site", () => {
  for (const page of pages) assert.match(page, /<script type="module" src="src\/[a-z-]+\.js"><\/script>/);
  assert.match(readFileSync("src/page.js", "utf8"), /framed\(window\)/);
  assert.match(readFileSync("src/restore-page.js", "utf8"), /framed\(window\)/);
});
