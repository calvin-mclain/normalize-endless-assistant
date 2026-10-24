#!/usr/bin/env node
/**
 * Refresh data/game-data.json straight from the PokéRogue source. One command, no packages:
 *
 *   node build/update_data.mjs            # fetch `main`, extract, write the dataset, print a short change summary
 *   node build/update_data.mjs --ref beta # another branch, tag or commit
 *   node build/update_data.mjs --check    # extract and compare only, write nothing (exit 1 when the data differs)
 *   node build/update_data.mjs --verbose  # list every changed species, move and ability
 *   node build/update_data.mjs --src DIR --locales DIR   # use existing checkouts instead of the cache
 *
 * How it works: a sparse, blob-less checkout of pagefaultgames/pokerogue (src/ only) and of pokerogue-locales (en/ only)
 * lives in the OS temp dir and is fetched again on each run. The data files are declarative TypeScript (object literals and
 * `new X(...)` builder chains), so the script strips the types with Node's own stripper and evaluates each data function in
 * a sandbox scope where every unknown identifier is a recording stub. Species, moves, abilities, egg moves, the END biome
 * pool, candy costs and timed events come out as plain objects, which the compaction step below turns into the dataset the
 * page embeds. The output schema is unchanged from the original extraction (see the `out` object at the end).
 *
 * The summary printed at the end is deliberately small: version, counts, and what changed, so a reviewer (or an AI
 * assistant) can judge the update without reading the 450 KB file. `--verbose` prints the full lists.
 */
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { stripTypeScriptTypes } from "node:module";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(fileURLToPath(new URL("..", import.meta.url)));
const GAME_REPO = "https://github.com/pagefaultgames/pokerogue.git";
const LOCALES_REPO = "https://github.com/pagefaultgames/pokerogue-locales.git";

// ---- arguments -----------------------------------------------------------------------------------------------------
const args = process.argv.slice(2);
const opt = (name, dflt) => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : dflt; };
const flag = name => args.includes(name);
const REF = opt("--ref", "main");
const VERBOSE = flag("--verbose");
const CHECK = flag("--check");
const CACHE = opt("--cache", join(tmpdir(), "nz-pokerogue"));
const SRC = opt("--src", join(CACHE, "game"));
const LOC = opt("--locales", join(CACHE, "locales"));
const today = new Date().toISOString().slice(0, 10);
const OUT = resolve(opt("--out", join(ROOT, "data", "game-data.json")));

// ---- checkouts -----------------------------------------------------------------------------------------------------
function git(cwd, ...a) {
  return execFileSync("git", a, { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], windowsHide: true }).trim();
}
/** Keep a shallow, blob-less, sparse checkout of one directory of a repo at `ref`. */
function checkout(dir, url, ref, sparse) {
  if (!existsSync(join(dir, ".git"))) {
    mkdirSync(dir, { recursive: true });
    git(dir, "-c", "core.longpaths=true", "clone", "-q", "--depth", "1", "--filter=blob:none", "--sparse", "--no-checkout", url, ".");
    git(dir, "config", "core.longpaths", "true");
    git(dir, "sparse-checkout", "set", sparse);
  }
  git(dir, "fetch", "-q", "--depth", "1", "--filter=blob:none", "origin", ref);
  git(dir, "-c", "advice.detachedHead=false", "checkout", "-q", "--force", "FETCH_HEAD");
  return { commit: git(dir, "rev-parse", "--short", "HEAD"), date: git(dir, "log", "-1", "--format=%cs") };
}

let gameInfo = { commit: "local", date: today }, localeInfo = null;
if (!args.includes("--src")) {
  process.stderr.write(`fetching pokerogue ${REF}… `);
  gameInfo = checkout(SRC, GAME_REPO, REF, "src");
  process.stderr.write(`${gameInfo.commit} (${gameInfo.date})\n`);
} else if (existsSync(join(SRC, ".git"))) {
  gameInfo = { commit: git(SRC, "rev-parse", "--short", "HEAD"), date: git(SRC, "log", "-1", "--format=%cs") };
}
if (!args.includes("--locales")) {
  process.stderr.write("fetching locales… ");
  localeInfo = checkout(LOC, LOCALES_REPO, "main", "en");
  process.stderr.write(`${localeInfo.commit}\n`);
}
const read = rel => readFileSync(join(SRC, rel), "utf8");
const readJson = p => JSON.parse(readFileSync(p, "utf8"));
const version = readJson(join(SRC, "package.json")).version;

