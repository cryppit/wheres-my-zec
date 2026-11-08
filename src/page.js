// The paste box and the case card. Every piece of text from a source is set with textContent, never as HTML.
import { check, checkRoutes } from "./check.js";
import { framed } from "./frame-guard.js";
import { chainLogo, logoFor, routeLogo } from "./logos.js";

const SITE = "https://cryppit.github.io/wheres-my-zec/";
const INTENT_SENTINEL = "https://cryppit.github.io/intent-sentinel/";
const CHAIN_NAMES = { BSC: "BNB Chain", ETH: "Ethereum", BTC: "Bitcoin", SOL: "Solana", BASE: "Base", AVAX: "Avalanche", TRON: "Tron", XRP: "XRP Ledger", LTC: "Litecoin", DOGE: "Dogecoin", BCH: "Bitcoin Cash", ZEC: "Zcash" };
const $ = (id) => document.getElementById(id);

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

function renderCase(result) {
  const c = result.case;
  const card = el("article", { class: "case", "data-evidence": c.evidence },
    el("div", { class: "case-head" }, el("img", { src: routeLogo(c.route), alt: "" }), el("span", { class: "pill" }, c.evidence)),
    el("h2", { tabindex: "-1" }, c.title),
    el("ul", {}, c.lines.map((l) => el("li", {}, l))),
  );
  if (c.payoutAsset && chainLogo(c.payoutAsset)) {
    const chain = String(c.payoutAsset).split(".")[0];
    card.append(el("p", { class: "on-chain" }, el("img", { src: chainLogo(c.payoutAsset), alt: "" }), `Paid out on ${CHAIN_NAMES[chain] ?? chain}`));
  }
  if (c.services) {
    const groups = [["can", "Can pay it"], ["cant", "Can't pay it"], ["unknown", "Not checked yet"]];
    for (const [key, label] of groups) {
      if (c.services[key]?.length) card.append(el("div", { class: `group ${key}` }, el("h3", {}, label), el("ul", { class: "chips" }, c.services[key].map(chip))));
    }
    if (acceptance?.failed) card.append(el("p", { class: "notice" }, "Couldn't load the exchange and wallet table. Reload the page to try again."));
    else if (acceptance?.checked) card.append(el("p", { class: "hint" }, `From our table checked ${acceptance.checked}. Services change, so check with them too.`));
  }
  card.append(el("div", { class: "next" }, el("b", {}, "Who acts next"), c.next.text));
  if (c.links?.length) {
    card.append(el("p", { class: "links" }, c.links.map((l) => el("a", { href: l.url, target: "_blank", rel: "noopener noreferrer" }, l.label))));
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
  card.append(el("div", { class: "msg" }, el("label", { for: "msg" }, "A message to send them (only public facts in it):"), el("textarea", { id: "msg", readonly: true, rows: 6 }, c.message), copyButton(c.message, "Copy the message")));
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
  $("out").replaceChildren();
  $("status").textContent = "Reading the records…";
  try {
    const onStep = (s) => { if (mine === current) $("status").textContent = s; };
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
  const m = /^#q=([0-9a-f]{64})$/i.exec(location.hash);
  if (m) {
    $("q").value = m[1];
    run(m[1]);
  }
}

start();
