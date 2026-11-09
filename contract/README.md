# Cryppit Pin v2 (`wmz-pin`)

A NEAR contract that pins, once a UTC day is over, one fingerprint of Where's My ZEC's published data tables
(`data/acceptance.json` and `data/restore.json`). Anyone can then prove what the tables said on a given day.

- **Rules.** Append-only. One pin per closed UTC day. Days only move forward. Each pin names the day pinned before it,
  so a skipped day is visible. Only the contract account itself may pin. No deposit is taken.
- **What it can't do.** No owner, no admin, no upgrade path once the account is locked. It holds no funds and no user
  data, only hashes of public files.
- **Fingerprint.** Each file is one leaf: `"<path>\n<sha256 hex of its bytes>"`. Leaves are in path order. The root is
  the RFC 6962 Merkle tree hash (`src/pin.js`, tested against independent vectors).
- **Interface.** `new({schema})` (once), `pin({day, merkle_root, leaf_count, prev_pin})`. Views: `get_pin({day})`,
  `last_pin()`, `schema()`, `contract_source_metadata()`. Events: NEP-297 `cryppit_pin` 2.0.0.

## Build and test

near-sdk 5.30.1, Rust 1.97.1 (`rust-toolchain.toml`), cargo-near 0.23.0.

```sh
cargo test                                   # 21 unit tests
cargo near build non-reproducible-wasm --locked
```

`res/wmz_pin.wasm` is the binary built that way (sha256 `0a1c54d51b785f19ff951420ca4b08f67a3ac4e44bbab4f57d159fb3e430c59d`).

## Deploy and lock (testnet; the founder signs every step)

```sh
# 1. Create the account, funded from cryppit.testnet
near account create-account fund-myself wmz-pin.cryppit.testnet '2 NEAR' autogenerate-new-keypair save-to-keychain sign-as cryppit.testnet network-config testnet sign-with-keychain send
# 2. Deploy and initialise in one transaction
near contract deploy wmz-pin.cryppit.testnet use-file contract/res/wmz_pin.wasm with-init-call new json-args '{"schema":"wheres-my-zec/data@1"}' prepaid-gas '30 Tgas' attached-deposit '0 NEAR' network-config testnet sign-with-keychain send
# 3. Add a key that can only call `pin` on this contract
near account add-key wmz-pin.cryppit.testnet grant-function-call-access --allowance '0.5 NEAR' --contract-account-id wmz-pin.cryppit.testnet --function-names 'pin' autogenerate-new-keypair save-to-keychain network-config testnet sign-with-keychain send
# 4. List the keys, then delete the full-access one (the account is now locked: nobody can redeploy or move its NEAR)
near account list-keys wmz-pin.cryppit.testnet network-config testnet now
near account delete-keys wmz-pin.cryppit.testnet public-keys <the FullAccess public key> network-config testnet sign-with-keychain send
```

## Pin a day, verify a day

```sh
node tools/pin.mjs command 2026-11-09   # prints the near command for that closed day; signs nothing
node tools/pin.mjs verify  2026-11-09   # recomputes the root from git and compares it with the contract
```

A day's root is over the data files at the last `origin/main` commit on or before the end of that UTC day.
