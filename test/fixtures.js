// Ported from cryppit/shield-receipt test/fixtures.ts (MIT, Cryppit); unchanged apart from removed types.
// Loads a recorded Blockchair fixture (scripts/record-fixture.mjs): the raw and dashboard responses for one txid.
import { readFileSync } from "node:fs";

                                                                           

export function fixture(name) {
  return JSON.parse(readFileSync(new URL(`./fixtures/${name}.json`, import.meta.url), "utf8")) ;
}

/** A deep copy of a fixture with `edit` applied to its decoded raw transaction and dashboard entry: for synthetic cases. */
export function edited(name, edit) {
  const f = fixture(name);
  const raw = f.raw ;
  const dash = f.dashboard ;
  edit(raw.data[f.txid].decoded_raw_transaction, dash.data[f.txid].transaction);
  return f;
}
