// Builds sample session saves in the game's own save shape (SessionSaveData / PokemonData / ModifierData).
// They power the "try a sample" button and the tests. Nothing here is a real player's data.
import { readFileSync } from "node:fs";
const D = JSON.parse(readFileSync(new URL("../data/game-data.json", import.meta.url), "utf8"));
const S = {}, M = {}, A = {};
for (const k in D.sp) S[D.sp[k].k] = +k;
for (const k in D.mv) M[D.mv[k][0]] = +k;
for (const k in D.ab) A[D.ab[k][0]] = +k;
const NATURE = Object.fromEntries(D.natures.map((n, i) => [n.toUpperCase(), i]));
const TYPE = Object.fromEntries(D.types.map((n, i) => [n.toUpperCase(), i]));

let nextId = 100000;
const formOf = (id, fi) => {
  const s = D.sp[id];
  const f = s.f && s.f[fi || 0];
  return f ? { abilities: [f[4], f[5], f[6]], stats: f.slice(7, 13) } : { abilities: s.a, stats: s.b };
};
const natureMult = (nature, stat) => {
  const order = [1, 2, 5, 3, 4];
  const up = order[Math.floor(nature / 5)], down = order[nature % 5];
  return up === down ? 1 : stat === up ? 1.1 : stat === down ? 0.9 : 1;
};

/** p: { sp, form, fusion: {sp, form, slot}, level, nature, ivs, moves, slot, passive, items: {KEY: n}, ... } */
function mon(p, player, itemsOut) {
  const id = nextId++;
  const species = S[p.sp];
  if (species == null) throw new Error("unknown species key " + p.sp);
  for (const k of p.moves || []) if (M[k] == null) throw new Error("unknown move key " + k);
  if (p.fusion && S[p.fusion.sp] == null) throw new Error("unknown fusion species key " + p.fusion.sp);
  const base = formOf(species, p.form || 0).stats.slice();
  let stats = base;
  if (p.fusion) {
    const fb = formOf(S[p.fusion.sp], p.fusion.form || 0).stats;
    stats = base.map((b, i) => Math.ceil((b + fb[i]) / 2));
  }
  const items = p.items || {};
  const vit = ["HP_UP", "PROTEIN", "IRON", "CALCIUM", "ZINC", "CARBOS"];
  stats = stats.map((b, i) => Math.floor(b * (1 + (items[vit[i]] || 0) * 0.1)));
  const ivs = p.ivs || [31, 31, 31, 31, 31, 31];
  const level = p.level;
  const nature = NATURE[(p.nature || "HARDY").toUpperCase()];
  const out = stats.map((b, i) => {
    let v = Math.floor((2 * b + ivs[i]) * level * 0.01);
    if (i === 0) return v + level + 10;
    v += 5;
    let m = natureMult(nature, i);
    if (m !== 1) { m += 0.1 * (items.SOUL_DEW || 0) * (m > 1 ? 1 : -1); v = Math.max(m > 1 ? Math.ceil(v * m) : Math.floor(v * m), 1); }
    return v;
  });
  for (const [key, count] of Object.entries(items)) {
    const vi = vit.indexOf(key);
    if (vi !== -1) itemsOut.push({ player, typeId: "BASE_STAT_BOOSTER", typePregenArgs: [vi], args: [id, vi], stackCount: count, className: "BaseStatModifier" });
    else itemsOut.push({ player, typeId: key, args: [id], stackCount: count, className: "PokemonHeldItemModifier" });
  }
  const custom = { spriteScale: -1, ability: -1, passive: -1, nature: -1, types: [] };
  return {
    id, player, species, nickname: p.nickname ? Buffer.from(p.nickname, "utf8").toString("base64") : undefined,
    formIndex: p.form || 0, abilityIndex: p.slot || 0, passive: !!p.passive, shiny: !!p.shiny, variant: p.variant || 0,
    pokeball: p.ball || 0, level, exp: level * level * level, levelExp: 0, gender: 0,
    hp: p.hp != null ? Math.round(out[0] * p.hp) : out[0], stats: out, ivs, nature,
    moveset: (p.moves || []).map(k => ({ moveId: M[k], ppUsed: 0, ppUp: 0 })),
    status: null, friendship: 70, metLevel: player && p.starter ? 20 : level, metBiome: p.starter ? -1 : 6, metSpecies: species,
    metWave: p.starter ? -1 : 100, luck: 0, pauseEvolutions: !!p.pause, pokerus: false, usedTMs: [],
    teraType: p.tera != null ? TYPE[p.tera] : D.sp[species].t[0], isTerastallized: false, stellarTypesBoosted: [],
    fusionSpecies: p.fusion ? S[p.fusion.sp] : undefined, fusionFormIndex: p.fusion ? p.fusion.form || 0 : 0,
    fusionAbilityIndex: p.fusion ? p.fusion.slot || 0 : 0, fusionShiny: false, fusionVariant: 0, fusionGender: 0, fusionLuck: 0,
    fusionTeraType: 0, boss: !!p.boss, bossSegments: p.segments || 0,
    summonData: { statStages: [0, 0, 0, 0, 0, 0, 0], moveQueue: [], tags: [], abilitySuppressed: false, abilitiesApplied: [], stats: [0, 0, 0, 0, 0, 0], types: [], berriesEatenLast: [], moveHistory: [] },
    battleData: { hitCount: 0, hasEatenBerry: false, berriesEaten: [] }, summonDataSpeciesFormIndex: undefined,
    customPokemonData: custom, fusionCustomPokemonData: { ...custom },
  };
}

