// The paste box and the case card. Every piece of text from a source is set with textContent, never as HTML.
import { check, checkRoutes } from "./check.js";
import { framed } from "./frame-guard.js";

const SITE = "https://cryppit.github.io/wheres-my-zec/";
const INTENT_SENTINEL = "https://cryppit.github.io/intent-sentinel/";
const $ = (id) => document.getElementById(id);
/** Today in the reader's own time zone, as YYYY-MM-DD. */
const today = () => new Date().toLocaleDateString("en-CA");

/** An element with attributes and children; strings become text nodes. */
function el(tag, attrs = {}, ...kids) {
  const n = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v === undefined || v === null || v === false) continue;
    if (k.startsWith("on")) n.addEventListener(k.slice(2), v);
    else n.setAttribute(k, v === true ? "" : String(v));
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

let acceptance = null;
async function loadAcceptance() {
  if (acceptance) return acceptance;
  try {
    const res = await fetch("data/acceptance.json", { cache: "no-store" });
    acceptance = res.ok ? await res.json() : { rows: [] };
  } catch {
    acceptance = { rows: [] };
  }
  return acceptance;
}

function renderCase(result) {
  const c = result.case;
  const card = el("article", { class: "case", "data-evidence": c.evidence },
    el("span", { class: "pill" }, c.evidence),
    el("h2", {}, c.title),
    el("ul", {}, c.lines.map((l) => el("li", {}, l))),
    el("div", { class: "next" }, el("b", {}, "Who acts next"), c.next.text),
  );
  if (c.links?.length) {
    card.append(el("p", { class: "links" }, c.links.map((l) => el("a", { href: l.url, target: "_blank", rel: "noopener noreferrer" }, l.label))));
  }
  if (c.copy) card.append(el("p", { class: "links" }, copyButton(c.copy, "Copy the ID")));
  if (c.canCheckRoutes) {
    const go = el("button", { class: "btn", type: "button" }, "Check bridges and swaps");
    go.addEventListener("click", async () => {
      go.disabled = true;
      go.textContent = "Checking…";
      show(await checkRoutes(result, { fetchImpl: fetch, now: today() }));
    });
    card.append(el("div", { class: "routes" },
      el("p", {}, "Was this a deposit into a bridge? This sends the transaction's public transparent output addresses to the Omni bridge's records, and nothing else."),
      go,
      el("p", {}, "Swapped through NEAR Intents? Copy the ID and check it in ", el("a", { href: INTENT_SENTINEL, target: "_blank", rel: "noopener noreferrer" }, "Intent Sentinel"), ", which follows the swap step by step."),
      copyButton(result.input.value, "Copy the ID"),
    ));
  }
  const box = el("textarea", { id: "msg", readonly: true, rows: 6 }, c.message);
  card.append(el("div", { class: "msg" }, el("label", { for: "msg" }, "A message to send them (nothing private in it):"), box, copyButton(c.message, "Copy the message")));
  return card;
}

function show(result) {
  const out = $("out");
  $("status").textContent = "";
  if (result.refused) out.replaceChildren(el("p", { class: "notice refused", role: "alert" }, result.refused));
  else if (result.error) out.replaceChildren(el("p", { class: "notice" }, result.error));
  else out.replaceChildren(renderCase(result));
}

async function run(raw) {
  const go = $("go");
  go.disabled = true;
  $("out").replaceChildren();
  $("status").textContent = "Reading the records…";
  try {
    show(await check(raw, { fetchImpl: fetch, now: today(), acceptance: await loadAcceptance() }));
  } catch {
    show({ error: "Something went wrong on this page. Nothing was decided; please try again." });
  } finally {
    go.disabled = false;
  }
}

function start() {
  if (framed(window)) {
    document.body.replaceChildren(el("p", { class: "notice" }, "This page was opened inside another site. Open it directly: ", el("a", { href: SITE, target: "_top" }, SITE)));
    return;
  }
  $("ask").addEventListener("submit", (e) => {
    e.preventDefault();
    const raw = $("q").value;
    // Only transaction IDs go into the link, so a shared link never carries a seed, key or address by accident.
    if (/^[0-9a-f]{64}$/i.test(raw.trim())) history.replaceState(null, "", `#q=${raw.trim().toLowerCase()}`);
    else history.replaceState(null, "", location.pathname);
    run(raw);
  });
  for (const b of document.querySelectorAll("[data-try]")) {
    b.addEventListener("click", () => {
      $("q").value = b.dataset.try;
      $("ask").requestSubmit();
    });
  }
  const m = /^#q=([0-9a-f]{64})$/i.exec(location.hash);
  if (m) {
    $("q").value = m[1];
    run(m[1]);
  }
}

start();
