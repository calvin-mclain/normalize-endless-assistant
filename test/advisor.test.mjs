import assert from "node:assert/strict";
import { loadNZ } from "./load.mjs";
import * as samples from "../build/make_samples.mjs";
import { encryptPrsv } from "./prsv.mjs";
const NZ = loadNZ();
const { data: d, advisor: adv, save, kb } = NZ;
const A = d.A, M = d.M, S = d.S;
const step = id => kb.steps.find(s => s.id === id);

// ---------- number formatting ----------
const short = NZ.util.short;
assert.deepEqual([999, 1000, 1250, 42900, 58750, 100000, 500000, 940000, 999950, 1250000, 3.11e9, 91.24e9, 9e15].map(short),
  ["999", "1k", "1.25k", "42.9k", "58.8k", "100k", "500k", "940k", "1M", "1.25M", "3.11B", "91.2B", "9Q"]);
assert.equal(NZ.util.fmt(1234567), "1,234,567");

// ---------- wave rhythm ----------
assert.equal(adv.waveInfo(734).kind, "normal");
assert.equal(adv.waveInfo(740).kind, "x0");
assert.equal(adv.waveInfo(750).kind, "eternatus");
assert.equal(adv.waveInfo(2350).kind, "paradox");
assert.equal(adv.waveInfo(3000).kind, "eternamax");
assert.deepEqual([adv.waveInfo(734).nextForced, adv.waveInfo(734).toForced, adv.waveInfo(734).nextForcedKind], [750, 16, "eternatus"]);
assert.equal(adv.waveInfo(2351).nextForcedKind, "paradox");
assert.equal(adv.waveInfo(2350).canFlee, false);
assert.equal(adv.waveInfo(2340).canFlee, true);

// ---------- double battle odds (BattleScene.getDoubleBattleChance) ----------
assert.equal(adv.doubleChance(101, 0), 1 / 8);
assert.equal(adv.doubleChance(110, 0), 1 / 32);
assert.equal(adv.doubleChance(101, 1), 1 / 2);
assert.equal(adv.doubleChance(101, 2), 1);
assert.equal(adv.doubleChance(110, 2), 1 / 2);
assert.equal(adv.doubleChance(110, 3), 1);
assert.equal(adv.doubleChance(150, 3), 0, "forced bosses are never doubles");

// ---------- money and rerolls, against the figures in the project guide ----------
const near = (a, b, tol) => Math.abs(a - b) / b <= tol;
assert.ok(near(adv.moneyReward(500, 1), 40000, 0.25), "≈₽40k at wave 500: " + adv.moneyReward(500, 1));
assert.ok(near(adv.moneyReward(1000, 1), 1e6, 0.25), "≈₽1M at wave 1000: " + adv.moneyReward(1000, 1));
assert.ok(near(adv.moneyReward(2000, 1), 390e6, 0.25), "≈₽390M at wave 2000: " + adv.moneyReward(2000, 1));
assert.equal(adv.rerollCost(1000, 0), 25000);
assert.equal(adv.rerollCost(1000, 3), 200000);
assert.equal(adv.rerollsAffordable(1000, adv.moneyReward(1000, 1)), 5);
assert.equal(adv.rerollsAffordable(2000, adv.moneyReward(2000, 1)), 12);
assert.equal(adv.rerollsAffordable(3000, adv.moneyReward(3000, 1)), 20);

// ---------- speed formula, against Grex's wave-1152 screenshot (Lv 2.3k Timid Mega Gouot: 42.9k Speed) ----------
const gouotBase = d.fuse({ id: S.GOURGEIST, form: 0 }, { id: S.PIDGEOT, form: 1, slot: 0 }).stats[5];
const spd = adv.speedStat({ base: gouotBase, iv: 31, level: 2300, carbos: 31, soulDew: 10, nature: 1 });
assert.ok(near(spd, 42900, 0.03), "Gouot speed at 2300: " + spd);
const lvl400k = adv.levelForSpeed({ base: gouotBase, iv: 31, carbos: 31, soulDew: 10, nature: 1 }, 400000);
assert.ok(lvl400k > 20000 && lvl400k < 25000, "level for 400k speed: " + lvl400k);