function session({ wave, party, enemies, bag = {}, lures = [], tokens = {}, balls = [0, 0, 0, 0, 0], money = 0, biome = 6, ts }) {
  const modifiers = [], enemyModifiers = [];
  const p = party.map(x => mon(x, true, modifiers));
  const e = enemies.map(x => mon(x, false, enemyModifiers));
  for (const [key, count] of Object.entries(bag)) modifiers.push({ player: true, typeId: key, args: [], stackCount: count, className: "PersistentModifier" });
  for (const l of lures) modifiers.push({ player: true, typeId: l.tier, args: [l.max, l.left], stackCount: 1, className: "DoubleBattleChanceBoosterModifier" });
  for (const [key, count] of Object.entries(tokens)) enemyModifiers.push({ player: false, typeId: key, args: [], stackCount: count, className: "EnemyPersistentModifier" });
  return {
    seed: "nzSampleSeed0000000000", playTime: wave * 9, gameMode: 1, party: p, enemyParty: e, modifiers, enemyModifiers,
    arena: { biome, weather: null, terrain: null, tags: [], positionalTags: [], playerTerasUsed: 0 },
    pokeballCounts: Object.fromEntries(balls.map((n, i) => [i, n])), money, score: 0, waveIndex: wave, battleType: 0, trainer: null,
    gameVersion: "1.12.0.11", timestamp: ts, challenges: [], mysteryEncounterType: -1, mysteryEncounterSaveData: { encounteredEvents: [], encounterSpawnChance: 3, queuedEncounters: [] }, playerFaints: 0,
    name: "",
  };
}

const TS = Date.UTC(2026, 9, 11, 17, 0, 0);
const EGGS = (lucky, golden) => ({ LUCKY_EGG: lucky, GOLDEN_EGG: golden });

/** Mid carry phase: a Mat Block carrier and a Carbos holder are on the field. */
export function carrySample() {
  return session({
    wave: 734, ts: TS, money: 86400, balls: [41, 18, 22, 9, 6], biome: 13,
    lures: [{ tier: "SUPER_LURE", max: 15, left: 9 }],
    bag: { LOCK_CAPSULE: 1, SHINY_CHARM: 2, AMULET_COIN: 3, EXP_CHARM: 5, SUPER_EXP_CHARM: 2, HEALING_CHARM: 2, BERRY_POUCH: 1, IV_SCANNER: 1 },
    tokens: { ENEMY_DAMAGE_BOOSTER: 6, ENEMY_DAMAGE_REDUCTION: 5, ENEMY_ATTACK_POISON_CHANCE: 2, ENEMY_ENDURE_CHANCE: 1, ENEMY_HEAL: 2 },
    party: [
      { sp: "REGIGIGAS", slot: 2, passive: true, starter: true, level: 912, nature: "Adamant", moves: ["ROCK_SLIDE", "STORM_THROW", "ENDURE", "PROTECT"], items: { CARBOS: 12, GRIP_CLAW: 3, ...EGGS(14, 2), LEFTOVERS: 2, MULTI_LENS: 1 } },
      { sp: "GOURGEIST", slot: 1, passive: true, starter: true, level: 655, nature: "Jolly", moves: ["DARK_VOID", "TRICK_OR_TREAT", "SKETCH", "LEECH_SEED"], items: { CARBOS: 9, SOUL_DEW: 3, WIDE_LENS: 1, ...EGGS(9, 1) } },
      { sp: "TEDDIURSA", slot: 2, passive: true, starter: true, pause: true, level: 640, nature: "Jolly", moves: ["THIEF", "ROAR", "COVET", "FAKE_TEARS"], items: { MINI_BLACK_HOLE: 1 } },
      { sp: "JYNX", slot: 0, passive: true, starter: true, level: 661, nature: "Timid", moves: ["POWDER_SNOW", "PSYCHIC", "LOVELY_KISS", "PERISH_SONG"], items: { SOUL_DEW: 2 } },
      { sp: "YAMASK", slot: 0, passive: true, starter: true, level: 648, nature: "Bold", moves: ["PROTECT", "DISABLE", "CURSE", "SALT_CURE"], items: { LEFTOVERS: 1 } },
      { sp: "TREVENANT", slot: 0, level: 702, nature: "Relaxed", moves: ["LEECH_SEED", "HORN_LEECH", "SHADOW_CLAW", "WILL_O_WISP"], items: {} },
    ],
    enemies: [
      { sp: "THROH", slot: 1, level: 771, nature: "Brave", moves: ["MAT_BLOCK", "STORM_THROW", "BULK_UP", "SEISMIC_TOSS"], items: { SITRUS: 0 } },
      { sp: "GARCHOMP", slot: 0, level: 780, nature: "Naive", moves: ["DRAGON_CLAW", "EARTHQUAKE", "SANDSTORM", "CRUNCH"], items: { CARBOS: 4, LUCKY_EGG: 1 } },
    ].map(e => ({ ...e, items: Object.fromEntries(Object.entries(e.items).filter(([, n]) => n > 0)) })),
  });
}

