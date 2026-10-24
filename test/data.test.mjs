import assert from "node:assert/strict";
import { loadNZ } from "./load.mjs";
const NZ = loadNZ(["00-util.js", "10-data.js"]);
const d = NZ.data, S = d.S, A = d.A, M = d.M;

// fused names the guide and Grex's screenshots use
assert.equal(d.pokemonName(S.GOURGEIST, 0, S.PIDGEOT, 1), "Mega Gouot");
assert.equal(d.pokemonName(S.TEDDIURSA, 0, S.GOLURK, 0), "Teddiurk");
assert.equal(d.pokemonName(S.JYNX, 0, S.REGIGIGAS, 0), "Jynxgigas");
assert.equal(d.pokemonName(S.YAMASK, 0, S.MAGNEZONE, 0), "Yamazone");
assert.equal(d.pokemonName(S.KYOGRE, 0, S.DELCATTY, 0), "Kyotty");
assert.equal(d.pokemonName(S.TEDDIURSA, 0, S.DUGTRIO, 0), "Teddiuo");

// build facts straight from the live data
assert.equal(d.passive(S.TEDDIURSA, 0), A.RUN_AWAY);
assert.notEqual(d.passive(S.URSARING, 0), A.RUN_AWAY);
assert.equal(d.passive(S.PUMPKABOO, 0), A.ILLUMINATE);
assert.notEqual(d.passive(S.PUMPKABOO, 1), A.ILLUMINATE);
assert.equal(d.passive(S.GOURGEIST, 0), A.ILLUMINATE);
assert.equal(d.passive(S.SMOOCHUM, 0), A.PSYCHIC_SURGE);
assert.equal(d.passive(S.JYNX, 0), A.PSYCHIC_SURGE);
assert.equal(d.passive(S.YAMASK, 0), A.PURIFYING_SALT);
assert.equal(d.passive(S.REGIGIGAS, 0), A.SCRAPPY);
assert.equal(d.abilityAt(S.REGIGIGAS, 0, 2), A.NORMALIZE);
assert.equal(d.abilityAt(S.GOLURK, 0, 2), A.NO_GUARD);
assert.equal(d.abilityAt(S.PIDGEOT, 1, 0), A.NO_GUARD);
assert.equal(d.knowsByLevel(S.YAMASK, 0, M.HEAL_BLOCK), null, "Yamask no longer learns Heal Block");
assert.equal(d.passive(S.SLITHER_WING, 0), A.SCRAPPY);
assert.ok(d.canTm(S.TEDDIURSA, M.THIEF) && d.canTm(S.TEDDIURSA, M.ROAR));
assert.ok(d.canTm(S.REGIGIGAS, M.ROCK_SLIDE) && d.canTm(S.REGIGIGAS, M.DARKEST_LARIAT));
assert.deepEqual(d.eggMoves(S.REGIGIGAS).map(m => d.mv(m).key), ["OBSTRUCT", "RECOVER", "STORM_THROW", "LANDS_WRATH"]);
assert.equal(d.eggMoves(S.SMEARGLE)[3], M.DARK_VOID);

// fusion math
const yamazone = d.fuse({ id: S.YAMASK, form: 0 }, { id: S.MAGNEZONE, form: 0, slot: 1 });
assert.deepEqual(yamazone.types.map(d.typeName), ["Ghost", "Steel"]);
assert.equal(yamazone.ability, A.STURDY);
assert.equal(yamazone.passive, A.PURIFYING_SALT);
const teddiurk = d.fuse({ id: S.TEDDIURSA, form: 0 }, { id: S.GOLURK, form: 0, slot: 2 });
assert.deepEqual(teddiurk.types.map(d.typeName), ["Normal", "Ghost"]);
assert.equal(teddiurk.ability, A.NO_GUARD);
const gouot = d.fuse({ id: S.GOURGEIST, form: 0 }, { id: S.PIDGEOT, form: 1, slot: 0 });
assert.deepEqual(gouot.types.map(d.typeName), ["Ghost", "Flying"]);
assert.equal(gouot.stats[5], Math.ceil((84 + 121) / 2));
const skarm = d.fuse({ id: S.YAMASK, form: 0 }, { id: S.SKARMORY, form: 0, slot: 1 });
assert.deepEqual(skarm.types.map(d.typeName), ["Ghost", "Flying"], "a Steel/Flying partner leaves Yamask Ghost/Flying");
const jynxgigas = d.fuse({ id: S.JYNX, form: 0 }, { id: S.REGIGIGAS, form: 0, slot: 2 });
assert.deepEqual(jynxgigas.types.map(d.typeName), ["Ice", "Normal"]);
assert.equal(jynxgigas.ability, A.NORMALIZE);
assert.equal(jynxgigas.passive, A.PSYCHIC_SURGE);

// cost rules
assert.equal(d.reducedCost(7, 2), 5);
assert.equal(d.reducedCost(2, 2), 0.5);
assert.equal(d.reducedCost(1, 2), 0.25);
assert.deepEqual(d.natureEffect(10), { up: 5, down: 1 }, "Timid: +Spd -Atk");
assert.deepEqual(d.natureEffect(13), { up: 5, down: 3 }, "Jolly: +Spd -SpAtk");
assert.equal(d.natureEffect(0), null);

// finders
assert.deepEqual(d.learners(M.MAT_BLOCK).map(l => d.sp(l.id).k).sort(), ["BATTLE_BOND_GRENINJA", "GRENINJA", "THROH"]);
assert.ok(d.withAbility(A.NORMALIZE).every(r => ["SKITTY", "DELCATTY", "REGIGIGAS"].includes(d.sp(r.id).k)));
assert.deepEqual(d.startersWithPassive(A.ILLUMINATE).map(r => d.sp(r.id).k), ["PUMPKABOO"]);
assert.equal(d.search("yama")[0].name, "Yamask");
// timed events (src/data/balance/timed-events.ts): active from the start date up to, not including, the end date (UTC)
const halloween = d.activeEvents("2026-10-30").find(e => e.n === "Halloween 26");
assert.ok(halloween, "Halloween 26 runs on 30 Oct 2026");
assert.equal(halloween.shiny, 2); assert.equal(halloween.candy, 1);
assert.deepEqual(halloween.biomes, { 3: [19], 4: [19] }, "Tall Grass and Metropolis lead to Graveyard");
assert.ok(halloween.sp.includes(S.PUMPKABOO) && halloween.sp.includes(S.ROARING_MOON));
assert.ok(d.activeEvents("2026-10-23").some(e => e.n === "Halloween 26"), "starts on its first day");
assert.ok(!d.activeEvents("2026-11-09").some(e => e.n === "Halloween 26"), "over on its end date");
assert.ok(!d.activeEvents("2026-10-22").some(e => e.n === "Halloween 26"));
console.log("data tests passed");