// ---------- party building ----------
const sysFull = save.normalize((await save.decodeAny((await import("node:fs")).readFileSync(new URL("./fixtures/saves/full_unlocks_sanitized.prsv", import.meta.url), "utf8")))[0]);
const roster = adv.defaultRoster();
const b0 = adv.budget(roster, null, {});
assert.equal(b0.total, 20, "the six default starters cost 20 points before reductions");
assert.equal(b0.over, 5);
assert.equal(b0.floor, 2 + 0.5 + 1 + 1 + 5 + 0.25);
const b1 = adv.budget(roster, null, { carry: 2, runner: 2, killer: 1 });
assert.equal(b1.total, 15);
assert.equal(b1.over, 0);
for (const role of kb.ROLE_ORDER) {
  const checks = adv.starterChecks(role, roster[role], null);
  assert.ok(checks.length >= 2, role);
  assert.ok(!checks.some(c => c.state === "no"), `${role}: default pick must satisfy every hard requirement: ${JSON.stringify(checks.filter(c => c.state === "no"))}`);
  const synced = adv.starterChecks(role, roster[role], sysFull);
  assert.ok(!synced.some(c => c.state === "no" || c.state === "locked"), `${role} with a full-unlock save: ${JSON.stringify(synced.filter(c => c.state !== "ok"))}`);
}
// a wrong pick is called out
assert.ok(adv.starterChecks("runner", S.SENTRET, null).some(c => c.id === "passive" && c.state === "no"));
assert.ok(adv.starterChecks("staller", S.PATRAT, null).some(c => c.id === "lv-TRICK_OR_TREAT" && c.state === "no"));
assert.ok(adv.starterChecks("partner", S.BLIPBUG, null).some(c => c.id === "passive" && c.state === "info" && /Dottler/.test(c.detail)));
assert.ok(adv.starterChecks("runner", S.TEDDIURSA, null).some(c => c.id === "evo" && /Ursaring/.test(c.detail)));
assert.ok(adv.alternatives("runner").map(r => d.sp(r.id).k).includes("COMBEE"));
assert.ok(adv.alternatives("tutor").map(r => d.sp(r.id).k).includes("ESPURR"));

