# Where's My ZEC

Paste a Zcash transaction ID or address. See **where the ZEC is**, **who has to act next**, and **what to send them**.

Live: https://cryppit.github.io/wheres-my-zec/

Keyless and read-only: it never asks for a seed phrase, private key or viewing key (it refuses them if pasted), never
holds funds, and never signs anything. Nothing is stored.

## NEAR HACKATHON (Nov 2026)

Built for NEAR HACKATHON, 1–14 Nov 2026. Every commit in this repository is from 9 Nov 2026 onward, inside the window.

**What it does on NEAR.** ZEC that someone sent into the NEAR Omni bridge can get stuck. The bridge lets the depositor
request a refund themselves, but only while its Zcash light client on NEAR (`zcash-client.bridge.near`) still holds the
deposit's block. Since Zcash's NU7 upgrade (6 Nov 2026) blocks are 25 seconds apart, so the client's 103,680 blocks last
about 30 days, not 90, and older deposits lose that option silently. Where's My ZEC finds a deposit through the bridge's
records, then reads the light client directly from NEAR (`get_mainchain_size`, `get_last_block_header`, `get_config`,
public view calls that carry nothing about the person) and tells them how many days are left, or that the window has
closed and who can still help. Swaps through NEAR Intents are handed to Intent Sentinel.

**Tracks:** Privacy & Private AI (keyless, refuses seeds and keys, shielded-aware); Open Innovation.

**Our other project.** Per the rules (Q-015), Cryppit has one other, independent entry: **Intent Sentinel**
(https://github.com/cryppit/intent-sentinel), a stuck-swap case file for NEAR Intents across 31 chains. This project
links to it for NEAR Intents swaps; the code bases are separate.

**Baseline (Q-001, Q-005).** Ported from Cryppit's own earlier MIT projects and listed as baseline, not hackathon work:
the address, transaction and landing modules from Shield Receipt (`src/zcash-address.js`, `src/address.js`,
`src/fetch.js`, `src/tx.js`, `src/judge.js`, `src/copy.js` and their tests), and the Omni refund rules behind the
Zcash Refund Helper, which this page links to. New in the window: the input reader, the THORChain, Omni and NEAR
light-client routes, the case file, the page, the dated tables and the "my wallet shows zero" flow.

## What it answers

- **A transaction ID.** Whether it confirmed and which pools received value (from the chain, so **Proven**). If it
  carries a THORChain swap instruction, what THORChain did with it: swapped, partly swapped, sent back (and why), too
  small to send back, or still pending (THORChain's own records, so **Reported**). On request, whether it was a deposit
  into the Omni bridge, with a link to the [Refund Helper](https://cryppit.github.io/zec-refund-helper/) for the status
  and refund steps.
- **An address.** What kind it is (transparent, TEX, Sapling, unified), who can pay it from a transparent or a shielded
  balance, and which exchanges and wallets can send to it, from a dated table with a source for every row.
- **"My wallet shows zero."** The known reasons a restored or upgraded wallet shows nothing, filtered by the wallets
  you used, each dated and sourced. It never asks for a seed.
- **Swaps through NEAR Intents** and other chains are handed to
  [Intent Sentinel](https://cryppit.github.io/intent-sentinel/), which follows them step by step.

Every answer ends with who acts next (you, a service, or nobody) and a ready message with only public facts in it.

## How sure each answer is

| Word | Meaning |
|---|---|
| Proven | The Zcash chain's own record shows it. |
| Reported | A service's own records say so (THORChain, the Omni bridge). |
| Inferred | The facts fit, but nothing proves it. |
| Not visible | A shielded step the chain doesn't show. |
| Unknown | We couldn't check, and we say so. A failed lookup is never "not found". |

## Who sees what

- An address is answered in the page. Nothing is sent.
- For a transaction, only its ID goes to `api.blockchair.com`.
- If it carries a THORChain instruction, only its ID also goes to THORChain's public records (`gateway.liquify.com`,
  or `midgard.ninerealms.com` as a fallback).
- Only when you press "Check bridges and swaps", the transaction's public transparent output addresses go to the Omni
  bridge's records (`mainnet.api.bridge.nearone.org`). If one is an Omni deposit, the page also reads NEAR's Zcash light
  client from `rpc.mainnet.fastnear.com`, with view calls that send nothing about you or the transaction.
- Those services see your IP address. No cookies, no analytics, no storage. `test/privacy.test.js` keeps the page's
  Content-Security-Policy, the code and this list in step.

It never pairs the private halves of a transaction or swap by amount or time.

## Run it

Plain ES modules, no dependencies, no build step. Node 22.15 or later.

```sh
npm test                                   # node --test
python3 -m http.server 5097 --bind 127.0.0.1   # then open http://127.0.0.1:5097
```

## Sources and credits

- Address decoding, transaction reading and the landing words are ported from
  [Shield Receipt](https://github.com/cryppit/shield-receipt) (MIT, Cryppit), with its tests and the ZIP 316 test
  vectors from [zcash-test-vectors](https://github.com/zcash/zcash-test-vectors).
- Omni bridge deposits are handed to the [Refund Helper](https://github.com/cryppit/zec-refund-helper) (MIT, Cryppit).
- The tables in `data/` cite a source and a date on every row. They include facts from
  [CanIShield](https://canishield.vercel.app) (CC BY 4.0) and [ZecHub](https://zechub.wiki) (CC BY-SA 4.0), so the
  tables are CC BY-SA 4.0 (`data/LICENSE`).

Code: MIT licence. By Cryppit.
