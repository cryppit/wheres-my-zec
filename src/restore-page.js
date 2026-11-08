// "My wallet shows zero": three steps (what happened, which wallet, what to do) over the dated table of known causes.
// Text is set with textContent only. Nothing is sent anywhere: the table is a file on this site.
import { framed } from "./frame-guard.js";
import { SITUATIONS, badgeFor, causesFor, walletsFor } from "./restore.js";
import { logoFor } from "./logos.js";

const SITE = "https://cryppit.github.io/wheres-my-zec/restore.html";
const $ = (id) => document.getElementById(id);
const PARTY = { you: "You can fix this yourself.", wallet: "The wallet's team has to fix this. Until then, your coins stay where they are.", nobody: "Nobody can change this." };
const ICONS = {
  restored: "M4 12a8 8 0 1 0 2.3-5.6M4 4v4h4",
  "after-update": "M12 3v12m0 0l-4-4m4 4l4-4M5 21h14",
  "send-failed": "M5 12h12m0 0l-4-4m4 4l-4 4M19 5v14",
  "old-funds": "M7 14a4 4 0 1 1 3.5-6H21v3h-2v3h-3v-3h-5.5A4 4 0 0 1 7 14z",
};

function el(tag, attrs = {}, ...kids) {
  const n = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) if (v !== undefined && v !== null && v !== false) n.setAttribute(k, String(v));
  for (const kid of kids.flat()) if (kid !== null && kid !== undefined && kid !== false) n.append(kid instanceof Node ? kid : document.createTextNode(String(kid)));
  return n;
}
function icon(d) {
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("viewBox", "0 0 24 24");
  svg.setAttribute("aria-hidden", "true");
  const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
  path.setAttribute("d", d);
  svg.append(path);
  return svg;
}
function logo(name) {
  const l = logoFor(name);
  return l.src ? el("img", { src: l.src, alt: "", class: l.light ? "light" : null }) : el("span", { class: "mono", "aria-hidden": "true" }, l.mono);
}
function button(cls, onClick, ...kids) {
  const b = el("button", { class: cls, type: "button" }, ...kids);
  b.addEventListener("click", onClick);
  return b;
}
function stepTo(n) {
  for (const i of [1, 2, 3]) $(`step-${i}`).className = i === n ? "on" : i < n ? "done" : "";
}
function show(...nodes) {
  $("flow").replaceChildren(...nodes.flat());
  $("flow").querySelector("h2")?.focus({ preventScroll: true });
}

let rows = [];

function pickSituation() {
  stepTo(1);
  show(
    el("h2", { tabindex: "-1" }, "What happened?"),
    el("div", { class: "tiles" }, SITUATIONS.map((s) => button("tile", () => pickWallet(s), icon(ICONS[s.id]), el("b", {}, s.title), el("span", {}, s.line)))),
  );
}

function pickWallet(situation) {
  stepTo(2);
  const wallets = walletsFor(rows, situation.id);
  show(
    el("p", { class: "crumb" }, situation.title),
    el("h2", { tabindex: "-1" }, "Which wallet shows zero, or is involved?"),
    el("div", { class: "wallets" },
      wallets.map((w) => button("wallet", () => answer(situation, w), logo(w), el("b", {}, w))),
      button("wallet other", () => answer(situation, null), el("span", { class: "mono", "aria-hidden": "true" }, "?"), el("b", {}, "Not sure / another wallet")),
    ),
    el("p", { class: "back" }, button("btn", pickSituation, "← Back")),
  );
}

function causeCard(r) {
  const steps = r.advice.split(/(?<=[.!?])\s+(?=[A-Z])/).filter(Boolean);
  const badge = badgeFor(r);
  const link = (url, label) => el("a", { href: url, target: "_blank", rel: "noopener noreferrer" }, label);
  return el("article", { class: "fix" },
    el("div", { class: "fix-top" },
      el("ul", { class: "chips" }, r.wallets.map((w) => el("li", { class: "chip" }, logo(w), w))),
      el("span", { class: `badge-sure ${badge.level}` }, badge.label),
    ),
    el("h3", {}, r.symptom),
    el("p", { class: "meta" }, r.when),
    el("ol", { class: "todo" }, steps.map((s) => el("li", {}, s))),
    el("div", { class: "next" }, el("b", {}, "Who acts next"), PARTY[r.nextParty] ?? ""),
    el("p", { class: "meta" }, `Checked ${r.checked} · `, link(r.source, r.sourceKind === "official" ? "the wallet's guide" : "the users' report"),
      r.confirmedBy ? [" · ", link(r.confirmedBy.url, "confirmed here")] : null),
  );
}

function answer(situation, wallet) {
  stepTo(3);
  const causes = causesFor(rows, situation.id, wallet);
  show(
    el("p", { class: "crumb" }, `${situation.title} · ${wallet ?? "Any wallet"}`),
    el("h2", { tabindex: "-1" }, causes.length === 1 ? "Here's the known cause" : causes.length ? `${causes.length} known causes` : "No known cause yet"),
    causes.length ? causes.map(causeCard) : el("p", {}, "We don't know of one for this wallet yet. Try \"Not sure\", or check a transaction ID on the main page."),
    el("p", { class: "back" }, button("btn", () => pickWallet(situation), "← Pick another wallet"), " ", button("btn", pickSituation, "Start over")),
  );
}

async function start() {
  if (framed(window)) {
    document.body.replaceChildren(el("p", { class: "notice" }, "This page was opened inside another site. Open it directly: ", el("a", { href: SITE, target: "_top" }, SITE)));
    return;
  }
  try {
    const res = await fetch("data/restore.json", { cache: "no-store" });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    rows = (await res.json()).rows ?? [];
  } catch {
    show(el("p", { class: "notice" }, "Couldn't load the table of known causes. Please reload the page."));
    return;
  }
  pickSituation();
}

start();