// ---------- carry sample ----------
const carry = save.normalizeSession(samples.carrySample());
assert.equal(carry.wave, 734);
assert.equal(carry.double, true);
assert.equal(carry.endless, true);
assert.deepEqual(carry.balls, [41, 18, 22, 9, 6]);
assert.equal(carry.lures.length, 1);
let ctx = adv.makeContext({ session: carry, roster });
assert.equal(ctx.assign.byRole.carry.name, "Regigigas");
assert.equal(ctx.assign.byRole.staller.name, "Gourgeist");
assert.equal(ctx.assign.byRole.runner.name, "Teddiursa");
assert.equal(ctx.assign.byRole.partner.name, "Jynx");
assert.equal(ctx.assign.byRole.killer.name, "Yamask");
assert.equal(ctx.assign.byRole.tutor, undefined);
assert.equal(ctx.assign.extras.length, 1);
assert.equal(ctx.assign.byRole.carry.ability, A.NORMALIZE);
assert.equal(ctx.assign.byRole.carry.items.CARBOS, 12);
assert.equal(ctx.assign.byRole.staller.passive, A.ILLUMINATE);
const st = id => adv.effectiveStep(step(id), ctx).state;
assert.equal(st("s1"), "done");   // Dark Void learned
assert.equal(st("s2"), "todo");   // Mat Block
assert.equal(st("s3"), "done");   // Salt Cure
assert.equal(st("s4"), "todo");   // Entrainment
assert.equal(st("s7"), "todo");
assert.equal(st("s12"), "todo");
assert.equal(st("s14"), "todo");
assert.deepEqual(adv.stepStatus(step("s14"), ctx).progress, [12, 31]);
assert.equal(st("s16"), "todo");
// carry-phase lure picture: Regigigas (none) + Gourgeist (Illuminate passive) + Super Lure = 2 sources
const lure = adv.lureStatus(carry);
assert.equal(lure.count, 2);
assert.equal(lure.nextChance, 1);
assert.equal(lure.x0Chance, 0.5);
// scans: Throh knows Mat Block; Garchomp holds Carbos
let scanThroh = adv.scanEnemy(carry.enemies[0], ctx, "carry");
assert.ok(scanThroh.alerts.some(a => /Mat Block/.test(a.text) && a.sev === "maybe"), "without hidden details Throh is only a candidate");
assert.ok(!scanThroh.alerts.some(a => /right now/.test(a.text)));
const ctxPeek = adv.makeContext({ session: carry, roster, peek: true });
scanThroh = adv.scanEnemy(carry.enemies[0], ctxPeek, "carry");
assert.ok(scanThroh.alerts.some(a => /Knows Mat Block right now/.test(a.text) && a.sev === "want"));
assert.ok(scanThroh.wanted);
const scanChomp = adv.scanEnemy(carry.enemies[1], ctx, "carry");
assert.ok(scanChomp.alerts.some(a => /Holds 4 Carbos/.test(a.text)));
assert.ok(scanChomp.wanted, "a Carbos holder is worth catching in the carry phase");
// candidates for Leech Seed come from the level-up lists
const cand = adv.stepCandidates(step("s7"), ctx);
assert.ok(cand.groups[0].rows.some(r => d.sp(r.id).k === "TREVENANT"));
assert.ok(!cand.groups[0].rows.some(r => d.sp(r.id).k === "FERROTHORN"), "Ferrothorn does not learn Leech Seed by level in PokéRogue");
const sturdy = adv.stepCandidates(step("s10"), ctx);
assert.ok(sturdy.groups[0].rows.some(r => d.sp(r.id).k === "MAGNEZONE"));
assert.ok(sturdy.groups[1].rows.some(r => d.sp(r.id).k === "SKARMORY"));
assert.ok(sturdy.groups[0].rows.every(r => /Rock|Ground|Steel/.test(r.sub)));
const fast = adv.stepCandidates(step("s16"), ctx);
assert.equal(d.name(fast.groups[0].rows[0].id, fast.groups[0].rows[0].form), "Raichu (Mega Y)");
assert.ok(fast.groups[0].rows.slice(0, 3).some(r => d.name(r.id, r.form) === "Pidgeot (Mega)"));
const both = adv.stepCandidates(step("s12"), ctx);
assert.ok(/Curse and Disable|Knows/.test(both.groups[0].title) || both.own.length > 0);
assert.ok(both.own.some(t => /Curse TM/.test(t)), "Jynx can use the Curse TM");
const ready = adv.readiness(ctx);
assert.equal(ready.ready, false);
assert.equal(adv.detectPhase(ctx), "carry");
const audit = adv.itemAudit(ctx);
const partnerCarbos = audit.roles.find(r => r.role === "partner").rows.find(r => r.key === "CARBOS");
assert.equal(partnerCarbos.have, 12, "Carbos on the carry count toward the partner");
assert.match(partnerCarbos.note, /Regigigas/);
assert.equal(audit.balls.master, 6);