const finalParty = extra => [
  { sp: "GOURGEIST", fusion: { sp: "PIDGEOT", form: 1, slot: 0 }, slot: 1, passive: true, starter: true, level: 4830, nature: "Timid", moves: ["DARK_VOID", "MAT_BLOCK", "POWDER_SNOW", "TRICK_OR_TREAT"],
    items: { CARBOS: 31, SOUL_DEW: 10, WIDE_LENS: 3, MULTI_LENS: 2, KINGS_ROCK: 3, MINI_BLACK_HOLE: 1, ...EGGS(71, 16) } },
  { sp: "TEDDIURSA", fusion: { sp: "GOLURK", form: 0, slot: 2 }, slot: 2, passive: true, starter: true, pause: true, level: 3410, nature: "Jolly", tera: "GHOST", moves: ["THIEF", "RUINATION", "ROAR", "GASTRO_ACID"],
    items: { MINI_BLACK_HOLE: 1, MULTI_LENS: 2, REVIVER_SEED: 1 } },
  { sp: "JYNX", fusion: { sp: "REGIGIGAS", form: 0, slot: 2 }, slot: 0, passive: true, starter: true, level: 5120, nature: "Timid", tera: "GHOST", moves: ["ENTRAINMENT", "CURSE", "GASTRO_ACID", "DISABLE"],
    items: { CARBOS: 31, SOUL_DEW: 10, MYSTICAL_ROCK: 2, MINI_BLACK_HOLE: 1, ...EGGS(64, 13) } },
  { sp: "YAMASK", fusion: { sp: "MAGNEZONE", form: 0, slot: 1 }, slot: 0, passive: true, starter: true, level: 3390, nature: "Bold", moves: ["HEAL_BLOCK", "LEECH_SEED", "SOAK", "SALT_CURE"],
    items: { LEFTOVERS: 4, WIDE_LENS: 2 } },
  ...extra,
];
const runBag = { TERA_ORB: 1, LOCK_CAPSULE: 1, SHINY_CHARM: 4, AMULET_COIN: 5, EXP_CHARM: 9, SUPER_EXP_CHARM: 6, GOLDEN_EXP_CHARM: 2, HEALING_CHARM: 5, BERRY_POUCH: 3, IV_SCANNER: 1, MEGA_BRACELET: 1, CATCHING_CHARM: 2 };
const runTokens = { ENEMY_DAMAGE_BOOSTER: 31, ENEMY_DAMAGE_REDUCTION: 27, ENEMY_ATTACK_POISON_CHANCE: 8, ENEMY_ATTACK_BURN_CHANCE: 6, ENEMY_ATTACK_PARALYZE_CHANCE: 5, ENEMY_ENDURE_CHANCE: 4, ENEMY_HEAL: 9, ENEMY_FUSED_CHANCE: 3 };

/** Running: forced Slither Wing boss with Dual Wingbeat. */
export function bossSample() {
  return session({
    wave: 2350, ts: TS + 3600e3, money: 91240000000, balls: [112, 87, 140, 23, 57], biome: 50, bag: runBag, tokens: runTokens,
    party: finalParty([{ sp: "WHIMSICOTT", slot: 0, level: 3180, nature: "Timid", moves: ["TAILWIND", "MOONBLAST", "COTTON_GUARD", "ENERGY_BALL"], items: {} }]),
    enemies: [{ sp: "SLITHER_WING", slot: 0, boss: true, segments: 9, level: 3525, nature: "Adamant", moves: ["DUAL_WINGBEAT", "MORNING_SUN", "FIRST_IMPRESSION", "SUPERPOWER"], items: { LUCKY_EGG: 2, GOLDEN_EGG: 1 } }],
  });
}