// ---- a tiny TypeScript data evaluator --------------------------------------------------------------------------------
/** Strip types and import/export keywords so a data module body can run as sloppy-mode script. */
function toScript(ts) {
  let js = stripTypeScriptTypes(ts, { mode: "transform" });
  js = js.replace(/^import[^;]*?;$/gms, "").replace(/^export\s+(default\s+)?/gm, "");
  return js;
}
const PATH = Symbol("path"), CHAIN = Symbol("chain");
/**
 * A recording stub. `Foo.BAR` gives another stub whose path is "Foo.BAR"; `new Foo(a, b)` gives a chain object that records
 * the constructor and every method called on it (`.attr(X, 1).target(T)`) and returns itself; `Foo()` records nothing and
 * returns a stub. Stubs coerce to their path so computed keys and string needles work.
 */
function ref(path) {
  const target = function () {};
  return new Proxy(target, {
    get(_t, prop) {
      if (prop === PATH) return path;
      if (prop === Symbol.toPrimitive || prop === "toString" || prop === "valueOf") return () => path;
      if (prop === Symbol.iterator) return function* () {};
      if (prop === "then") return undefined;
      if (typeof prop === "symbol") return undefined;
      return ref(path + "." + prop);
    },
    has: () => true,
    apply: () => ref(path + "()"),
    construct: (_t, a) => chain(path, a),
  });
}
function chain(cls, ctorArgs) {
  const rec = { cls, args: ctorArgs, calls: [] };
  const p = new Proxy(rec, {
    get(t, prop) {
      if (prop === CHAIN) return rec;
      if (prop in t) return t[prop];
      if (prop === Symbol.toPrimitive || prop === "toString" || prop === "valueOf") return () => `new ${cls}(…)`;
      if (typeof prop === "symbol") return undefined;
      return (...a) => { rec.calls.push([prop, a]); return p; };
    },
  });
  return p;
}
const isRef = v => typeof v === "function" && v[PATH] != null;
const pathOf = v => (isRef(v) ? v[PATH] : null);
/** Run `code` with every free identifier resolved from `vars`, then the real globals, then a recording stub. */
function evaluate(code, vars, tail) {
  const scope = new Proxy(vars, {
    has: () => true,
    get(t, name) {
      if (typeof name === "symbol") return undefined;
      if (name in t) return t[name];
      if (name in globalThis) return globalThis[name];
      return ref(name);
    },
  });
  return new Function("scope", `with (scope) { ${code}\n${tail} }`)(scope);
}
/** Source text of a `function name(…) {…}` declaration, found by brace matching that skips strings and comments. */
function sliceBlock(code, startRe, open = "{", close = "}") {
  const m = startRe.exec(code);
  if (!m) throw new Error(`pattern not found: ${startRe}`);
  let i = code.indexOf(open, m.index + m[0].length - 1), depth = 0;
  for (; i < code.length; i++) {
    const c = code[i], n = code[i + 1];
    if (c === "/" && n === "/") { i = code.indexOf("\n", i); continue; }
    if (c === "/" && n === "*") { i = code.indexOf("*/", i) + 1; continue; }
    if (c === '"' || c === "'" || c === "`") {
      for (i++; i < code.length && code[i] !== c; i++) if (code[i] === "\\") i++;
      continue;
    }
    if (c === open) depth++;
    else if (c === close && --depth === 0) return code.slice(m.index, i + 1);
  }
  throw new Error("unbalanced block");
}
/** Serialise builder arguments the way the source spells them, for needle searches ("SANDSTORM", "false", …). */
function raw(v) {
  if (isRef(v)) return v[PATH];
  if (v && v[CHAIN]) return `new ${v[CHAIN].cls}(${v[CHAIN].args.map(raw).join(", ")})`;
  if (typeof v === "function") return v.toString().replace(/\s+/g, " ");
  if (Array.isArray(v)) return `[${v.map(raw).join(", ")}]`;
  if (v && typeof v === "object") return `{${Object.entries(v).map(([k, x]) => `${k}: ${raw(x)}`).join(", ")}}`;
  return String(v);
}

// ---- enums -----------------------------------------------------------------------------------------------------------
/** `{ NAME: value }` for an `enum X {}` or `const X = {} as const` in src/enums. */
function readEnum(file, name) {
  const js = toScript(read(`src/enums/${file}.ts`));
  const table = evaluate(js, {}, `return ${name};`);
  const out = {};
  for (const [k, v] of Object.entries(table)) if (!/^-?\d+$/.test(k)) out[k] = v;
  return out;
}
const SpeciesId = readEnum("species-id", "SpeciesId");
const MoveId = readEnum("move-id", "MoveId");
const AbilityId = readEnum("ability-id", "AbilityId");
const PokemonType = readEnum("pokemon-type", "PokemonType");
const BiomeId = readEnum("biome-id", "BiomeId");
const Nature = readEnum("nature", "Nature");
const SpeciesFormKey = readEnum("species-form-key", "SpeciesFormKey");
const EventType = readEnum("event-type", "EventType");
const byValue = table => Object.fromEntries(Object.entries(table).map(([k, v]) => [v, k]));
const typeNameOf = byValue(PokemonType);
/** Resolve "Enum.MEMBER" stubs (and plain numbers) to the enum value. */
function enumValue(v, table, what) {
  if (typeof v === "number") return v;
  const p = pathOf(v);
  const key = p && p.split(".").pop();
  if (key == null || !(key in table)) throw new Error(`unknown ${what}: ${p ?? String(v)}`);
  return table[key];
}

