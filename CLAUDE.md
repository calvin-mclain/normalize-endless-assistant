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
- Two readers: someone learning the build and someone who already runs it. The bar's Explain/Compact toggle
  (`settings.density`) serves both. Teaching prose (why a check exists, how a step works, what a panel is for)
  is tagged `teach` (`H.teach(...)` or the class) and hidden in Compact; state (verdicts, ticks, counts, what is
  missing) is never tagged. Reference panels (rules, background) pass `ref` to `H.panel` and fold in Compact.
  Tag new prose accordingly, and state each rule in one place.
- `data/game-data.json` — compact data extracted from the PokéRogue source (`main`). Refresh it with
  `node build/update_data.mjs` (or `npm run data`): one command that fetches a sparse checkout of the game and its
  English locale into the OS temp dir, parses the data files, writes the JSON and prints a short summary of what
  changed (version, counts, changed species, moves, abilities, sets, egg moves, events). Read that summary instead
  of the file; `--check` compares without writing, `--verbose` lists everything. Then rebuild, run the tests and
  commit `data/game-data.json` with `index.html`. The `events` key holds the game's timed events; the page shows
  the active one (`data.activeEvents`).
- `build/make_samples.mjs` — the sample saves the page offers.

## Strategy facts the player has corrected (do not regress)

- Never buy lures once running: Gouot and Teddiurk's lure abilities guarantee every wave. In the carry phase,
  take one: Regigigas has no lure, so Illuminate is the only source on the field (1 in 2 normal waves alone,
  guaranteed with a lure item). Each lure item tier and each lure ability or passive on the field divides the
  odds by 4 (`BattleScene.getDoubleBattleChance`).
- Land's Wrath is a spread move (`ALL_NEAR_ENEMIES`), in the Rock Slide slot, not the single-target slot.
- Check strategy and mechanics claims against the PokéRogue source at the commit the data came from, not only
  the guide notes.
- Lucky Eggs and Golden Eggs are never in the shop. They only come off wild Pokémon (Thief, Mini Black Hole,
  or a catch).
- Vitamins cannot be stolen. Carbos come through fuse-and-dump instead.
- While running, the goal is Speed (400,000 on Gouot and Jynxgigas by wave 5850, `kb.SPEED_TARGET`). Eggs exist
  only for that: once a holder is there its egg targets count as met (`advisor.speedGoal`, `itemAudit`). A catch
  pays EXP like a win (`AttemptCapturePhase` queues `VictoryPhase`); fleeing pays none. A party member that did not
  fight earns nothing without EXP Share: each share gives 20 % of the EXP divided by the number of fighters
  (`BattleScene.applyPartyExp`), so five shares in a double battle give benched Jynxgigas half of every catch.
- The Running tab has no Doubles chain panel: both fusions guarantee every wave. The verdict warns when Gouot is not
  in slot 1 or a lure holder is fainted.
- Wrong Pokémon led a wave: switch to one of the two extra Pokémon and let it faint. The replacement after
  a faint comes in without taking a hit.
- "Worth catching" mirrors the game's grey Poké Ball (`EnemyBattleInfo`): a missing shiny, variant, gender
  or form bit for the species, or an ability the root starter has not unlocked (`advisor.dexNews`). Say only
  that something is new, never what. Natures are not counted.

## Save format

CryptoJS AES (OpenSSL "Salted__", MD5 key derivation, AES-256-CBC), passphrase `x0i2O7WRiANTqPmZ`.
localStorage keys `data_<user>` and `sessionData<slot>_<user>`.

## Shipping

No pull requests. Work on a branch, then merge it into `main` locally with a fast-forward only (`git merge --ff-only`)
and push `main`. If `main` has moved, merge `main` into the branch (or rebase onto it) first so the update of `main` stays a fast-forward.

## Tests

Run `npm test` before every commit (after `npm install` and `npx playwright install chromium` once).
Commit `package-lock.json` with any dependency change; CI installs from it with `npm ci`.

- `test/data.test.mjs`, `test/save.test.mjs`, `test/advisor.test.mjs` — logic only, plain Node (`npm run test:logic`).
- `test/ui.test.mjs` — rebuilds, then drives the page in headless Chromium: every tab and control, the three
  sync channels, the live link across two origins, and a check that the page has no way to send input or
  write game storage (`npm run test:ui`).
- `test/fixtures/saves/` — PokéRogue's own test saves (see the README there).
- `npm run shots` writes screenshots to `test/shots/` for a visual check.

Add a test with every advisor change. CI (`.github/workflows/test.yml`) runs the suite and fails if the
committed `index.html` does not match a fresh build.