// ---------- running samples ----------
const boss = save.normalizeSession(samples.bossSample());
ctx = adv.makeContext({ session: boss, roster });
assert.deepEqual(["staller", "runner", "partner", "killer"].map(r => ctx.assign.byRole[r].name), ["Mega Gouot", "Teddiurk", "Jynxgigas", "Yamazone"]);
assert.ok(ctx.assign.flags.carry && ctx.assign.flags.carry.mergedInto === "partner");
assert.equal(ctx.assign.extras.length, 1);
for (const s of kb.steps) assert.equal(adv.effectiveStep(s, ctx).state, "done", `${s.id} ${s.title}: ${adv.stepStatus(s, ctx).detail}`);
assert.equal(adv.readiness(ctx).ready, true, JSON.stringify(adv.readiness(ctx).rows.filter(r => r.state !== "ok")));
assert.equal(adv.detectPhase(ctx), "run");
assert.deepEqual(ctx.assign.byRole.killer.types.map(d.typeName), ["Ghost", "Steel"]);
assert.equal(ctx.assign.byRole.partner.tera, 7);
let v = adv.verdict(ctx);
assert.equal(v.action, "boss");
let dossier = adv.bossDossier({ ...boss.enemies[0], fromSave: true }, ctx, boss.wave);
assert.equal(dossier.level, "danger");
assert.equal(dossier.line, "sturdy");
assert.ok(dossier.guide && /Scrappy/.test(dossier.guide.problem));
assert.ok(dossier.notes.some(n => /Scrappy is its passive/.test(n.title)));
assert.ok(dossier.notes.some(n => /Multi-hit/.test(n.title) && n.sev === "danger"));
assert.equal(dossier.speed, null, "no speed comparison without hidden details");
dossier = adv.bossDossier({ ...boss.enemies[0], fromSave: true }, adv.makeContext({ session: boss, roster, peek: true }), boss.wave);
assert.ok(dossier.speed && dossier.speed.who === "Jynxgigas");
assert.ok(dossier.desc.exact && dossier.desc.moves.length === 4);
// forced boss: only slot 1 is on the field; Gouot alone = 2 lures → next (normal) wave is a guaranteed double
let ls = adv.lureStatus(boss);
assert.equal(ls.count, 2);
assert.equal(ls.nextChance, 1);

const shiny = save.normalizeSession(samples.shinySample());
ctx = adv.makeContext({ session: shiny, roster });
v = adv.verdict(ctx);
assert.equal(v.action, "stay");
assert.ok(v.reasons.some(r => r.sev === "shiny"));
assert.ok(v.notes.some(n => /can have Neutralizing Gas/.test(n)), "Galarian Weezing may have Neutralizing Gas");
v = adv.verdict(adv.makeContext({ session: shiny, roster, peek: true }));
assert.ok(v.notes.some(n => /Neutralizing Gas is out/.test(n)), "with hidden details the gas is certain (slot 1 = Neutralizing Gas)");
ls = adv.lureStatus(shiny);
assert.equal(ls.count, 3);
assert.equal(ls.x0Chance, 1);

assert.ok(v.catches.some(r => r.sev === "shiny") && v.steals.some(r => /Golden Egg/.test(r.text)), "the shiny is the reason to stay; the egg is a steal");
assert.ok(v.scans[0].wanted && !v.scans[0].steal && !v.scans[1].wanted && v.scans[1].steal);

const plain = save.normalizeSession(samples.plainSample());
v = adv.verdict(adv.makeContext({ session: plain, roster }));
assert.equal(v.action, "run", JSON.stringify(v.reasons));
assert.equal(v.notes.length, 0, JSON.stringify(v.notes));
// the same wave with a Lucky Egg on one of them: a quick Thief, not a reason to stay
const eggRaw = samples.plainSample();
eggRaw.enemyModifiers.push({ player: false, typeId: "LUCKY_EGG", args: [eggRaw.enemyParty[0].id], stackCount: 2, className: "PokemonExpBoosterModifier" });
eggRaw.enemyModifiers.push({ player: false, typeId: "BASE_STAT_BOOSTER", typePregenArgs: [2], args: [eggRaw.enemyParty[0].id, 2], stackCount: 5, className: "BaseStatModifier" });
v = adv.verdict(adv.makeContext({ session: save.normalizeSession(eggRaw), roster }));
assert.equal(v.action, "steal", JSON.stringify(v.reasons));
assert.equal(v.title, "Steal, then run");
assert.equal(v.steals.length, 1);
assert.match(v.steals[0].text, /Holds 2 × Lucky Egg/);
assert.equal(v.catches.length, 0, "Iron (a vitamin for another stat) is not a reason for anything");
// with a dex that lacks Pelipper the same wave says stay
const sysNew = save.normalize((await save.decodeAny((await import("node:fs")).readFileSync(new URL("./fixtures/saves/data_new.prsv", import.meta.url), "utf8")))[0]);
v = adv.verdict(adv.makeContext({ session: plain, roster, system: sysNew }));
assert.equal(v.action, "stay");
assert.ok(v.reasons.some(r => /not in your dex/.test(r.text)));

