# Normalize Endless Assistant — notes for Claude

A single-page, read-only helper for the PokéRogue Normalize Entrainment Endless build. GitHub Pages serves
`index.html` from `main` (root). Rebuild with `node build/build.mjs` (Node 18+, no packages) after any change
in `src/`, and commit the rebuilt `index.html` with it.

## Hard rule

The assistant must never play the game. No input sent to the game, no writes to the game's localStorage or
any other game state. The bridge only *reads* keys matching `/^(sessionData\d*|data)_/` and posts them to the
assistant tab (`window.opener.postMessage`, game origin checked on receipt). Keep it that way.

## Layout

- `src/js/` — loaded in filename order. `00-util`, `10-data` (game data accessors), `20-kb` (strategy text:
  roles, steps, shop rules, item notes, troubleshooting), `30-save` (decrypt and normalise saves), `40-42`
  advisor logic (no DOM), `50-61` UI and the bridge, `90-main`.
- `src/styles.css`, `src/head.html`, `src/body.html`.
- `data/game-data.json` — compact data extracted from PokéRogue `main` 1.12.0.11. `build/build_data.py` made
  it from a raw extraction that is not in this repo.
- `build/make_samples.mjs` — the sample saves the page offers.

## Strategy facts the player has corrected (do not regress)

- Never buy lures. The lure abilities do that job.
- Lucky Eggs and Golden Eggs are never in the shop. They only come off wild Pokémon (Thief, Mini Black Hole,
  or a catch).
- Vitamins cannot be stolen. Carbos come through fuse-and-dump instead.
- Wrong Pokémon led a wave: switch to one of the two extra Pokémon and let it faint. The replacement after
  a faint comes in without taking a hit.
- "Worth catching" mirrors the game's grey Poké Ball (`EnemyBattleInfo`): a missing shiny, variant, gender
  or form bit for the species, or an ability the root starter has not unlocked (`advisor.dexNews`). Say only
  that something is new, never what. Natures are not counted.

## Save format

CryptoJS AES (OpenSSL "Salted__", MD5 key derivation, AES-256-CBC), passphrase `x0i2O7WRiANTqPmZ`.
localStorage keys `data_<user>` and `sessionData<slot>_<user>`.

## Tests

The original test suite (advisor, data, save decrypt, 45 Playwright UI checks) depended on a local
checkout of the PokéRogue source for fixture saves and was not carried into this repo. When changing
advisor logic, at minimum load the page and check the sample saves on every tab with no console errors.