// ---- locales ---------------------------------------------------------------------------------------------------------
const loc = name => readJson(join(LOC, "en", `${name}.json`));
const L = { pokemon: loc("pokemon"), move: loc("move"), ability: loc("ability"), nature: loc("nature") };
const camel = key => key.toLowerCase().split("_").filter(Boolean).map((w, i) => (i ? w[0].toUpperCase() + w.slice(1) : w)).join("");
const title = key => key.toLowerCase().split("_").filter(Boolean).map(w => w[0].toUpperCase() + w.slice(1)).join(" ");
const missingNames = [];
function localized(table, key, fallback) {
  const hit = table[camel(key)] ?? table[key.toLowerCase()];
  if (hit == null) { if (key !== "NONE") missingNames.push(key); return fallback; }
  return typeof hit === "string" ? hit : hit.name;
}

// ---- species ---------------------------------------------------------------------------------------------------------
const REGION = { ALOLA_: "Alolan ", GALAR_: "Galarian ", HISUI_: "Hisuian ", PALDEA_: "Paldean " };
const SPECIAL_NAMES = { BATTLE_BOND_GRENINJA: "Greninja (Battle Bond)", ETERNAL_FLOETTE: "Floette (Eternal)", BLOODMOON_URSALUNA: "Ursaluna (Bloodmoon)" };
const SPECIAL_BASE = { BATTLE_BOND_GRENINJA: "GRENINJA", ETERNAL_FLOETTE: "FLOETTE", BLOODMOON_URSALUNA: "URSALUNA" };
const MEGA = new Set(["mega", "mega-x", "mega-y", "mega-z", "mega-original", "mega-curly", "mega-droopy", "mega-stretchy"]);
const speciesKey = byValue(SpeciesId);
const speciesVars = { SpeciesId, MoveId, AbilityId, PokemonType, SpeciesFormKey, EVOLVE_MOVE: 0, RELEARN_MOVE: -1 };