// ---------- something new about a species already caught (the grey Poké Ball) ----------
{
  const B = d.S.BLASTOISE, SQ = d.S.SQUIRTLE;
  // caught: non-shiny, male, default variant, base form; Squirtle has abilities 1 and 2 (slot 1 empty → only slot 0)
  const sysDex = { kind: "system", starters: {}, caught: [B], shiny: [], dexAttrs: { [B]: String(1 + 4 + 16 + 128) }, abilities: { [SQ]: 1 } };
  const blast = (slot, extra = {}) => ({ species: B, form: 0, dexKey: { shiny: false, variant: 0, gender: 0, slot, ...extra } });
  assert.equal(adv.dexNews(blast(0), sysDex), false, "same as what you own");
  assert.equal(adv.dexNews(blast(2), sysDex), true, "hidden ability not unlocked");
  assert.equal(adv.dexNews(blast(0, { gender: 1 }), sysDex), true, "female not owned");
  assert.equal(adv.dexNews(blast(0, { shiny: true }), sysDex), true, "shiny not owned");
  assert.equal(adv.dexNews(blast(2), { ...sysDex, abilities: { [SQ]: 5 } }), false, "hidden ability already unlocked");
  assert.equal(adv.dexNews(blast(0), { ...sysDex, dexAttrs: undefined }), null, "an older synced save cannot tell");
  // through the verdict: the wild Pelipper of the plain sample, made new by an ability the dex lacks
  const pel = plain.enemies[0];
  const sysP = { kind: "system", starters: {}, caught: plain.enemies.map(e => e.species), shiny: [],
    dexAttrs: Object.fromEntries(plain.enemies.map(e => [e.species, String((BigInt(2) ** BigInt(60)) - BigInt(1))])), abilities: {} };
  plain.enemies.forEach(e => { sysP.abilities[d.root(e.species)] = 7; });
  v = adv.verdict(adv.makeContext({ session: plain, roster, system: sysP }));
  assert.equal(v.action, "run", JSON.stringify(v.reasons));
  sysP.abilities[d.root(pel.species)] = 0;
  v = adv.verdict(adv.makeContext({ session: plain, roster, system: sysP }));
  assert.equal(v.action, "stay");
  const why = v.catches.find(r => /is new to your dex/.test(r.text));
  assert.ok(why, JSON.stringify(v.catches));
  assert.ok(!/abilit|gender|shiny|form|female|male/i.test(why.text), "says that something is new, not what");
}

