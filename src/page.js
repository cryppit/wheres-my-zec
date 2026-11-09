// The paste box and the case card. Every piece of text from a source is set with textContent, never as HTML.
import { check, checkRoutes } from "./check.js";
import { framed } from "./frame-guard.js";
import { logoFor, routeLogo } from "./logos.js";
import { shorten } from "./journey.js";
import { addServiceUrl, coverage } from "./coverage.js";
import { PIN_FILES, dataRoot, fetchLastPin, pinStatus, pinLine } from "./pin.js";

const SITE = "https://cryppit.github.io/wheres-my-zec/";
const INTENT_SENTINEL = "https://cryppit.github.io/intent-sentinel/";
const $ = (id) => document.getElementById(id);
const CLS_LABELS = { proven: "Proven", reported: "Reported", inferred: "Inferred", not_visible: "Not visible", unknown: "Unknown" };

/** Today in UTC, as "YYYY-MM-DD UTC": the same answer on every machine. */
function today() {
  const d = new Date();
  const p = (n) => String(n).padStart(2, "0");
  return `${d.getUTCFullYear()}-${p(d.getUTCMonth() + 1)}-${p(d.getUTCDate())} UTC`;
}

/** An element with attributes and children; strings become text nodes. */
function el(tag, attrs = {}, ...kids) {
  const n = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v === undefined || v === null || v === false) continue;
    n.setAttribute(k, v === true ? "" : String(v));
  }
  for (const kid of kids.flat()) if (kid !== null && kid !== undefined && kid !== false) n.append(kid instanceof Node ? kid : document.createTextNode(String(kid)));
  return n;
}

function copyButton(text, label) {
  const b = el("button", { class: "btn", type: "button" }, label);
  b.addEventListener("click", async () => {
    try {
      await navigator.clipboard.writeText(text);
      b.textContent = "Copied";
    } catch {
      b.textContent = "Select and copy it instead";
    }
    setTimeout(() => (b.textContent = label), 2000);
  });
  return b;
}

function chip(name) {
  const logo = logoFor(name);
  return el("li", { class: "chip" }, logo.src ? el("img", { src: logo.src, alt: "", class: logo.light ? "light" : null }) : el("span", { class: "mono", "aria-hidden": "true" }, logo.mono), name);
}

let acceptance = null;
async function loadAcceptance() {
  if (acceptance?.rows?.length) return acceptance;
  try {
    const res = await fetch("data/acceptance.json", { cache: "no-store" });
    acceptance = res.ok ? await res.json() : { rows: [], failed: true };
  } catch {
    acceptance = { rows: [], failed: true };
  }
  return acceptance;
}

function track(stops) {
  return el("div", { class: "track", role: "list", "aria-label": "Where the ZEC went" }, stops.map((st, i) => {
    const node = el("div", { class: `stop ${st.state}`, role: "listitem" },
      el("span", { class: "coin" }, el("img", { src: st.logo, alt: "", class: /zodl|keystone|zkool|okx|ledger|trezor/.test(st.logo) ? "light" : null })),
      el("b", {}, st.name),
      el("span", { class: `cls c-${st.cls}` }, CLS_LABELS[st.cls] ?? st.cls),
    );
    node.style.setProperty("--i", String(i));
    return node;
  }));
}