const rawSpecies = {}; // id -> config object (species chain, starter, evolutions, passives, levelMoves, tms, …)
for (const file of readdirSync(join(SRC, "src/data/balance/species")).filter(f => /^generation-\d+\.ts$/.test(f)).sort()) {
  const js = toScript(read(`src/data/balance/species/${file}`));
  const fn = /function\s+(init\w+)\s*\(/.exec(js)[1];
  const table = evaluate(js, speciesVars, `return ${fn}();`);
  for (const [id, cfg] of Object.entries(table)) rawSpecies[id] = cfg;
}
const baseName = key => {
  if (key in SPECIAL_NAMES) return SPECIAL_NAMES[key];
  const prefix = Object.keys(REGION).find(p => key.startsWith(p));
  const base = localized(L.pokemon, prefix ? key.slice(prefix.length) : key, title(prefix ? key.slice(prefix.length) : key));
  return prefix ? REGION[prefix] + base : base;
};
const formOf = f => {
  const d = f[CHAIN].args[0];
  return { k: d.formKey, n: d.formName, t: [d.type1, d.type2 ?? -1], a: [d.ability1, d.ability2, d.abilityHidden],
    b: [d.baseHp, d.baseAtk, d.baseDef, d.baseSpatk, d.baseSpdef, d.baseSpd] };
};
const flat = lm => lm.flatMap(([lvl, mv]) => [lvl, mv]);

const species = {};
const prevolution = {};
for (const [id, cfg] of Object.entries(rawSpecies)) {
  for (const ev of cfg.evolutions ?? []) {
    const target = ev[CHAIN].args[0].speciesId;
    if (target !== +id && prevolution[target] == null) prevolution[target] = +id;
  }
}
for (const [idStr, cfg] of Object.entries(rawSpecies)) {
  const id = +idStr, d = cfg.species[CHAIN].args[0], key = speciesKey[id];
  const display = baseName(key);
  const gameName = localized(L.pokemon, SPECIAL_BASE[key] ?? key.replace(/^(ALOLA|GALAR|HISUI|PALDEA)_/, ""), title(key));
  const o = { k: key, n: display, t: [d.type1, d.type2 ?? -1], a: [d.ability1, d.ability2, d.abilityHidden], p: cfg.passives,
    b: [d.baseHp, d.baseAtk, d.baseDef, d.baseSpatk, d.baseSpdef, d.baseSpd], s: cfg.starter, cr: d.catchRate };
  if (display !== gameName) o.o = gameName;
  if (cfg.starterCost != null) o.c = cfg.starterCost;
  if (prevolution[id] != null) o.e = prevolution[id];
  const lg = d.mythical ? 3 : d.legendary ? 2 : d.subLegendary ? 1 : 0;
  if (lg) o.lg = lg;
  o.l = flat(cfg.levelMoves);
  if (cfg.formLevelMoves) o.fl = Object.fromEntries(Object.entries(cfg.formLevelMoves).map(([fk, lm]) => [fk, flat(lm)]));
  if (d.forms?.length) o.f = d.forms.map(formOf).map(f => [f.k, f.n, f.t[0], f.t[1], ...f.a, ...f.b]);
  const ev = (cfg.evolutions ?? []).map(e => e[CHAIN].args[0]).filter(e => !MEGA.has(e.evoFormKey) && e.speciesId !== id).map(e => [e.speciesId, e.level]);
  if (ev.length) o.v = ev;
  o._tms = new Set([...(cfg.tms ?? []), ...Object.values(cfg.formTms ?? {}).flat()]);
  species[id] = o;
}

// ---- moves -----------------------------------------------------------------------------------------------------------
const moveKey = byValue(MoveId), abilityKey = byValue(AbilityId);
const CAT = { PHYSICAL: 0, SPECIAL: 1, STATUS: 2 };
const SPREAD_TARGETS = new Set(["ALL_NEAR_ENEMIES", "ALL_NEAR_OTHERS", "ALL_ENEMIES", "ALL", "ALL_OTHERS"]);
const moveSrc = read("src/data/moves/move.ts");
const allMoves = [];
evaluate(toScript(sliceBlock(moveSrc, /^export function initMoves\(\)/m)), { allMoves }, "initMoves();");

const MV = {}; // KEY -> {type, cat, power, acc, prio, target, attrs: [[name, rawArgs]], flags: [[name, rawArgs]]}
for (const m of allMoves) {
  const { cls, calls } = m[CHAIN];
  let args = m[CHAIN].args;
  if (cls !== "AttackMove" && cls !== "ChargingAttackMove" && isRef(args[2])) args = [args[0], args[1], ...args.slice(3)]; // MoveId.NONE passes a category
  const key = pathOf(args[0]).split(".").pop();
  const status = cls === "StatusMove" || cls === "SelfStatusMove" || cls === "ChargingSelfStatusMove";
  // AttackMove(id, type, cat, power, acc, pp, chance, prio, gen); StatusMove(id, type, acc, pp, chance, prio, gen)
  const info = status
    ? { type: pathOf(args[1]), cat: "STATUS", power: null, acc: args[2], prio: args[5], target: cls === "StatusMove" ? "NEAR_OTHER" : "USER" }
    : { type: pathOf(args[1]), cat: pathOf(args[2]).split(".").pop(), power: args[3], acc: args[4], prio: args[7], target: "NEAR_OTHER" };
  info.type = info.type.split(".").pop();
  info.attrs = []; info.flags = [];
  for (const [name, a] of calls) {
    if (name === "attr") info.attrs.push([pathOf(a[0]), a.slice(1).map(raw).join(", ")]);
    else if (name === "target") info.target = pathOf(a[0]).split(".").pop();
    else info.flags.push([name, a.map(raw).join(", ")]);
  }
  MV[key] = info;
}
const moves = {};
for (const [key, info] of Object.entries(MV)) {
  if (!(key in MoveId)) continue;
  moves[MoveId[key]] = [key, localized(L.move, key, title(key)), PokemonType[info.type] ?? 0, CAT[info.cat] ?? 2,
    info.power ?? -1, info.acc ?? -1, info.prio || 0];
}

// ---- abilities -------------------------------------------------------------------------------------------------------
const abSrc = read("src/data/abilities/init-abilities.ts");
const allAbilities = [];
evaluate(toScript(sliceBlock(abSrc, /^export function initAbilities\(\)/m)), { allAbilities }, "initAbilities();");
const AB = {}; // KEY -> {attrs: [[name, rawArgs]], flags: [name]}
for (const a of allAbilities) {
  const { args, calls } = a[CHAIN];
  const key = pathOf(args[0]).split(".").pop();
  const info = { attrs: [], flags: [] };
  for (const [name, x] of calls) {
    if (name === "attr") info.attrs.push([pathOf(x[0]), x.slice(1).map(raw).join(", ")]);
    else if (name !== "build") info.flags.push(name);
  }
  AB[key] = info;
}
const abilities = {};
for (const [key, id] of Object.entries(AbilityId)) {
  const l = L.ability[camel(key)];
  abilities[id] = [key, l ? l.name : title(key), l ? l.description : ""];
}

// ---- derived move and ability sets (the advisor's rule tables) -------------------------------------------------------
const mid = key => MoveId[key];
const mset = pred => Object.entries(MV).filter(([k, v]) => k in MoveId && pred(k, v)).map(([k]) => mid(k)).sort((a, b) => a - b);
const hasAttr = a => (_k, v) => v.attrs.some(([n]) => n === a);
const hasFlag = f => (_k, v) => v.flags.some(([n]) => n === f);
const attrRaw = (a, needle) => (_k, v) => v.attrs.some(([n, r]) => n === a && r.includes(needle));
const tag = t => (_k, v) => v.attrs.some(([n, r]) => n.startsWith("AddBattlerTag") && r.includes(`BattlerTagType.${t}`));
const keys = (...ks) => ks.filter(k => k in MoveId).map(mid).sort((a, b) => a - b);
const union = (...lists) => [...new Set(lists.flat())].sort((a, b) => a - b);

// src/data/moves/invalid-moves.ts noAbilityTypeOverrideMoves: Normalize never converts these
const noOverrideIds = (() => {
  const block = sliceBlock(read("src/data/moves/invalid-moves.ts"), /^export const noAbilityTypeOverrideMoves[^=]*=\s*new Set\(/m, "[", "]");
  return evaluate("", { MoveId }, `return ${block.slice(block.indexOf("["))};`).sort((a, b) => a - b);
})();

const move_sets = {
  multiHit: mset(hasAttr("MultiHitAttr")),
  // self-healing status moves (the healing flag is `healingMove`; older branches called it `triageMove`)
  heal: union(mset((_k, v) => v.cat === "STATUS" && v.flags.some(([n]) => n === "healingMove" || n === "triageMove")), keys("INGRAIN", "AQUA_RING")),
  drain: mset(hasAttr("HitHealAttr")),
  sound: mset(hasFlag("soundBased")),
  reflectable: mset(hasFlag("reflectable")),
  spread: mset((_k, v) => SPREAD_TARGETS.has(v.target) && v.cat !== "STATUS"),
  phaze: mset(attrRaw("ForceSwitchOutAttr", "false")),
  notNormalized: noOverrideIds,
  typeless: mset(hasAttr("TypelessAttr")),
  ignoreAbility: mset(hasFlag("ignoresAbilities")),
  ohko: mset(hasAttr("OneHitKOAttr")),
  exposeGhost: mset(attrRaw("ExposedMoveAttr", "IGNORE_GHOST")),
  ionDeluge: keys("ION_DELUGE", "PLASMA_FISTS"),
  taunt: mset(tag("TAUNT")),
  healBlock: mset(tag("HEAL_BLOCK")),
  encore: mset(tag("ENCORE")),
  disable: mset(tag("DISABLED")),
  torment: mset(tag("TORMENT")),
  imprison: keys("IMPRISON"),
  trap: union(mset(tag("TRAPPED")), keys("FAIRY_LOCK", "OCTOLOCK", "JAW_LOCK", "NO_RETREAT")),
  perish: mset(tag("PERISH_SONG")),
  destinyBond: mset(hasAttr("DestinyBondAttr")),
  abilityChange: mset((_k, v) => v.attrs.some(([n]) => ["SwitchAbilitiesAttr", "AbilityChangeAttr", "AbilityCopyAttr", "AbilityGiveAttr", "SuppressAbilitiesAttr", "SuppressAbilitiesIfActedAttr"].includes(n))),
  sandstorm: mset(attrRaw("WeatherChangeAttr", "SANDSTORM")),
  hail: mset(attrRaw("WeatherChangeAttr", "WeatherType.HAIL")),
  electricTerrain: mset(attrRaw("TerrainChangeAttr", "ELECTRIC")),
  mistyTerrain: mset(attrRaw("TerrainChangeAttr", "MISTY")),
  selfKO: union(mset((_k, v) => v.attrs.some(([n]) => n === "SacrificialAttr" || n === "SacrificialFullRestoreAttr")), keys("MEMENTO", "FINAL_GAMBIT")),
  substitute: mset(hasAttr("AddSubstituteAttr")),
  magicCoat: keys("MAGIC_COAT"),
  safeguard: keys("SAFEGUARD"),
  halfHp: mset(hasAttr("TargetHalfHpDamageAttr")),
  steal: mset(hasAttr("StealHeldItemChanceAttr")),
  itemRemove: mset(hasAttr("RemoveHeldItemAttr")),
  hpSplit: mset(hasAttr("HpSplitAttr")),
};

const aid = key => AbilityId[key];
const aset = pred => Object.entries(AB).filter(([k, v]) => k in AbilityId && pred(k, v)).map(([k]) => aid(k)).sort((a, b) => a - b);
const aAttr = a => (_k, v) => v.attrs.some(([n]) => n === a);
const aFlag = f => (_k, v) => v.flags.includes(f);
const aRaw = (a, needle) => (_k, v) => v.attrs.some(([n, r]) => n === a && r.includes(needle));
const akeys = (...ks) => ks.filter(k => k in AbilityId).map(aid).sort((a, b) => a - b);
const absorb = type => (_k, v) => v.attrs.some(([n, r]) => (n === "TypeImmunityHealAbAttr" || n === "TypeImmunityStatStageChangeAbAttr") && r.includes(`PokemonType.${type}`));

const ability_sets = {
  lure: aset(aAttr("DoubleBattleChanceAbAttr")),
  unreplaceable: aset(aFlag("unreplaceable")),
  unsuppressable: aset(aFlag("unsuppressable")),
  uncopiable: aset(aFlag("uncopiable")),
  ignorable: aset(aFlag("ignorable")),
  noFusion: aset(aAttr("NoFusionAbilityAbAttr")),
  moldBreaker: akeys("MOLD_BREAKER", "TERAVOLT", "TURBOBLAZE"),
  hitGhost: aset(aAttr("IgnoreTypeImmunityAbAttr")),
  magicGuard: aset(aAttr("BlockNonDirectDamageAbAttr")),
  magicBounce: aset(aAttr("ReflectStatusMoveAbAttr")),
  goodAsGold: akeys("GOOD_AS_GOLD"),
  liquidOoze: aset(aAttr("ReverseDrainAbAttr")),
  neutralizingGas: akeys("NEUTRALIZING_GAS"),
  sleepImmune: aset((_k, v) => v.attrs.some(([n, r]) => (n === "StatusEffectImmunityAbAttr" || n === "UserFieldStatusEffectImmunityAbAttr") && (r.includes("SLEEP") || r === "" || r.includes("getNonVolatile")))),
  sturdy: akeys("STURDY"),
  runAway: akeys("RUN_AWAY"),
  trapping: aset(aAttr("ArenaTrapAbAttr")),
  priorityBlock: aset(aAttr("FieldPriorityMoveImmunityAbAttr")),
  sandstorm: aset(aRaw("PostSummonWeatherChangeAbAttr", "SANDSTORM")),
  electricTerrain: aset(aRaw("PostSummonTerrainChangeAbAttr", "ELECTRIC")),
  mistyTerrain: aset(aRaw("PostSummonTerrainChangeAbAttr", "MISTY")),
  psychicTerrain: aset(aRaw("PostSummonTerrainChangeAbAttr", "PSYCHIC")),
  waterAbsorb: aset(absorb("WATER")),
  grassAbsorb: aset(absorb("GRASS")),
  tauntImmune: akeys("OBLIVIOUS", "AROMA_VEIL"),
  aromaVeil: akeys("AROMA_VEIL"),
  parentalBond: aset(aAttr("AddSecondStrikeAbAttr")),
  stickyHold: aset(aAttr("BlockItemTheftAbAttr")),
  noForceSwitch: aset(aAttr("ForceSwitchOutImmunityAbAttr")),
  soundproof: akeys("SOUNDPROOF"),
  contactAbilityChange: aset((_k, v) => v.attrs.some(([n]) => n === "PostDefendAbilityGiveAbAttr" || n === "PostDefendAbilitySwapAbAttr")),
  prankster: akeys("PRANKSTER"),
  frisk: akeys("FRISK"),
  wonderGuard: akeys("WONDER_GUARD"),
};

// ---- TMs the assistant reasons about (full TM tables would triple the file for no use here) ---------------------------
const TM_WHITELIST = ["THIEF", "COVET", "ROAR", "ROCK_SLIDE", "DARKEST_LARIAT", "ENDURE", "PROTECT", "GASTRO_ACID", "CURSE",
  "TAILWIND", "TORMENT", "TAUNT", "SKILL_SWAP", "PSYCHIC_TERRAIN", "MISTY_TERRAIN", "TRICK_ROOM",
  "EXPLOSION", "ICY_WIND", "HELPING_HAND", "DRAGON_TAIL"];
const tmIds = new Set(TM_WHITELIST.map(mid));
function fullTms(id, seen = new Set()) {
  const s = species[id];
  if (!s || seen.has(id)) return new Set();
  seen.add(id);
  const out = new Set(s._tms);
  if (s.e) for (const x of fullTms(s.e, seen)) out.add(x);
  return out;
}
for (const [id, s] of Object.entries(species)) {
  const tms = [...fullTms(+id)].filter(x => tmIds.has(x)).sort((a, b) => a - b);
  if (tms.length) s.tm = tms;
}
for (const s of Object.values(species)) delete s._tms;

// ---- egg moves, END pool, candy costs, timed events ------------------------------------------------------------------
const eggBlock = sliceBlock(read("src/data/balance/moves/egg-moves.ts"), /^export const speciesEggMoves\s*=\s*/m);
const egg = evaluate("", { SpeciesId, MoveId }, `return ${eggBlock.slice(eggBlock.indexOf("{"))};`);

const endBlock = sliceBlock(read("src/data/balance/biomes/end.ts"), /^const pokemonPool[^=]*=\s*/m);
const endPool = evaluate("", { SpeciesId }, `return ${endBlock.slice(endBlock.indexOf("{"))};`);
const tierList = tier => Object.values(endPool[`BiomePoolTier.${tier}`] ?? {}).flat();
const end = { common: tierList("COMMON"), uncommon: tierList("UNCOMMON"), rare: tierList("RARE") };

const candyBlock = sliceBlock(read("src/data/balance/starters.ts"), /^const allStarterCandyCosts[^=]*=\s*/m, "[", "]");
const candy = evaluate("", {}, `return ${candyBlock.slice(candyBlock.indexOf("["))};`).map(c => [c.passive, ...c.costReduction]);

const eventBlock = sliceBlock(read("src/data/balance/timed-events.ts"), /^export const timedEvents[^=]*=\s*/m, "[", "]");
const eventTypeName = byValue(EventType);
const timedEvents = evaluate("", { BiomeId, SpeciesId }, `return ${eventBlock.slice(eventBlock.indexOf("["))};`);
const iso = d => d.toISOString().slice(0, 10);
const events = timedEvents.map(e => {
  const o = { n: e.name, type: eventTypeName[enumValue(e.eventType, EventType, "EventType")] ?? "SHINY", from: iso(e.startDate), to: iso(e.endDate) };
  if (e.shinyEncounterMultiplier) o.shiny = e.shinyEncounterMultiplier;
  if (e.shinyCatchMultiplier) o.shinyCatch = e.shinyCatchMultiplier;
  if (e.extraCatchCandy) o.candy = e.extraCatchCandy;
  if (e.luckBoost) o.luck = e.luckBoost;
  if (e.boostSootheBell) o.soothe = true;
  if (e.boostFusions) o.fusions = true;
  if (e.biomes) o.biomes = Object.fromEntries(Object.entries(e.biomes).map(([b, links]) => [b, links.map(l => (Array.isArray(l) ? l[0] : l))]));
  if (e.eventEncounters?.length) o.sp = e.eventEncounters.map(x => x.species);
  if (e.weather) o.weather = Object.keys(e.weather).map(Number);
  return o;
}).sort((a, b) => (a.from < b.from ? 1 : -1));

// ---- assemble --------------------------------------------------------------------------------------------------------
const natures = Object.keys(Nature).sort((a, b) => Nature[a] - Nature[b]).map(k => localized(L.nature, k, title(k)));
const types = Object.keys(PokemonType).filter(k => PokemonType[k] >= 0).sort((a, b) => PokemonType[a] - PokemonType[b]).map(title);
const biomes = Object.fromEntries(Object.entries(BiomeId).map(([k, v]) => [v, title(k)]));

const out = {
  meta: { version, branch: REF, commit: gameInfo.commit, commitDate: gameInfo.date, extracted: today },
  types, natures,
  sp: species, mv: moves, ab: abilities, egg,
  ms: move_sets, as: ability_sets, end, candy,
  tmList: [...tmIds].sort((a, b) => a - b),
  biomes, events,
};
const text = JSON.stringify(out);

// ---- compare with the committed dataset and report -------------------------------------------------------------------
const OLD = join(ROOT, "data", "game-data.json");
const old = existsSync(OLD) ? readJson(OLD) : null;
const lines = [];
const say = (...a) => lines.push(a.join(" "));
const names = (ids, table) => ids.map(i => table[i]?.[1] ?? table[i]?.n ?? `#${i}`);
const list = (arr, max = VERBOSE ? Infinity : 8) => (arr.length <= max ? arr.join(", ") : arr.slice(0, max).join(", ") + ` … +${arr.length - max}`);
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const diffKeys = (a, b) => {
  const added = Object.keys(b).filter(k => !(k in a)), removed = Object.keys(a).filter(k => !(k in b));
  const changed = Object.keys(b).filter(k => k in a && !same(a[k], b[k]));
  return { added, removed, changed };
};

say(`PokéRogue ${old ? old.meta.version + " → " : ""}${version} (${REF} @ ${gameInfo.commit}, ${gameInfo.date}); ${Object.keys(species).length} species, ${Object.keys(moves).length} moves, ${Object.keys(abilities).length} abilities; ${(text.length / 1024).toFixed(0)} KB`);
if (missingNames.length) say(`  no English name for: ${list(missingNames)}`);
const activeNow = events.filter(e => e.from <= today && today < e.to);
say(`  events: ${events.length} known, active today: ${activeNow.length ? activeNow.map(e => `${e.n} (${e.from} → ${e.to})`).join("; ") : "none"}`);
if (old) {
  for (const [label, key, table] of [["species", "sp", species], ["moves", "mv", moves], ["abilities", "ab", abilities]]) {
    const d = diffKeys(old[key], out[key]);
    if (d.added.length) say(`  ${label} added (${d.added.length}): ${list(names(d.added, table))}`);
    if (d.removed.length) say(`  ${label} removed (${d.removed.length}): ${list(names(d.removed, old[key]))}`);
    if (d.changed.length) say(`  ${label} changed (${d.changed.length}): ${list(names(d.changed, table))}`);
  }
  for (const [label, key, table] of [["ms", "ms", moves], ["as", "as", abilities]]) {
    for (const name of new Set([...Object.keys(old[key]), ...Object.keys(out[key])])) {
      const a = old[key][name] ?? [], b = out[key][name] ?? [];
      const plus = b.filter(x => !a.includes(x)), minus = a.filter(x => !b.includes(x));
      if (plus.length || minus.length) say(`  ${label}.${name}: ${plus.length ? "+" + list(names(plus, table)) : ""}${plus.length && minus.length ? "; " : ""}${minus.length ? "−" + list(names(minus, old[key === "ms" ? "mv" : "ab"])) : ""}`);
    }
  }
  const eggDiff = diffKeys(old.egg, egg);
  const eggChanged = [...eggDiff.added, ...eggDiff.changed];
  if (eggChanged.length || eggDiff.removed.length) say(`  egg moves changed (${eggChanged.length + eggDiff.removed.length}): ${list(names(eggChanged, species))}`);
  for (const key of ["end", "candy", "tmList", "types", "natures", "biomes"]) if (!same(old[key], out[key])) say(`  ${key} changed`);
  const evDiff = diffKeys(Object.fromEntries(old.events?.map(e => [e.n, e]) ?? []), Object.fromEntries(events.map(e => [e.n, e])));
  if (evDiff.added.length) say(`  events added: ${evDiff.added.join(", ")}`);
  if (evDiff.changed.length) say(`  events changed: ${evDiff.changed.join(", ")}`);
}
// sanity checks on the build's own facts, so a parser regression is caught before the page is
const check = (cond, what) => { if (!cond) say(`  !! CHECK FAILED: ${what}`); };
check(species[SpeciesId.REGIGIGAS]?.a.includes(AbilityId.NORMALIZE), "Regigigas has Normalize");
check(ability_sets.lure.includes(AbilityId.ILLUMINATE), "Illuminate is a lure ability");
check(move_sets.spread.includes(MoveId.LANDS_WRATH) && move_sets.spread.includes(MoveId.ROCK_SLIDE), "Land's Wrath and Rock Slide are spread moves");
check(move_sets.steal.includes(MoveId.THIEF), "Thief steals");
check(species[SpeciesId.PUMPKABOO]?.p?.[0] === AbilityId.ILLUMINATE, "Pumpkaboo's passive is Illuminate");
check(moves[MoveId.THIEF]?.[1] === "Thief" && abilities[AbilityId.NORMALIZE]?.[1] === "Normalize", "English names resolve");
check(Object.values(species).every(s => s.l.length % 2 === 0 && s.b.length === 6), "species shapes");
const failed = lines.some(l => l.includes("CHECK FAILED"));

const changed = !old || old.meta.version !== version || !same({ ...old, meta: null }, { ...out, meta: null });
if (!CHECK && !failed) {
  writeFileSync(OUT, text);
  say(changed ? `wrote ${OUT.replace(ROOT, ".").replace(/\\/g, "/")} — rebuild with: node build/build.mjs` : "  no data changes (meta updated)");
} else if (CHECK) {
  say(changed ? "  data differs from the committed file (nothing written)" : "  committed data is current");
}
console.log(lines.join("\n"));
process.exit(failed ? 2 : CHECK && changed ? 1 : 0);
