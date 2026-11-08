# Contributing

Corrections are the most useful thing you can send, especially to the tables in `data/`: if a row is wrong for an
exchange or wallet you know, open an issue or a pull request with a link to the source, and it will be fixed.

## Ground rules

- **Keyless and read-only.** No change may ask for, accept or send a seed phrase, private key or viewing key, store
  anything, or add analytics.
- **Every row and every claim links its source**, with the date it was checked. A claim with no public source does not
  go in.
- **A failed lookup never counts either way.** If a source can't be read, the answer is Unknown.
- **Never pair private halves** of a transaction or swap by amount or time.
- **Plain words.** Say what a person should do, not how the protocol works.

## Development

No dependencies. `npm test` runs `node --test`. Write the failing test first. `test/privacy.test.js` must pass: every
host the code fetches is in the page's CSP and named in the privacy note.