function renderCase(result) {
  const c = result.case;
  const [first, ...rest] = c.lines;
  const tone = c.stops?.some((st) => st.state === "failed") ? "failed"
    : c.evidence === "Unknown" ? "unknown"
    : c.stops?.some((st) => st.state === "here") ? "waiting"
    : c.next.party === "nobody" ? "done" : "act";
  const card = el("article", { class: "case", "data-evidence": c.evidence, "data-tone": tone },
    el("div", { class: "case-head" }, el("img", { src: routeLogo(c.route), alt: "" }), el("span", { class: "pill" }, c.evidence)),
    el("h2", { tabindex: "-1" }, c.title),
    first ? el("p", { class: "summary" }, shorten(first)) : null,
  );
  if (c.stops?.length) card.append(track(c.stops));
  if (c.services) {
    const groups = [["can", "Can pay it"], ["cant", "Can't pay it"], ["unknown", "Not checked yet"]];
    for (const [key, label] of groups) {
      if (c.services[key]?.length) card.append(el("div", { class: `group ${key}` }, el("h3", {}, label), el("ul", { class: "chips" }, c.services[key].map(chip))));
    }
    if (acceptance?.failed) card.append(el("p", { class: "notice" }, "Couldn't load the exchange and wallet table. Reload the page to try again."));
    else if (acceptance?.checked) card.append(el("p", { class: "hint" }, `From our table checked ${acceptance.checked}. Services change, so check with them too.`));
  }
  if (c.parties?.length) {
    card.append(el("div", { class: "movers" }, el("b", {}, "Who moves next"), c.parties.map((p) => el("span", { class: `party${p.lit ? " lit" : ""}` }, el("span", { class: "dot" }), p.label))));
    card.append(el("p", { class: "next plain" }, c.next.text));
  } else {
    card.append(el("div", { class: "next" }, el("b", {}, "Who acts next"), c.next.text));
  }
  if (c.copy) card.append(el("p", { class: "links" }, copyButton(c.copy, "Copy the ID")));
  if (c.canCheckRoutes) {
    const go = el("button", { class: "btn go", type: "button" }, "Check bridges and swaps");
    go.addEventListener("click", () => runRoutes(result, go));
    card.append(el("div", { class: "routes" },
      el("p", {}, "Was this a deposit into a bridge? This sends the transaction's public transparent output addresses to the Omni bridge's records, and nothing else."),
      go,
      el("p", {}, "Swapped through NEAR Intents? Copy the ID and check it in ", el("a", { href: INTENT_SENTINEL, target: "_blank", rel: "noopener noreferrer" }, "Intent Sentinel"), "."),
      copyButton(result.input.value, "Copy the ID"),
    ));
  }
  const details = el("details", { class: "more" }, el("summary", {}, "Details and a message to send"),
    rest.length ? el("ul", {}, rest.map((l) => el("li", { title: l }, shorten(l)))) : null,
    c.links?.length ? el("p", { class: "links" }, c.links.map((l) => el("a", { href: l.url, target: "_blank", rel: "noopener noreferrer" }, l.label))) : null,
    el("div", { class: "msg" }, el("label", { for: "msg" }, "A message to send them (only public facts in it):"), el("textarea", { id: "msg", readonly: true, rows: 6 }, c.message), copyButton(c.message, "Copy the message")),
  );
  card.append(details);
  return card;
}

/** Each run gets a number; an answer that arrives after a newer run started is dropped. */
let current = 0;

function show(result, run) {
  if (run !== current) return;
  const out = $("out");
  $("status").textContent = "";
  if (result.refused) {
    // Don't leave a seed or key sitting on screen.
    $("q").value = "";
    out.replaceChildren(el("p", { class: "notice refused", role: "alert" }, result.refused));
  } else if (result.error) {
    if (result.clear) $("q").value = "";
    out.replaceChildren(el("p", { class: "notice" }, result.error));
  } else {
    out.replaceChildren(renderCase(result));
    out.querySelector("h2")?.focus({ preventScroll: true });
    out.scrollIntoView({ behavior: "smooth", block: "start" });
  }
}

/** Only a transaction ID the explorer actually found goes into the link: a pasted key never does. */
function remember(result) {
  const found = result.input?.kind === "zcash-txid" && result.tx && !result.tx.notFound && !result.tx.busy && !result.tx.error && !result.tx.undecoded;
  history.replaceState(null, "", found ? `#q=${result.input.value}` : location.pathname);
}

async function run(raw) {
  const mine = ++current;
  $("go").disabled = true;
  const step = el("span", {}, "Reading the records…");
  $("out").replaceChildren(el("div", { class: "reading", role: "status" }, el("b", {}, "Finding your ZEC"), step));
  $("status").textContent = "Reading the records…";
  try {
    const onStep = (s) => { if (mine === current) { $("status").textContent = s; step.textContent = s; } };
    const result = await check(raw, { fetchImpl: fetch, now: today(), acceptance: await loadAcceptance(), onStep });
    if (mine === current) remember(result);
    show(result, mine);
  } catch {
    show({ error: "Something went wrong on this page. Nothing was decided; please try again." }, mine);
  } finally {
    if (mine === current) $("go").disabled = false;
  }
}

async function runRoutes(result, button) {
  const mine = current;
  button.disabled = true;
  button.textContent = "Checking…";
  try {
    show(await checkRoutes(result, { fetchImpl: fetch, now: today() }), mine);
  } catch {
    button.disabled = false;
    button.textContent = "Couldn't check. Try again";
  }
}

const ANSWER = { yes: "✓", no: "✕", unknown: "?" };
const ANSWER_WORD = { yes: "can pay", no: "can't pay", unknown: "not checked" };

function logoNode(logo, cls) {
  return logo.src ? el("img", { src: logo.src, alt: "", class: [cls, logo.light ? "light" : null].filter(Boolean).join(" ") || null }) : el("span", { class: "mono", "aria-hidden": "true" }, logo.mono);
}

