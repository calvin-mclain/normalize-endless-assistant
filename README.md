# Normalize Endless Assistant

A read-only helper for the Normalize Entrainment Endless build in [PokéRogue](https://pokerogue.net):
party building, the carry phase and the running phase, with wave-by-wave advice from your synced save.

**Open it:** https://calvin-mclain.github.io/normalize-endless-assistant/

## It never plays the game for you

The assistant only reads. It sends no input to the game and never writes to the game's storage.
Saves reach it in one of three ways, all started by you:

- **Live link:** open PokéRogue from the assistant's Sync tab and run the bridge there; the game tab posts its save to the assistant tab.
- **Copy and paste** the save text.
- **Drop a `.prsv` export** onto the page.

The bridge reads only the `data_*` and `sessionData*_*` localStorage keys. Everything stays in your browser.

## Building

`index.html` is a single self-contained page. To rebuild it after editing `src/`:

```
node build/build.mjs
```

That writes `index.html` plus `dist/` copies. Needs Node 18 or later and no packages.

To test: `npm install`, `npx playwright install chromium` once, then `npm test`.

Game data in `data/game-data.json` was extracted from the PokéRogue source (`main`, 1.12.0.11).
PokéRogue and Pokémon names belong to their respective owners; this is an unofficial fan tool.