// ---------- candies: what a catch buys for the root starter, and which of two to catch first ----------
{
  const RAT = d.root(plain.enemies[0].species), WIN = d.root(plain.enemies[1].species); // Rattata (cost 1), Wingull (cost 2)
  assert.equal(d.sp(RAT).n, "Rattata"); assert.equal(d.sp(WIN).n, "Wingull");
  const everything = String((BigInt(2) ** BigInt(60)) - BigInt(1));
  const dexAll = () => ({ kind: "system", caught: plain.enemies.map(e => e.species), shiny: [],
    dexAttrs: Object.fromEntries(plain.enemies.map(e => [e.species, everything])), abilities: { [RAT]: 7, [WIN]: 7 } });
  const st = (candy, reductions, passive) => ({ caught: true, candy, reductions, passiveAttr: passive ? 3 : 0, abilityAttr: 7, eggMoves: 0 });
  // no starter entry: the save cannot tell, so no candy line and the wave is still a plain run
  v = adv.verdict(adv.makeContext({ session: plain, roster, system: { ...dexAll(), starters: {} } }));
  assert.equal(v.action, "run");
  assert.ok(v.scans.every(sc => sc.candy === null));
  // candy state is data on the scan, never an alert, and never changes the call: fully unlocked
  v = adv.verdict(adv.makeContext({ session: plain, roster, system: { ...dexAll(), starters: { [RAT]: st(12, 2, true), [WIN]: st(3, 2, true) } } }));
  assert.equal(v.action, "run", JSON.stringify(v.reasons));
  assert.ok(v.scans.every(sc => !sc.alerts.some(a => a.sev === "candy")));
  assert.deepEqual([v.scans[0].candy.left, v.scans[0].candy.candy, v.scans[0].candy.name], [[], 12, "Rattata"]);
  // Wingull still owes its passive and cannot pay
  let sys = { ...dexAll(), starters: { [RAT]: st(12, 2, true), [WIN]: st(1, 2, false) } };
  v = adv.verdict(adv.makeContext({ session: plain, roster, system: sys }));
  assert.equal(v.action, "run");
  assert.equal(v.reasons.length, 0);
  assert.deepEqual([v.scans[1].candy.next, v.scans[1].candy.short, v.scans[1].candy.candy], [{ what: "passive", cost: 40 }, 39, 1]);
  assert.ok(!v.scans[1].wanted);
  // enough candies banked for the next unlock
  sys.starters[WIN] = st(40, 2, false);
  v = adv.verdict(adv.makeContext({ session: plain, roster, system: sys }));
  assert.equal(v.scans[1].candy.short, 0);
  const rat = adv.scanEnemy(plain.enemies[0], adv.makeContext({ session: plain, roster, system: { ...dexAll(), starters: { [RAT]: st(5, 0, false), [WIN]: st(0, 0, false) } } }), "run").candy;
  assert.deepEqual([rat.short, rat.left.length, rat.next.what], [35, 3, "passive"]);
  // both worth catching for the dex: more unlocks left goes first (Rattata 3 against Wingull 1)
  sys.abilities = { [RAT]: 0, [WIN]: 0 };
  sys.starters = { [RAT]: st(5, 0, false), [WIN]: st(0, 2, false) };
  v = adv.verdict(adv.makeContext({ session: plain, roster, system: sys }));
  assert.equal(v.action, "stay");
  assert.deepEqual(v.catches.map(r => r.who), ["Raticate", "Pelipper"]);
  assert.ok(v.notes.some(n => /^Both are worth catching\. Raticate first: Rattata has more unlocks left \(3 against 1\)\. Remove the other one, then throw\.$/.test(n)), JSON.stringify(v.notes));
  assert.deepEqual(adv.catchOrder(plain.enemies, v.scans), [0, 1]);
  // same unlocks left: fewer candies goes first (Wingull 2 against Rattata 9)
  sys.starters = { [RAT]: st(9, 1, false), [WIN]: st(2, 1, false) };
  v = adv.verdict(adv.makeContext({ session: plain, roster, system: sys }));
  assert.deepEqual(v.catches.map(r => r.who), ["Pelipper", "Raticate"]);
  assert.ok(v.notes.some(n => /Pelipper first: both have 2 unlocks left, and Wingull has fewer candies \(2 against 9\)/.test(n)), JSON.stringify(v.notes));
  assert.deepEqual(adv.catchOrder(plain.enemies, v.scans), [1, 0]);
  // only one worth catching: no ordering note, and the candy line is not a reason
  sys.abilities[RAT] = 7;
  v = adv.verdict(adv.makeContext({ session: plain, roster, system: sys }));
  assert.equal(v.action, "stay");
  assert.deepEqual(v.catches.map(r => r.who), ["Pelipper"]);
  assert.ok(!v.notes.some(n => /first/.test(n)));
  // candy per catch, from GameData.setPokemonSpeciesCaught: ×5·2^variant for a shiny, ×2 for a boss, capped at 9,999
  const need = (extra, starter) => adv.candyNeed({ species: plain.enemies[1].species, ...extra }, { kind: "system", starters: { [WIN]: starter } });
  assert.equal(need({}, st(0, 0, false)).gain, 1);
  assert.equal(need({ shiny: true, variant: 1 }, st(0, 0, false)).gain, 10);
  assert.equal(need({ shiny: true, variant: 2, boss: true }, st(0, 0, false)).gain, 40);
  assert.equal(need({}, st(9999, 0, false)).gain, 0, "the candy cap");
  assert.deepEqual(need({}, st(0, 0, false)).left.map(x => x.cost), [40, 25, 60], "cost-2 starter: passive 40, reductions 25 and 60");
  assert.deepEqual(need({}, st(0, 1, true)).left.map(x => x.what), ["second cost reduction"]);
  assert.equal(need({}, st(0, 0, false)).rank[0], 3);
  assert.equal(adv.candyNeed({ species: 99999 }, { kind: "system", starters: {} }), null);
  // the carry phase carries the same state
  const sc = adv.scanEnemy(plain.enemies[1], adv.makeContext({ session: plain, roster, system: { ...dexAll(), starters: { [RAT]: st(0, 2, true), [WIN]: st(0, 2, false) } } }), "carry");
  assert.ok(sc.candy && sc.candy.left.length === 1 && !sc.wanted);
}