/** The wheel of covered services around the ZEC coin, built like Intent Sentinel's chain wheel. */
function buildWheel(items) {
  const wheel = $("wheel");
  if (!wheel || !items.length) return;
  wheel.setAttribute("aria-label", `Exchanges and wallets covered: ${items.map((i) => i.name).join(", ")}`);
  wheel.style.setProperty("--cycle", `${items.length * 0.4}s`);
  const split = Math.ceil(items.length * 0.6);
  let n = 0;
  for (const [kind, list] of [["outer", items.slice(0, split)], ["inner", items.slice(split)]]) {
    const ring = el("div", { class: `w-ring ${kind}` });
    list.forEach((item, i) => {
      const coin = el("span", { class: "w-coin", title: item.name }, logoNode(item.logo));
      coin.style.setProperty("--a", `${(360 / list.length) * i}deg`);
      coin.style.setProperty("--d", `${(n++) * 0.4}s`);
      ring.append(coin);
    });
    wheel.append(ring);
  }
  wheel.append(el("div", { class: "w-hub" }, el("img", { src: "logos/token-zec.svg", alt: "" }), el("b", {}, "Your ZEC"), el("small", {}, `${items.length} services`)));
}

function serviceCard(item) {
  return el("article", { class: "svc", "data-kind": item.kind },
    el("div", { class: "svc-head" }, logoNode(item.logo), el("div", {}, el("b", {}, item.name), el("small", {}, item.kind))),
    el("ul", { class: "pays", "aria-label": `${item.name}: which address types it can pay` },
      item.pays.map((p) => el("li", { class: p.answer, title: `${p.label}: ${ANSWER_WORD[p.answer]}` }, `${ANSWER[p.answer]} ${p.label}`))),
    el("p", { class: "meta" }, `Checked ${item.checked} · `, el("a", { href: item.source, target: "_blank", rel: "noopener noreferrer" }, `source (${item.sourceKind})`), " · ",
      el("a", { href: addServiceUrl(item.name), target: "_blank", rel: "noopener noreferrer" }, "correct this")),
  );
}

async function buildCoverage() {
  const table = await loadAcceptance();
  const { items, counts } = coverage(table.rows);
  if (!items.length) {
    $("cover-grid")?.replaceChildren(el("p", { class: "notice" }, "Couldn't load the exchange and wallet table. Reload the page to try again."));
    return;
  }
  $("cover-count").textContent = String(items.length);
  $("n-exchange").textContent = String(counts.exchange);
  $("n-wallet").textContent = String(counts.wallet);
  buildWheel(items);
  const grid = $("cover-grid");
  grid.replaceChildren(...items.map(serviceCard));
  for (const tab of document.querySelectorAll(".cover-tabs button")) {
    tab.addEventListener("click", () => {
      for (const t of document.querySelectorAll(".cover-tabs button")) {
        t.classList.toggle("on", t === tab);
        t.setAttribute("aria-selected", String(t === tab));
      }
      for (const card of grid.children) card.hidden = tab.dataset.kind !== "all" && card.dataset.kind !== tab.dataset.kind;
    });
  }
}

/** The tables' NEAR pin: fingerprint the data files exactly as this page loads them, compare with the last pin. */
async function checkPin() {
  const line = $("pin-line");
  if (!line) return;
  try {
    const files = await Promise.all(PIN_FILES.map(async (path) => {
      const res = await fetch(path, { cache: "no-store" });
      if (!res.ok) throw new Error(path);
      return { path, bytes: new Uint8Array(await res.arrayBuffer()) };
    }));
    const { root } = await dataRoot(files);
    line.textContent = pinLine(pinStatus(await fetchLastPin(fetch), root));
  } catch {
    line.textContent = pinLine({ state: "busy" });
  }
}

function start() {
  if (framed(window)) {
    document.body.replaceChildren(el("p", { class: "notice" }, "This page was opened inside another site. Open it directly: ", el("a", { href: SITE, target: "_top" }, SITE)));
    return;
  }
  $("ask").addEventListener("submit", (e) => {
    e.preventDefault();
    run($("q").value);
  });
  for (const b of document.querySelectorAll("[data-try]")) {
    b.addEventListener("click", () => {
      $("q").value = b.dataset.try;
      run(b.dataset.try);
    });
  }
  buildCoverage();
  checkPin();
  const m = /^#q=([0-9a-f]{64})$/i.exec(location.hash);
  if (m) {
    $("q").value = m[1];
    run(m[1]);
  }
}

start();
