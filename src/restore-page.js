// "My wallet shows zero": the dated table of known causes, filtered by the wallets someone picks. Text is set with
// textContent only. Nothing is sent anywhere: the table is a file on this site.
import { framed } from "./frame-guard.js";
import { matchRestore, walletsIn } from "./restore.js";

const SITE = "https://cryppit.github.io/wheres-my-zec/restore.html";
const $ = (id) => document.getElementById(id);
const PARTY = { you: "You can fix this yourself.", wallet: "The wallet's team has to fix this.", nobody: "Nobody can change this." };

function el(tag, attrs = {}, ...kids) {
  const n = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) if (v !== undefined && v !== null) n.setAttribute(k, String(v));
  for (const kid of kids.flat()) if (kid !== null && kid !== undefined && kid !== false) n.append(kid instanceof Node ? kid : document.createTextNode(String(kid)));
  return n;
}

function render(rows) {
  const picked = matchRestore(rows, $("before").value, $("now").value);
  $("status").textContent = picked.length ? `${picked.length} known cause${picked.length === 1 ? "" : "s"}` : "No known cause for these wallets yet.";
  $("fixes").replaceChildren(...picked.map((r) => el("article", { class: "fix" },
    el("h3", {}, r.symptom),
    el("p", { class: "meta" }, `${r.wallets.join(", ")} · ${r.when}`),
    el("p", {}, r.advice),
    el("p", {}, PARTY[r.nextParty] ?? ""),
    el("p", { class: "meta" }, `Checked ${r.checked} · `, el("a", { href: r.source, target: "_blank", rel: "noopener noreferrer" }, `source (${r.sourceKind})`)),
  )));
}

async function start() {
  if (framed(window)) {
    document.body.replaceChildren(el("p", { class: "notice" }, "This page was opened inside another site. Open it directly: ", el("a", { href: SITE, target: "_top" }, SITE)));
    return;
  }
  let rows = [];
  try {
    const res = await fetch("data/restore.json", { cache: "no-store" });
    rows = res.ok ? (await res.json()).rows ?? [] : [];
  } catch {
    $("status").textContent = "Couldn't load the table of known causes. Please reload the page.";
    return;
  }
  for (const id of ["before", "now"]) for (const w of walletsIn(rows)) $(id).append(el("option", { value: w }, w));
  for (const id of ["before", "now"]) $(id).addEventListener("change", () => render(rows));
  render(rows);
}

start();