// ---------- Power Construct fusion: Entrainment cannot work ----------
const zyg = save.normalizeSession(samples.zygardeSample());
ctx = adv.makeContext({ session: zyg, roster, peek: true });
assert.equal(zyg.enemies[0].ability, A.POWER_CONSTRUCT);
assert.equal(zyg.enemies[0].passiveOn, false, "Eternatus waves have no passive");
dossier = adv.bossDossier({ ...zyg.enemies[0], fromSave: true }, ctx, zyg.wave);
assert.equal(dossier.line, "sturdy");
assert.ok(dossier.notes.some(n => /Entrainment fails/.test(n.title)));
assert.ok(dossier.notes.some(n => /Heals/.test(n.title)));
assert.ok(dossier.speed, "speed comparison available with hidden details");

// ---------- fused the wrong way round ----------
const wrong = save.normalizeSession(samples.wrongOrderSample());
ctx = adv.makeContext({ session: wrong, roster });
assert.ok(ctx.assign.flags.killer && ctx.assign.flags.killer.wrongOrder);
const s10 = adv.stepStatus(step("s10"), ctx);
assert.equal(s10.state, "todo");
assert.match(s10.detail, /wrong way round/);
// Speed IV 24 caps Carbos at 24
const s15 = adv.stepStatus(step("s15"), ctx);
assert.equal(s15.state, "done");
assert.match(s15.detail, /24 of 24/);
// manual tick overrides the save
ctx = adv.makeContext({ session: wrong, roster, manual: { splice: { s10: "done" }, items: {}, reductions: {} } });
assert.equal(adv.effectiveStep(step("s10"), ctx).state, "done");
assert.equal(adv.effectiveStep(step("s10"), ctx).source, "manual");
// a single battle with only Regigigas out: the Max Lure alone gives 1/2
const lw = adv.lureStatus(wrong);
assert.equal(wrong.double, false);
assert.equal(lw.count, 1);
assert.equal(lw.nextChance, 0.5);

// ---------- no save at all ----------
ctx = adv.makeContext({});
assert.equal(adv.effectiveStep(step("s2"), ctx).state, "todo");
assert.equal(adv.readiness(ctx).ready, false);
assert.equal(adv.verdict(ctx), null);
assert.ok(adv.stepCandidates(step("s2"), ctx).groups[0].rows.length === 3);
const man = adv.makeContext({ manual: { splice: { s2: "done" }, items: { "staller:CARBOS": 31 }, reductions: {} } });
assert.equal(adv.effectiveStep(step("s2"), man).state, "done");
assert.equal(adv.itemAudit(man).roles[0].rows.find(r => r.key === "CARBOS").done, true);

// ---------- the whole pipeline from encrypted text, as the bridge delivers it ----------
const envelope = JSON.stringify({ source: "nz-bridge", v: 1, entries: {
  "sessionData_Player": encryptPrsv(JSON.stringify(samples.shinySample())),
  "sessionData1_Player": encryptPrsv(JSON.stringify(samples.carrySample())),
  "data_Player": (await import("node:fs")).readFileSync(new URL("./fixtures/saves/full_unlocks_sanitized.prsv", import.meta.url), "utf8"),
  "settings": "{\"x\":1}", "prLang": "en",
} });
const decoded = await save.decodeAny(envelope);
assert.deepEqual(decoded.map(x => x.kind).sort(), ["session", "session", "system"]);
assert.deepEqual(decoded.filter(x => x.kind === "session").map(x => x.raw.waveIndex).sort((a, b) => a - b), [734, 1763]);
console.log("advisor tests passed");