/** Running: a normal double with a shiny that has Neutralizing Gas next to it. */
export function shinySample() {
  return session({
    wave: 1763, ts: TS + 1800e3, money: 5120000000, balls: [112, 87, 140, 31, 52], biome: 9, bag: runBag, tokens: runTokens,
    party: finalParty([{ sp: "WHIMSICOTT", slot: 0, level: 2390, nature: "Timid", moves: ["TAILWIND", "MOONBLAST", "COTTON_GUARD", "ENERGY_BALL"], items: {} }]),
    enemies: [
      { sp: "DREEPY", slot: 0, level: 2640, shiny: true, variant: 1, nature: "Hasty", moves: ["ASTONISH", "INFESTATION", "QUICK_ATTACK", "BITE"], items: {} },
      { sp: "GALAR_WEEZING", slot: 1, level: 2655, nature: "Bold", moves: ["STRANGE_STEAM", "SLUDGE_BOMB", "DESTINY_BOND", "HEAT_WAVE"], items: { GOLDEN_EGG: 1 } },
    ],
  });
}

/** Running: a plain double with nothing worth staying for. */
export function plainSample() {
  return session({
    wave: 1764, ts: TS + 1830e3, money: 5120000000, balls: [112, 87, 140, 31, 52], biome: 9, bag: runBag, tokens: runTokens,
    party: finalParty([{ sp: "WHIMSICOTT", slot: 0, level: 2390, nature: "Timid", moves: ["TAILWIND", "MOONBLAST", "COTTON_GUARD", "ENERGY_BALL"], items: {} }]),
    enemies: [
      { sp: "RATICATE", slot: 0, level: 2641, nature: "Jolly", moves: ["SUPER_FANG", "CRUNCH", "SUCKER_PUNCH", "DOUBLE_EDGE"], items: { SITRUS_PLACEHOLDER: 0 } },
      { sp: "PELIPPER", slot: 1, level: 2660, nature: "Modest", moves: ["HURRICANE", "HYDRO_PUMP", "ROOST", "TAILWIND"], items: {} },
    ].map(e => ({ ...e, items: {} })),
  });
}

/** Test fixture: Eternatus fused with Zygarde (Power Construct cannot be replaced). */
export function zygardeSample() {
  return session({
    wave: 2500, ts: TS + 7200e3, money: 1, balls: [1, 1, 1, 1, 60], biome: 50, bag: runBag, tokens: runTokens,
    party: finalParty([]),
    enemies: [{ sp: "ETERNATUS", fusion: { sp: "ZYGARDE", form: 2, slot: 0 }, slot: 0, boss: true, segments: 10, level: 3760, nature: "Timid", moves: ["DYNAMAX_CANNON", "RECOVER", "THOUSAND_ARROWS", "DRAGON_DANCE"], items: { CARBOS: 14 } }],
  });
}

/** Test fixture: the boss killer fused the wrong way round (Magnezone is the base). */
export function wrongOrderSample() {
  const s = carrySample();
  return session({
    wave: 905, ts: TS + 900e3, money: 1000, balls: [10, 10, 10, 5, 12], biome: 6, lures: [{ tier: "MAX_LURE", max: 30, left: 2 }], bag: { LOCK_CAPSULE: 1 },
    party: [
      { sp: "REGIGIGAS", slot: 2, passive: true, starter: true, level: 1100, nature: "Adamant", moves: ["ROCK_SLIDE", "STORM_THROW", "ENDURE", "ENTRAINMENT"], items: { CARBOS: 31 } },
      { sp: "GOURGEIST", slot: 1, passive: true, starter: true, level: 800, nature: "Jolly", ivs: [31, 31, 31, 31, 31, 24], moves: ["DARK_VOID", "TRICK_OR_TREAT", "MAT_BLOCK", "POWDER_SNOW"], items: { CARBOS: 24 } },
      { sp: "MAGNEZONE", fusion: { sp: "YAMASK", form: 0, slot: 0 }, slot: 1, level: 790, nature: "Bold", moves: ["HEAL_BLOCK", "LEECH_SEED", "SOAK", "SALT_CURE"], items: {} },
      { sp: "TEDDIURSA", slot: 2, passive: true, starter: true, level: 780, nature: "Jolly", moves: ["THIEF", "ROAR", "RUINATION", "GASTRO_ACID"], items: {} },
      { sp: "JYNX", slot: 0, passive: true, starter: true, level: 805, nature: "Timid", moves: ["CURSE", "GASTRO_ACID", "DISABLE", "POWDER_SNOW"], items: {} },
    ],
    enemies: [{ sp: "SKARMORY", slot: 1, level: 950, nature: "Impish", moves: ["STEEL_WING", "SPIKES", "ROOST", "WHIRLWIND"], items: {} }],
  });
}

export const samples = { carry: carrySample, boss: bossSample, shiny: shinySample, plain: plainSample };
