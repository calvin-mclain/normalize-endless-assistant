import { fileURLToPath } from "node:url";
// Drives the built page in headless Chromium: every control, the three sync channels, and the read-only guarantee.
// Two local origins stand in for "the assistant" and "the game tab".
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || "playwright");
import http from "node:http";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import * as samples from "../build/make_samples.mjs";
import { encryptPrsv } from "./prsv.mjs";

const ROOT = fileURLToPath(new URL("..", import.meta.url)).replace(/\/$/, "");
const FIXTURES = `${ROOT}/test/fixtures/saves`;
const pageHtml = readFileSync(`${ROOT}/dist/normalize-assistant-offline.html`, "utf8");
const gameHtml = `<!doctype html><html><head><meta charset="utf-8"><title>Fake game</title></head><body style="margin:0;background:#222"><canvas id="game" width="640" height="360" tabindex="0"></canvas></body></html>`;

function serve(html) {
  return new Promise(resolve => {
    const srv = http.createServer((req, res) => { res.writeHead(200, { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" }); res.end(html); });
    srv.listen(0, "127.0.0.1", () => resolve(srv));
  });
}
const appSrv = await serve(pageHtml), gameSrv = await serve(gameHtml), otherSrv = await serve(gameHtml);
const APP = `http://127.0.0.1:${appSrv.address().port}/`;
const GAME = `http://localhost:${gameSrv.address().port}/`;          // a different origin from APP
const OTHER = `http://localhost:${otherSrv.address().port}/`;

const browser = await chromium.launch();
const results = [], notes = [];
let failed = 0;
async function check(name, fn) {
  try { await fn(); results.push(`ok    ${name}`); }
  catch (e) { failed++; results.push(`FAIL  ${name}\n      ${String(e && e.message || e).split("\n").slice(0, 6).join("\n      ")}`); }
}
function watch(page, errors, label) {
  page.on("console", m => { if (m.type() === "error" && !/ERR_TUNNEL_CONNECTION_FAILED|ERR_NAME_NOT_RESOLVED|ERR_INTERNET_DISCONNECTED|ERR_CONNECTION|Failed to load resource/.test(m.text())) errors.push(`${label}: ${m.text()}`); });
  page.on("pageerror", e => errors.push(`${label}: PAGEERROR ${e.message}`));
}
async function fresh(opts = {}) {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 }, ...opts });
  const errors = [];
  const page = await ctx.newPage();
  watch(page, errors, "app");
  await page.goto(APP);
  await page.waitForSelector(".view-head");
  return { ctx, page, errors };
}
const text = (page, sel) => page.locator(sel).first().innerText();
const h1 = page => text(page, ".view-head h1");
const settle = page => page.waitForTimeout(350);     // state is saved on a 250 ms debounce

const encCarry = encryptPrsv(JSON.stringify(samples.carrySample()));
const encShiny = encryptPrsv(JSON.stringify(samples.shinySample()));
const plainRaw = samples.plainSample();
const encPlain = encryptPrsv(JSON.stringify(plainRaw));
const sysFull = readFileSync(`${FIXTURES}/full_unlocks_sanitized.prsv`, "utf8");
const sysNew = readFileSync(`${FIXTURES}/data_new.prsv`, "utf8");

// =====================================================================================================================
// 1. Phases and manual controls
// =====================================================================================================================
{
  const { ctx, page, errors } = await fresh();

  await check("opens on Party building, three phases and a sync pill in the bar", async () => {
    assert.equal(await h1(page), "Party building");
    assert.equal(await page.locator(".phase-btn").count(), 3);
    assert.match(await text(page, "#tab-sync"), /Not synced/);
    assert.equal(await page.title(), "Normalize Endless Assistant");
  });

  await check("phase tabs switch views", async () => {
    await page.click("#tab-carry"); assert.equal(await h1(page), "Carry");
    await page.click("#tab-run"); assert.equal(await h1(page), "Running");
    await page.click("#tab-sync"); assert.match(await h1(page), /^Sync$/);
    await page.click("#tab-party"); assert.equal(await h1(page), "Party building");
    assert.equal(await page.getAttribute("#tab-party", "aria-selected"), "true");
  });

  await check("party: budget starts 5 over and reacts to reductions", async () => {
    assert.match(await text(page, ".meter-top strong"), /20 \/ 15/);
    assert.match(await text(page, ".callout.warn"), /5 over/);
    const plus = role => page.click(`.stepper button[data-bind="reductions.${role}"][data-d="1"]`);
    await plus("carry"); await plus("carry"); await plus("runner"); await plus("runner"); await plus("killer");
    assert.match(await text(page, ".meter-top strong"), /15 \/ 15/);
    assert.match(await text(page, ".panel .callout.good"), /15 of 15 points/);
    await plus("carry");   // capped at two
    assert.match(await text(page, ".meter-top strong"), /15 \/ 15/);
  });

  await check("party: a hand tick marks an unlock and updates the card's status", async () => {
    const card = page.locator(".role-card").nth(5);   // tutor: one check to confirm
    assert.match(await card.locator(".role-top .pill").innerText(), /1 to confirm/i);
    await card.locator('button.mark[data-act="unlock"]').first().click();
    assert.match(await page.locator(".role-card").nth(5).locator(".role-top .pill").innerText(), /ready/i);
    assert.equal(await page.locator(".role-card").nth(5).locator('button.mark[data-act="unlock"]').first().getAttribute("aria-pressed"), "true");
  });

  await check("party: picking an alternative starter re-checks the role", async () => {
    const combee = await page.evaluate(() => NZ.data.S.COMBEE);
    await page.selectOption("#pick-runner", String(combee));
    const card = page.locator(".role-card").nth(2);
    assert.match(await card.innerText(), /Passive: Run Away/);
    assert.match(await card.innerText(), /alternative/i);
    const sentret = await page.evaluate(() => NZ.data.S.SENTRET);
    const hasSentret = await page.locator(`#pick-runner option[value="${sentret}"]`).count();
    assert.equal(hasSentret, 0, "a starter without the Run Away passive is not offered");
    await page.selectOption("#pick-runner", String(await page.evaluate(() => NZ.data.S.TEDDIURSA)));
  });

  await check("carry: splice steps tick by hand and the meter follows", async () => {
    await page.click("#tab-carry");
    assert.match(await text(page, ".meter-top strong"), /0 \/ 18/);
    await page.click('button.mark[data-act="step-toggle"][data-id="s2"]');
    assert.match(await text(page, ".meter-top strong"), /1 \/ 18/);
    assert.equal(await page.locator(".step.done").count(), 1);
    await page.click('button.mark[data-act="step-toggle"][data-id="s2"]');
    assert.match(await text(page, ".meter-top strong"), /0 \/ 18/);
  });

  await check("carry: 'Who has it' opens with candidates from game data", async () => {
    const d = page.locator('details[data-open-id="cand-s3"]');
    await d.locator("summary").click();
    await page.waitForSelector('details[data-open-id="cand-s3"] .chip');
    const body = await d.locator(".details-body").innerText();
    assert.match(body, /Garganacl/);
    assert.match(body, /Naclstack/);
    assert.doesNotMatch(body, /Nacli\b/, "Nacli itself does not learn Salt Cure in PokéRogue");
    // stays open and filled across a re-render
    await page.click('button.mark[data-act="step-toggle"][data-id="s9"]');
    assert.match(await page.locator('details[data-open-id="cand-s3"] .details-body').innerText(), /Garganacl/);
    await page.click('button.mark[data-act="step-toggle"][data-id="s9"]');
    // fusion partners for the Sturdy step are split by sandstorm safety
    await page.locator('details[data-open-id="cand-s10"] summary').click();
    await page.waitForSelector('details[data-open-id="cand-s10"] .chip');
    const sturdy = await page.locator('details[data-open-id="cand-s10"] .details-body').innerText();
    assert.match(sturdy, /Rock, Ground or Steel/);
    assert.match(sturdy, /Magnezone/);
  });

  await check("the Pokédex opens from a species chip, closes on a click elsewhere, stays pinned, closes on Escape", async () => {
    assert.equal(await page.locator("#dex").isVisible(), false, "closed to begin with");
    await page.locator('details[data-open-id="cand-s3"] .chip', { hasText: "Garganacl" }).first().click();
    assert.equal(await page.locator("#dex").isVisible(), true, "a chip opens it");
    assert.match(await text(page, "#scout-card"), /Garganacl/);
    assert.equal(await page.locator("#scout-panel").count(), 0, "no panel in the column any more");
    await page.click(".view-head h1");
    assert.equal(await page.locator("#dex").isVisible(), false, "a click elsewhere closes it");
    await page.click("#dex-btn");
    assert.equal(await page.locator("#dex").isVisible(), true, "the bar button opens it");
    assert.equal(await page.evaluate(() => document.activeElement.id), "scout-q", "and focuses the search box");
    await page.click("#dex-pin");
    assert.equal(await page.getAttribute("#dex-pin", "aria-pressed"), "true");
    await page.click(".view-head h1");
    assert.equal(await page.locator("#dex").isVisible(), true, "pinned, a click elsewhere leaves it open");
    await page.keyboard.press("Escape");
    assert.equal(await page.locator("#dex").isVisible(), false, "Escape closes it even when pinned");
    await page.click("#dex-pin").catch(() => {});
    await page.click("#dex-btn");
    await page.click("#dex-pin");   // unpin again for the checks that follow
    assert.equal(await page.getAttribute("#dex-pin", "aria-pressed"), "false");
  });

  await check("the Pokédex search finds a species and says what it offers", async () => {
    await page.fill("#scout-q", "thro");
    await page.waitForSelector("#scout-hits button.chip");
    await page.locator("#scout-hits button.chip", { hasText: "Throh" }).click();
    const card = await text(page, "#scout-card");
    assert.match(card, /Throh/);
    assert.match(card, /Mat Block/);
    assert.match(card, /Level-up moves/);
    await page.fill("#scout-q", "garganacl");
    await page.locator("#scout-hits button.chip", { hasText: "Garganacl" }).click();
    const card2 = await text(page, "#scout-card");
    assert.match(card2, /Salt Cure/);
    assert.match(card2, /Sturdy/);
  });

  await check("carry: item counts step by hand without a save", async () => {
    const sel = '.stepper button[data-bind="items.staller:WIDE_LENS"][data-d="1"]';
    await page.click(sel); await page.click(sel); await page.click(sel); await page.click(sel);
    const row = page.locator(".audit-row", { hasText: "Wide Lens" }).first();
    assert.match(await row.locator("output").innerText(), /^3$/);
    assert.ok((await row.getAttribute("class")).includes("done"));
  });

  await check("running: the Items panel lists only what is still to collect, sharing the hand-set counts", async () => {
    await page.click("#tab-run");
    const items = page.locator("#items-run");
    assert.equal(await items.count(), 1, "the Running tab has its own copy of the Items panel");
    assert.match(await items.locator(".meter-top").innerText(), /Still to collect while you run/);
    assert.equal(await items.locator(".audit-row.done").count(), 0, "met targets are not listed while running");
    const staller = '[data-bind="items.staller:WIDE_LENS"]';
    assert.equal(await items.locator(staller).count(), 0, "the staller's Wide Lens is at target, so it is gone");
    await page.click("#tab-carry");
    await page.click('#items-carry .stepper button[data-bind="items.staller:WIDE_LENS"][data-d="-1"]');
    await page.click("#tab-run");
    const row = items.locator(".audit-row", { has: page.locator(staller) });
    assert.match(await row.locator("output").innerText(), /^2$/, "an open target comes back with the count set on the Carry tab");
    await row.locator('.stepper button[data-d="1"]').click();
    assert.equal(await items.locator(staller).count(), 0, "meeting it on the Running tab drops it again");
    await page.click("#tab-carry");
    const carryRow = page.locator("#items-carry .audit-row", { has: page.locator(staller) });
    assert.match(await carryRow.locator("output").innerText(), /^3$/, "the Carry tab shares the count");
    assert.ok((await carryRow.getAttribute("class")).includes("done"), "and keeps showing met targets");
  });

  await check("running: the manual wave caller knows the 50-wave rhythm", async () => {
    await page.click("#tab-run");
    assert.equal(await text(page, ".verdict-call"), "Run");
    await page.fill("#run-wave", "1049");
    await page.locator("#run-wave").blur();
    assert.match(await text(page, ".panel .pill"), /normal wave/i);
    await page.click('[data-act="wave-next"]');
    assert.equal(await page.inputValue("#run-wave"), "1050");
    assert.equal(await text(page, ".verdict-call"), "Boss fight");
    await page.click('[data-act="wave-next"]');
    await page.check("#run-gas");
    assert.equal(await text(page, ".verdict-call"), "Gastro Acid, then run");
    await page.check("#run-want");
    assert.equal(await text(page, ".verdict-call"), "Stay");
    await page.click('[data-act="wave-next"]');
    assert.equal(await text(page, ".verdict-call"), "Run", "the two ticks reset on the next wave");
    await page.fill("#run-wave", "1250"); await page.locator("#run-wave").blur();
    assert.match(await page.locator(".verdict").innerText(), /Eternatus/);
  });

  await check("running: the boss panel gives Slither Wing the Sturdy line and keeps step ticks", async () => {
    await page.locator('button[data-act="boss-pick"]', { hasText: "Slither Wing" }).click();
    const desk = await text(page, "#boss-panel");
    assert.match(desk, /needs a different line/i);
    assert.match(desk, /Sturdy line/i);
    assert.match(desk, /Scrappy/);
    await page.check("#bs-st1");
    await page.click('[data-act="wave-next"]');        // any re-render
    assert.equal(await page.isChecked("#bs-st1"), true);
    await page.locator('button[data-act="boss-pick"]', { hasText: "Iron Crown" }).click();
    const desk2 = await text(page, "#boss-panel");
    assert.match(desk2, /Standard line/i);
    assert.equal(await page.isChecked("#bs-sl0"), false, "ticks reset when the boss changes");
    await page.locator('button[data-act="boss-pick"]', { hasText: "Eternatus" }).click();
    assert.match(await text(page, "#boss-panel"), /Eternatus cases/i);
    assert.match(await text(page, "#boss-panel"), /none on Eternatus waves/i);
  });

  await check("running: the speed calculator matches Grex's reference (level 2,300 Gouot: about 42.9k)", async () => {
    await page.fill("#sp-level", "2300"); await page.locator("#sp-level").blur();
    const card = await page.locator(".slot", { hasText: "Mega Gouot" }).innerText();
    const m = card.match(/([\d.]+)k\s+Speed/);
    assert.ok(m && Math.abs(Number(m[1]) - 42.9) < 1.5, card);
    await page.fill("#sp-carbos", "0"); await page.locator("#sp-carbos").blur();
    const card2 = await page.locator(".slot", { hasText: "Mega Gouot" }).innerText();
    assert.ok(Number(card2.match(/([\d.]+)k\s+Speed/)[1]) < Number(m[1]) / 2, "no Carbos: far slower");
  });

  await check("manual state survives a reload", async () => {
    await settle(page);
    await page.reload();
    await page.waitForSelector(".view-head");
    assert.equal(await h1(page), "Running");
    assert.equal(await page.inputValue("#sp-level"), "2300");
    await page.click("#tab-party");
    assert.match(await text(page, ".meter-top strong"), /15 \/ 15/);
  });

  await check("deep links open a phase", async () => {
    await page.goto(APP + "#carry"); await page.waitForSelector(".view-head");
    await page.reload(); await page.waitForSelector(".view-head");
    assert.equal(await h1(page), "Carry");
  });

  await check("no script errors during the manual tour", async () => assert.deepEqual(errors, []));
  await ctx.close();
}

// =====================================================================================================================
// 1b. Explain and Compact
// =====================================================================================================================
{
  const { ctx, page, errors } = await fresh();
  const visible = sel => page.locator(sel).first().isVisible();
  // elements inside a closed <details> are left out: they are folded, not hidden by the density rule
  const shownCount = sel => page.locator(sel).evaluateAll(els => els.filter(el => !el.closest("details:not([open])")).length);
  const hiddenCount = sel => page.locator(sel).evaluateAll(els => els.filter(el => el.offsetParent === null && !el.closest("details:not([open])")).length);

  await check("density: Explain is the default and the teaching prose is on the page", async () => {
    assert.equal(await page.getAttribute("#density-explain", "aria-pressed"), "true");
    assert.equal(await page.getAttribute("#view", "data-density"), "explain");
    assert.ok(await page.locator("#view .teach").count() > 10, "teaching prose is tagged");
    assert.equal(await visible(".view-head .lede"), true);
    assert.equal(await visible(".role-card .role-job"), true);
    assert.equal(await hiddenCount("#view .teach"), 0, "nothing tagged is hidden in Explain");
  });

  await check("density: Compact hides every tagged line and keeps the state", async () => {
    await page.click("#density-compact");
    assert.equal(await page.getAttribute("#density-compact", "aria-pressed"), "true");
    assert.equal(await page.getAttribute("#view", "data-density"), "compact");
    assert.equal(await visible(".view-head .lede"), false);
    const total = await shownCount("#view .teach");
    assert.ok(total > 10, "teaching prose is still in the markup");
    assert.equal(await hiddenCount("#view .teach"), total, "every tagged element is hidden");
    assert.equal(await visible(".role-card .checks .mark"), true, "the ticks stay");
    assert.match(await text(page, ".meter-top strong"), /\/ 15/, "the budget count stays");
    // reference panels fold behind a Show toggle and open on demand
    const variants = page.locator(".panel.ref:has(h2:text('Variants'))");
    assert.equal(await variants.locator("details").count(), 1);
    assert.equal(await variants.locator(".check-label").first().isVisible(), false);
    await variants.locator("summary").click();
    assert.equal(await variants.locator(".check-label").first().isVisible(), true);
  });

  await check("density: the verdict, boss panel and checklists survive Compact on the other tabs", async () => {
    await page.click("#tab-carry");
    assert.equal(await visible(".steps .step-title"), true);
    assert.equal(await visible(".step-how"), false);
    await page.click("#tab-run");
    assert.equal(await text(page, ".verdict-call"), "Run");
    await page.locator('button[data-act="boss-pick"]', { hasText: "Slither Wing" }).click();
    const desk = await text(page, "#boss-panel");
    assert.match(desk, /Sturdy line/i);
    assert.match(desk, /Scrappy/, "the per-boss guide note is state, not teaching");
    assert.equal(await visible("#boss-panel .numbered .d"), false, "the line's step descriptions are teaching");
    assert.equal(await page.locator(".panel.ref:has(h2:text('Catching')) details").count(), 1, "Catching folds");
    assert.equal(await visible(".panel:has(h2:text('Shop and money')) table"), true, "the reroll arithmetic stays");
    assert.equal(await visible(".panel:has(h2:text('Shop and money')) .numbered"), false, "the shop rules are teaching");
  });

  await check("density: the choice survives a reload and Explain brings the prose back", async () => {
    await settle(page);
    await page.reload(); await page.waitForSelector(".view-head");
    assert.equal(await page.getAttribute("#view", "data-density"), "compact");
    assert.equal(await visible(".view-head .lede"), false);
    await page.click("#density-explain");
    assert.equal(await visible(".view-head .lede"), true);
    assert.equal(await hiddenCount("#view .teach"), 0);
    assert.equal(await page.locator(".panel.ref:has(h2:text('Catching')) details").count(), 0, "reference panels unfold in Explain");
  });

  await check("density: the first synced run points at Compact once", async () => {
    await page.click("#tab-sync");
    await page.click('button[data-act="sample"][data-sample="shiny"]');
    await page.waitForSelector(".toast");
    assert.match(await page.locator(".toast").last().innerText(), /Compact/);
    await page.waitForSelector(".toast", { state: "detached", timeout: 6000 });
    await page.click("#tab-sync");
    await page.click('button[data-act="sample"][data-sample="carry"]');
    await page.waitForTimeout(300);
    assert.equal(await page.locator(".toast", { hasText: "Compact" }).count(), 0, "the hint shows once");
  });

  await check("no script errors switching density", async () => assert.deepEqual(errors, []));
  await ctx.close();
}

// =====================================================================================================================
// 1c. Running: speed is the goal, alerts say each thing once
// =====================================================================================================================
{
  const { ctx, page, errors } = await fresh();

  await check("running: the Speed panel leads the right column and the Doubles chain is gone", async () => {
    await page.click("#tab-sync");
    await page.click('button[data-act="sample"][data-sample="shiny"]');
    assert.equal(await h1(page), "Running");
    assert.equal(await page.locator(".panel:has(h2:text('Doubles chain'))").count(), 0);
    assert.match(await page.locator(".cols > .col").nth(1).locator(".panel h2").first().innerText(), /Speed and levels/);
    const goal = await text(page, "#speed-panel .callout");
    assert.match(goal, /levels to go/);
    assert.match(goal, /EXP Share 0 of 5/, "no EXP Share in the sample bag: the bench earns nothing");
    assert.match(await text(page, "#items-run"), /EXP Share/, "EXP Share is an item target");
  });

  await check("running: the verdict names each reason once in a few words; the foe card holds the advice", async () => {
    const reasons = await text(page, ".verdict .alerts");
    assert.match(reasons, /Dreepy · shiny/);
    assert.match(reasons, /Weezing · 1 × Golden Egg/);
    assert.doesNotMatch(reasons, /Master Ball it|Thief or Mini Black Hole/);
    const foe = () => page.locator(".foe", { hasText: "Dreepy" }).innerText();
    assert.match(await foe(), /Master Ball it, or use the safe-capture steps/);
    await page.click("#density-compact");
    assert.match(await foe(), /Shiny/);
    assert.doesNotMatch(await foe(), /Master Ball it/, "the advice is teaching prose");
    await page.click("#density-explain");
  });

  await check("running: Gouot out of slot 1 is a warning on the wave, not a panel", async () => {
    await page.evaluate(() => { const p = NZ.ui.game.session.party; p.push(p.shift()); NZ.ui.render(); });
    assert.match(await text(page, ".panel:has(h2:text('This wave')) .callout.warn"), /is not in slot 1/);
  });

  await check("no script errors on the running tab", async () => assert.deepEqual(errors, []));
  await ctx.close();
}

// =====================================================================================================================
// 2. Samples, paste, files
// =====================================================================================================================
{
  const { ctx, page, errors } = await fresh();

  await check("a sample save loads, is labelled as a sample, and can be removed", async () => {
    await page.click("#tab-sync");
    await page.click('button[data-act="sample"][data-sample="shiny"]');
    assert.equal(await h1(page), "Running");
    assert.match(await text(page, ".banner.sample"), /not your run/);
    assert.equal(await text(page, ".verdict-call"), "Stay");
    assert.match(await text(page, "#tab-sync"), /Sample save/);
    await page.click('[data-act="clear-sample"]');
    assert.match(await text(page, "#tab-sync"), /Not synced/);
    await settle(page); await page.reload(); await page.waitForSelector(".view-head");
    assert.match(await text(page, "#tab-sync"), /Not synced/, "sample data is never stored");
  });

  await check("paste anywhere: a bridge envelope syncs the run and jumps to the detected phase", async () => {
    await page.click("#tab-sync");
    const envelope = JSON.stringify({ source: "nz-bridge", v: 1, t: Date.now(), entries: { sessionData_Tester: encCarry, data_Tester: sysFull, settings: "{}" } });
    await page.evaluate(t => {
      const dt = new DataTransfer(); dt.setData("text/plain", t);
      document.dispatchEvent(new ClipboardEvent("paste", { clipboardData: dt, bubbles: true, cancelable: true }));
    }, envelope);
    await page.waitForSelector(".toast");
    assert.match(await text(page, ".toast"), /Synced: wave 734/);
    assert.equal(await h1(page), "Carry");
    assert.match(await text(page, ".wave-num"), /Wave 734/);
    assert.match(await text(page, "#tab-sync"), /Wave 734/);
    assert.match(await page.locator(".foe.wanted").first().innerText(), /Throh|Garchomp/);
    // the splice list now follows the save
    assert.match(await text(page, ".meter-top strong"), /2 \/ 18/);
    assert.match(await page.locator(".step", { hasText: "Carbos on the carry" }).innerText(), /12 \/ 31/);
  });

  await check("party checks fill in from the synced unlocks", async () => {
    await page.click("#tab-party");
    assert.match(await text(page, ".callout.good"), /Unlocks read from your save/);
    assert.equal(await page.locator(".role-card .mark.locked").count(), 0, "the full-unlock fixture has everything");
    assert.equal(await page.locator('.role-card button.mark[data-act="unlock"]').count(), 0, "nothing left to tick by hand");
    assert.equal(await page.locator(".budget .stepper").count(), 0, "reductions come from the save");
  });

  await check("a hand tick can overrule the save, and be handed back", async () => {
    await page.click("#tab-carry");
    await page.click('button.mark[data-act="step-toggle"][data-id="s2"]');
    const row = page.locator(".step", { hasText: "Mat Block" }).first();
    assert.match(await row.innerText(), /ticked by hand/i);
    assert.match(await text(page, ".meter-top strong"), /3 \/ 18/);
    await row.locator('[data-act="step-reset"]').click();
    assert.match(await text(page, ".meter-top strong"), /2 \/ 18/);
  });

  await check("hidden enemy details stay hidden until the setting is switched on", async () => {
    assert.equal(await page.locator(".foe .chip.move").count(), 0);
    assert.doesNotMatch(await page.locator(".foe").first().innerText(), /right now/);
    await page.click("#tab-sync");
    await page.check("#set-peek");
    await page.click("#tab-carry");
    assert.ok(await page.locator(".foe .chip.move").count() >= 4);
    assert.match(await page.locator(".foe").first().innerText(), /Knows Mat Block right now/);
    await page.click("#tab-sync"); await page.uncheck("#set-peek");
  });

  await check("synced data survives a reload; 'Forget' removes it", async () => {
    await settle(page); await page.reload(); await page.waitForSelector(".view-head");
    assert.match(await text(page, "#tab-sync"), /Wave 734/);
    await page.click("#tab-sync");
    assert.match(await text(page, ".kv"), /Endless · wave 734/);
    await page.click('[data-act="forget"]');
    assert.match(await text(page, "#tab-sync"), /Not synced/);
    await settle(page); await page.reload(); await page.waitForSelector(".view-head");
    assert.match(await text(page, "#tab-sync"), /Not synced/);
    const stored = await page.evaluate(() => localStorage.getItem("nz.game.v1"));
    assert.ok(!stored || !JSON.parse(stored).session, "nothing of the save is left in storage");
  });

  await check("the paste box takes a raw encrypted save; junk is refused with a message", async () => {
    await page.click("#tab-sync");
    await page.fill("#paste-box", encShiny);
    await page.click('[data-act="paste-go"]');
    await page.waitForFunction(() => /Wave 1,763/.test(document.querySelector("#tab-sync").innerText));
    assert.equal(await h1(page), "Running");
    assert.equal(await text(page, ".verdict-call"), "Stay");
    await page.click("#tab-sync");
    await page.fill("#paste-box", "hello there");
    await page.click('[data-act="paste-go"]');
    await page.waitForSelector(".toast.bad");
    assert.match(await text(page, ".callout.danger"), /Last attempt failed/);
    assert.match(await text(page, "#tab-sync"), /Wave 1,763/, "a failed read leaves the synced run alone");
  });

  await check("typing or pasting ordinary text into a field is left alone", async () => {
    await page.click("#tab-run");
    await page.click("#dex-btn");
    await page.evaluate(() => {
      const el = document.getElementById("scout-q"); el.focus();
      const dt = new DataTransfer(); dt.setData("text/plain", "U2FsdGVkX1-not-a-save");
      window.__prevented = !el.dispatchEvent(new ClipboardEvent("paste", { clipboardData: dt, bubbles: true, cancelable: true }));
    });
    assert.equal(await page.evaluate(() => window.__prevented), false);
  });

  await check("an exported .prsv file is read from the file picker", async () => {
    await page.click("#tab-sync");
    await page.click('[data-act="forget"]');
    await page.setInputFiles("#file-pick", [
      { name: "sessionData_Tester.prsv", mimeType: "application/octet-stream", buffer: Buffer.from(encPlain) },
      { name: "data_Tester.prsv", mimeType: "application/octet-stream", buffer: Buffer.from(sysNew) },
    ]);
    await page.waitForFunction(() => /Wave 1,764/.test(document.querySelector("#tab-sync").innerText));
    await page.waitForFunction(() => NZ.ui.game.system && NZ.ui.game.session);
    await page.evaluate(() => NZ.ui.setTab("run"));
    // the fresh-account fixture has not caught Raticate or Pelipper: the same plain wave becomes "Stay"
    assert.equal(await text(page, ".verdict-call"), "Stay");
    assert.match(await text(page, ".verdict"), /not in your dex/);
  });

  await check("a .prsv dropped on the page is read", async () => {
    await page.click("#tab-sync"); await page.click('[data-act="forget"]');
    await page.evaluate(async content => {
      const dt = new DataTransfer();
      dt.items.add(new File([content], "export.prsv", { type: "application/octet-stream" }));
      for (const type of ["dragenter", "dragover", "drop"]) document.dispatchEvent(new DragEvent(type, { dataTransfer: dt, bubbles: true, cancelable: true }));
    }, encCarry);
    await page.waitForFunction(() => /Wave 734/.test(document.querySelector("#tab-sync").innerText));
    assert.equal(await h1(page), "Carry");
  });

  await check("no script errors during samples, paste and files", async () => assert.deepEqual(errors, []));
  await ctx.close();
}

// =====================================================================================================================
// 3. The bridge in a tab the assistant did not open: copy, button, paste
// =====================================================================================================================
{
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 }, permissions: ["clipboard-read", "clipboard-write"] });
  const errors = [];
  const page = await ctx.newPage(); watch(page, errors, "app");
  await page.goto(APP); await page.waitForSelector(".view-head");
  const game = await ctx.newPage(); watch(game, errors, "game");
  await game.goto(GAME);
  await game.evaluate(([s, d]) => { localStorage.setItem("sessionData_Tester", s); localStorage.setItem("data_Tester", d); localStorage.setItem("settings", "{\"GAME_SPEED\":3}"); }, [encCarry, sysFull]);

  let href = "";
  await check("the bookmark is a javascript: address that carries only the bridge", async () => {
    await page.click("#tab-sync");
    href = await page.getAttribute("#bridge-link", "href");
    assert.ok(href.startsWith("javascript:"));
    const code = decodeURIComponent(href.slice("javascript:".length));
    assert.ok(!/setItem|removeItem|\.clear\(|dispatchEvent|KeyboardEvent|MouseEvent|fetch\(|XMLHttpRequest|WebSocket|sendBeacon|\.click\(\)|document\.cookie/.test(code), "no storage writes, no synthetic input, no network, no cookies");
    assert.equal((code.match(/getItem/g) || []).length, 1);
    new Function(code);   // parses as one script
    const shown = await page.evaluate(() => NZ.bridge.snippet(NZ.bridge.pageOrigin()));
    assert.equal(shown.split("\n").filter(l => !l.startsWith("//")).join(""), code, "the readable script and the bookmark are the same code");
  });

  const spyOn = p => p.evaluate(() => {
    window.__spy = { set: 0, remove: 0, clear: 0, input: 0, msgs: 0, got: [] };
    const P = Storage.prototype, s = P.setItem, r = P.removeItem, c = P.clear, g = P.getItem;
    P.setItem = function () { window.__spy.set++; return s.apply(this, arguments); };
    P.removeItem = function () { window.__spy.remove++; return r.apply(this, arguments); };
    P.clear = function () { window.__spy.clear++; return c.apply(this, arguments); };
    P.getItem = function (k) { window.__spy.got.push(k); return g.apply(this, arguments); };
    for (const type of ["keydown", "keyup", "keypress", "pointerdown", "pointerup", "mousedown", "mouseup", "click", "touchstart", "touchend", "wheel", "input"]) {
      document.getElementById("game").addEventListener(type, () => { window.__spy.input++; }, true);
    }
    window.addEventListener("message", () => { window.__spy.msgs++; });
  });

  await check("run as a bookmark in a normal tab: it adds a Copy save button and nothing else", async () => {
    await spyOn(game);
    await game.bringToFront();
    await game.evaluate(h => { location.href = h; }, href);
    await game.waitForFunction(() => typeof window.__nzBridge === "function");
    const chip = game.locator("div", { hasText: /^Copy save/ }).last();
    assert.equal(await chip.count(), 1);
    await chip.click({ position: { x: 12, y: 8 } });
    await game.waitForFunction(() => /save copied/.test(document.body.innerText));
    const clip = await game.evaluate(() => navigator.clipboard.readText());
    const env = JSON.parse(clip);
    assert.equal(env.source, "nz-bridge");
    assert.deepEqual(Object.keys(env.entries).sort(), ["sessionData_Tester"], "a button copy carries the run; the big unlock save was already handed over");
    const spy = await game.evaluate(() => window.__spy);
    assert.deepEqual([spy.set, spy.remove, spy.clear, spy.input, spy.msgs], [0, 0, 0, 0, 0], "no storage writes, no input events on the game canvas");
    assert.ok(spy.got.every(k => /^(sessionData\d*|data)_/.test(k)), "only save keys were read: " + spy.got.join(","));
    assert.ok(!spy.got.includes("settings"));
    assert.equal(await game.evaluate(() => document.activeElement === document.body || document.activeElement === document.getElementById("game")), true, "keyboard focus stays with the game");
  });

  await check("clicking the bookmark again copies everything, and Ctrl+V in the assistant syncs it", async () => {
    await game.evaluate(() => navigator.clipboard.writeText("something else"));
    await game.evaluate(h => { location.href = h; }, href);
    await game.waitForFunction(() => /save copied|blocked the copy/.test(document.body.innerText));
    const said = await game.evaluate(() => document.body.innerText);
    const env = JSON.parse(await game.evaluate(() => navigator.clipboard.readText()).catch(() => "{}") || "{}");
    if (/save copied/.test(said)) assert.deepEqual(Object.keys(env.entries).sort(), ["data_Tester", "sessionData_Tester"], "a bookmark click hands over the run and the unlocks");
    else {
      // the browser refused a copy without a click inside the page: the bridge says so and the button is the way
      notes.push("direct copy from the bookmark was refused in this browser build; the Copy save button path was used");
      await game.locator("div", { hasText: /^Copy save/ }).last().click({ position: { x: 12, y: 8 } });
      await game.waitForFunction(() => /save copied/.test(document.body.innerText));
    }
    await page.bringToFront();
    await page.click("#tab-sync");
    await page.locator("h1").click();
    await page.keyboard.press("Control+V");
    await page.waitForFunction(() => /Wave 734/.test(document.querySelector("#tab-sync").innerText), null, { timeout: 5000 });
    assert.equal(await h1(page), "Carry");
  });

  await check("the × on the button removes the bridge from the tab", async () => {
    await game.bringToFront();
    await game.locator("span", { hasText: "×" }).click();
    assert.equal(await game.locator("div", { hasText: /^Copy save/ }).count(), 0);
    assert.equal(await game.evaluate(() => window.__nzBridge), null);
  });

  await check("a tab with no save gets a plain message", async () => {
    const empty = await ctx.newPage();
    await empty.goto(OTHER);
    await empty.evaluate(h => { location.href = h; }, href);
    await empty.waitForFunction(() => /no PokéRogue save found/.test(document.body.innerText));
    assert.equal(await empty.locator("div", { hasText: /^Copy save/ }).count(), 0);
    await empty.close();
  });

  await check("no script errors in copy mode", async () => assert.deepEqual(errors, []));
  await ctx.close();
}

// =====================================================================================================================
// 4. Live link across two origins
// =====================================================================================================================
{
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const errors = [];
  const page = await ctx.newPage(); watch(page, errors, "app");
  await page.goto(APP); await page.waitForSelector(".view-head");
  // the "game" origin already holds a save, as it would after playing
  const seed = await ctx.newPage(); await seed.goto(GAME);
  await seed.evaluate(([s, d]) => { localStorage.setItem("sessionData_Tester", s); localStorage.setItem("data_Tester", d); }, [encShiny, sysFull]);

  let game = null, href = "";
  await check("'Open PokéRogue' opens the configured address in a tab the bridge can recognise", async () => {
    await page.click("#tab-sync");
    await page.fill("#set-url", GAME); await page.locator("#set-url").blur();
    href = await page.getAttribute("#bridge-link", "href");
    [game] = await Promise.all([ctx.waitForEvent("page"), page.click('[data-act="open-game"]')]);
    watch(game, errors, "game");
    await game.waitForLoadState();
    assert.equal(game.url(), GAME);
    assert.match(await game.evaluate(() => window.name), /^nz-live-/);
    assert.equal(await game.evaluate(() => !!window.opener), true);
    assert.match(await text(page, ".panel:has(h2:text('Live link'))"), /Waiting for the bridge/);
  });

  await check("the bridge links up: the assistant shows the run without any paste", async () => {
    await game.evaluate(() => {
      window.__spy = { set: 0, remove: 0, clear: 0, input: 0, msgs: 0 };
      const P = Storage.prototype, s = P.setItem, r = P.removeItem, c = P.clear;
      P.setItem = function () { window.__spy.set++; return s.apply(this, arguments); };
      P.removeItem = function () { window.__spy.remove++; return r.apply(this, arguments); };
      P.clear = function () { window.__spy.clear++; return c.apply(this, arguments); };
      for (const type of ["keydown", "keyup", "keypress", "pointerdown", "pointerup", "mousedown", "mouseup", "click", "touchstart", "touchend", "wheel"]) {
        window.addEventListener(type, () => { window.__spy.input++; }, true);
      }
      window.addEventListener("message", () => { window.__spy.msgs++; });
    });
    await game.evaluate(h => { location.href = h; }, href);
    await page.waitForFunction(() => /Live · Wave 1,763/.test(document.querySelector("#tab-sync").innerText), null, { timeout: 5000 });
    assert.match(await text(page, ".callout.good"), /Following your save/);
    assert.equal(await game.locator("div", { hasText: /^Copy save/ }).count(), 0, "no button needed in a linked tab");
    assert.equal(await page.evaluate(() => !!NZ.ui.game.system), true, "unlocks arrived with the first message");
    await page.click("#tab-run");
    assert.equal(await text(page, ".verdict-call"), "Stay");
    assert.match(await text(page, "#items-run .meta"), /counted from your save/, "the Running tab's Items panel counts from the synced save");
  });

  await check("a new wave in the game tab shows up by itself within two seconds", async () => {
    const newer = structuredClone(plainRaw); newer.timestamp = Date.now();
    await seed.evaluate(s => localStorage.setItem("sessionData_Tester", s), encryptPrsv(JSON.stringify(newer)));
    await page.waitForFunction(() => /Live · Wave 1,764/.test(document.querySelector("#tab-sync").innerText), null, { timeout: 4000 });
    assert.equal(await text(page, ".verdict-call"), "Run");
    assert.match(await text(page, ".wave-num"), /1,764/);
  });

  await check("an older save does not roll the live view back", async () => {
    const older = structuredClone(samples.carrySample()); older.timestamp = 1000;
    await seed.evaluate(s => localStorage.setItem("sessionData2_Tester", s), encryptPrsv(JSON.stringify(older)));
    await page.waitForTimeout(1800);
    assert.match(await text(page, "#tab-sync"), /Wave 1,764/);
  });

  await check("read-only: the linked game tab saw no storage writes, no input and no messages", async () => {
    await page.waitForTimeout(1200);
    const spy = await game.evaluate(() => window.__spy);
    assert.deepEqual(spy, { set: 0, remove: 0, clear: 0, input: 0, msgs: 0 });
    assert.equal(await game.evaluate(() => document.querySelectorAll("canvas").length), 1);
  });

  await check("the sound option does not break a live update", async () => {
    await page.click("#tab-sync");
    await page.check("#set-sound");
    assert.equal(await page.isEnabled("#set-sound-items"), true);
    const again = structuredClone(samples.shinySample()); again.timestamp = Date.now() + 5000; again.waveIndex = 1765;
    await seed.evaluate(s => localStorage.setItem("sessionData_Tester", s), encryptPrsv(JSON.stringify(again)));
    await page.waitForFunction(() => /Live · Wave 1,765/.test(document.querySelector("#tab-sync").innerText), null, { timeout: 4000 });
  });

  await check("messages from any other origin are ignored and reported", async () => {
    await page.click("#tab-sync");
    await page.fill("#set-url", "https://pokerogue.net/"); await page.locator("#set-url").blur();
    const waveBefore = await page.evaluate(() => NZ.ui.game.session.wave);
    const sneaky = structuredClone(samples.carrySample()); sneaky.timestamp = Date.now() + 60000;
    await seed.evaluate(s => localStorage.setItem("sessionData_Tester", s), encryptPrsv(JSON.stringify(sneaky)));
    await page.waitForFunction(() => !!NZ.bridge.status.rejectedOrigin, null, { timeout: 4000 });
    assert.equal(await page.evaluate(() => NZ.ui.game.session.wave), waveBefore);
    assert.match(await text(page, ".panel:has(h2:text('Live link'))"), /Ignored a message from/);
    // a page that is not the bridge cannot inject either
    await game.evaluate(() => window.opener.postMessage({ source: "something-else", entries: { sessionData_x: "U2FsdGVkX1" } }, "*"));
    await page.evaluate(() => window.postMessage({ source: "nz-bridge", v: 1, entries: { sessionData_x: "not a save" } }, "*"));
    await page.waitForTimeout(300);
    assert.equal(await page.evaluate(() => NZ.ui.game.session.wave), waveBefore);
  });

  await check("closing the assistant ends the bridge's polling", async () => {
    await page.close();
    await game.waitForFunction(() => window.__nzBridge === null, null, { timeout: 4000 });
    assert.match(await game.evaluate(() => document.body.innerText), /assistant page was closed/);
  });

  await check("no script errors on the live link", async () => assert.deepEqual(errors, []));
  await ctx.close();
}

// =====================================================================================================================
// 4b. Viewers that refuse or isolate new tabs
// =====================================================================================================================
{
  const { ctx, page, errors } = await fresh();
  await check("a viewer that blocks new tabs gets a plain explanation and the other two routes", async () => {
    await page.click("#tab-sync");
    await page.evaluate(() => { window.open = () => null; });
    await page.click('[data-act="open-game"]');
    const panel = await text(page, ".panel:has(h2:text('Live link'))");
    assert.match(panel, /did not allow opening the game/);
    assert.match(panel, /copy and paste/i);
  });
  await check("a viewer that isolates the new tab is detected after a few seconds", async () => {
    await page.evaluate(() => { window.open = () => ({ closed: true, focus() {} }); });
    await page.click('[data-act="open-game"]');
    await page.waitForFunction(() => NZ.bridge.status.isolated === true, null, { timeout: 6000 });
    assert.match(await text(page, ".panel:has(h2:text('Live link'))"), /isolated the game tab/);
  });
  await check("no script errors with blocked tabs", async () => assert.deepEqual(errors, []));
  await ctx.close();
}

// =====================================================================================================================
// 5. The page never reaches for the game
// =====================================================================================================================
await check("the assistant's own code has no way to send input or write game storage", async () => {
  const src = pageHtml.slice(pageHtml.lastIndexOf("<script>"));
  assert.ok(!/\.postMessage\(/.test(src.replace(/W\.opener\.postMessage\(m,ORIGIN\)/g, "")), "the page itself never posts to another window (only the bridge posts, toward the assistant)");
  assert.ok(!/new (KeyboardEvent|MouseEvent|PointerEvent|TouchEvent|WheelEvent)|\.dispatchEvent\(|execCommand\('insertText'|\bfetch\(|XMLHttpRequest|WebSocket|sendBeacon|EventSource/.test(src));
  const writes = src.match(/localStorage\.(setItem|removeItem)\([^)]*\)/g) || [];
  assert.ok(writes.length > 0 && writes.every(w => /\((key|k)\b/.test(w)), "storage writes go through the page's own store helper only: " + writes.join(" | "));
});

await browser.close();
appSrv.close(); gameSrv.close(); otherSrv.close();
console.log(results.join("\n"));
if (notes.length) console.log("\nnotes:\n- " + notes.join("\n- "));
console.log(failed ? `\n${failed} FAILED of ${results.length}` : `\nall ${results.length} checks passed`);
process.exit(failed ? 1 : 0);
