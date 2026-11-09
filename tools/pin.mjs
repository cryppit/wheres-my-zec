#!/usr/bin/env node
// Cryppit Pin v2 helper. It never signs or sends anything: it prints the near CLI command for the founder to run.
//
//   node tools/pin.mjs command [YYYY-MM-DD]   the pin command for a closed UTC day (default: yesterday)
//   node tools/pin.mjs verify  YYYY-MM-DD     recompute that day's root from git and compare it with the contract
//
// A day's root is over the data files as published on origin/main at the end of that UTC day.
import { execFileSync } from "node:child_process";
import { PIN_FILES, PIN_ACCOUNT, dataRoot, fetchLastPin, pinCommand } from "../src/pin.js";

const git = (...args) => execFileSync("git", args, { encoding: "buffer", maxBuffer: 64 << 20 });
const isDay = (d) => /^\d{4}-\d{2}-\d{2}$/.test(d) && !Number.isNaN(Date.parse(`${d}T00:00:00Z`));

function yesterday() {
  return new Date(Date.now() - 86_400_000).toISOString().slice(0, 10);
}

/** The last origin/main commit at or before the end of `day` (UTC), and the root over its data files. */
async function rootAt(day) {
  git("fetch", "--quiet", "origin", "main");
  const rev = git("rev-list", "-1", `--before=${day}T23:59:59Z`, "origin/main").toString().trim();
  if (!rev) throw new Error(`no origin/main commit on or before ${day}`);
  const files = PIN_FILES.map((path) => ({ path, bytes: new Uint8Array(git("show", `${rev}:${path}`)) }));
  return { rev, ...(await dataRoot(files)) };
}

async function getPin(day) {
  const args = Buffer.from(JSON.stringify({ day })).toString("base64");
  const res = await fetch("https://rpc.testnet.fastnear.com", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "query", params: { request_type: "call_function", finality: "final", account_id: PIN_ACCOUNT, method_name: "get_pin", args_base64: args } }),
  });
  const bytes = (await res.json())?.result?.result;
  if (!Array.isArray(bytes)) throw new Error("couldn't read the contract");
  return JSON.parse(Buffer.from(bytes).toString("utf8"));
}

const [cmd, dayArg] = process.argv.slice(2);
if (cmd === "command") {
  const day = dayArg ?? yesterday();
  if (!isDay(day)) throw new Error(`not a day: ${day}`);
  if (day >= new Date().toISOString().slice(0, 10)) throw new Error(`${day} isn't over yet in UTC; the contract pins closed days only`);
  const last = await fetchLastPin(fetch);
  if (last?.busy) throw new Error("couldn't read the contract's last pin; try again");
  const { rev, root, leafCount } = await rootAt(day);
  console.log(`day ${day}  commit ${rev.slice(0, 12)}  files ${leafCount}  root ${root}  previous pin ${last?.day ?? "none"}`);
  if (last && day <= last.day) {
    console.log(`Nothing to pin: ${last.day} is already pinned.`);
  } else {
    console.log("\nRun this yourself (it signs with the pin account's key in your keychain):\n");
    console.log(pinCommand({ day, root, leafCount, prevPin: last?.day ?? null }));
  }
} else if (cmd === "verify") {
  if (!isDay(dayArg ?? "")) throw new Error("usage: node tools/pin.mjs verify YYYY-MM-DD");
  const [pin, mine] = await Promise.all([getPin(dayArg), rootAt(dayArg)]);
  if (!pin) {
    console.log(`${dayArg} is not pinned on ${PIN_ACCOUNT}.`);
    process.exit(1);
  }
  const ok = pin.merkle_root === mine.root && pin.leaf_count === mine.leafCount;
  console.log(`${dayArg}: contract ${pin.merkle_root} (${pin.leaf_count} files, block ${pin.block_height})`);
  console.log(`${dayArg}: git      ${mine.root} (${mine.leafCount} files, commit ${mine.rev.slice(0, 12)})`);
  console.log(ok ? "MATCH: the tables published that day are exactly what was pinned." : "MISMATCH: the published tables differ from the pin.");
  process.exit(ok ? 0 : 2);
} else {
  console.log("usage: node tools/pin.mjs command [YYYY-MM-DD] | verify YYYY-MM-DD");
}
