#!/usr/bin/env python3
"""Turn the raw extraction of the live game branch into the compact dataset the assistant embeds.

Input : data/raw-species-main.json, data/raw-moves-abilities-main.json (see extract/run.sh)
Output: data/game-data.json
"""
import json, re, sys

import os
ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..")
raw = json.load(open(f"{ROOT}/data/raw-species-main.json"))
ma = json.load(open(f"{ROOT}/data/raw-moves-abilities-main.json"))
S, MN, AN = raw["species"], raw["moveNames"], raw["abilityNames"]
MV, AB = ma["moves"], ma["abilities"]
mid = {v["k"]: int(k) for k, v in MN.items()}
aid = {v["k"]: int(k) for k, v in AN.items()}
tid = {v: int(k) for k, v in raw["enums"]["PokemonType"].items()}

REGION = {"ALOLA_": "Alolan ", "GALAR_": "Galarian ", "HISUI_": "Hisuian ", "PALDEA_": "Paldean "}
SPECIAL_NAMES = {"BATTLE_BOND_GRENINJA": "Greninja (Battle Bond)", "ETERNAL_FLOETTE": "Floette (Eternal)", "BLOODMOON_URSALUNA": "Ursaluna (Bloodmoon)"}

def display_name(e):
    k = e["k"]
    if k in SPECIAL_NAMES:
        return SPECIAL_NAMES[k]
    for p, label in REGION.items():
        if k.startswith(p):
            return label + e["n"]
    return e["n"]

MEGA = {"mega", "mega-x", "mega-y", "mega-z", "mega-original", "mega-curly", "mega-droopy", "mega-stretchy"}

# TM moves the assistant reasons about (full TM tables would triple the file for no use here)
TM_WHITELIST = ["THIEF", "COVET", "ROAR", "ROCK_SLIDE", "DARKEST_LARIAT", "ENDURE", "PROTECT", "GASTRO_ACID", "CURSE",
                "TAILWIND", "TORMENT", "TAUNT", "SKILL_SWAP", "PSYCHIC_TERRAIN", "MISTY_TERRAIN", "TRICK_ROOM",
                "EXPLOSION", "ICY_WIND", "HELPING_HAND", "DRAGON_TAIL"]
tm_ids = {mid[k] for k in TM_WHITELIST}

def full_tms(sid, seen=None):
    s = S[str(sid)]
    out = set(s["tm"])
    for fl in (s.get("ftm") or {}).values():
        out |= set(fl)
    if s.get("pre"):
        out |= full_tms(s["pre"])
    return out

species = {}
for k, e in S.items():
    o = {"k": e["k"], "n": display_name(e), "t": e["t"], "a": e["a"], "p": e["p"], "b": e["bs"], "s": e["st"], "cr": e["cr"]}
    if o["n"] != e["n"]:
        o["o"] = e["n"]  # name as the game prints it (regional forms share the base name)
    if isinstance(o["p"], dict):
        o["p"] = {int(fi): v for fi, v in o["p"].items()}
    if e.get("sc"):
        o["c"] = e["sc"]
    if e.get("pre"):
        o["e"] = e["pre"]
    lg = 3 if e.get("my") else 2 if e.get("lg") else 1 if e.get("sl") else 0
    if lg:
        o["lg"] = lg
    o["l"] = [x for pair in e["lm"] for x in pair]
    if e.get("flm"):
        o["fl"] = {fk: [x for pair in fl for x in pair] for fk, fl in e["flm"].items()}
    if e.get("f"):
        o["f"] = [[f["k"], f["n"], f["t"][0], f["t"][1], *f["a"], *f["bs"]] for f in e["f"]]
    ev = [[x["s"], x["l"]] for x in e.get("ev", []) if not (x.get("ef") in MEGA) and x["s"] != int(k)]
    if ev:
        o["v"] = ev
    tms = sorted(full_tms(int(k)) & tm_ids)
    if tms:
        o["tm"] = tms
    species[int(k)] = o

CAT = {"PHYSICAL": 0, "SPECIAL": 1, "STATUS": 2}
moves = {}
for k, name in MN.items():
    key = name["k"]
    info = MV.get(key)
    if not info:
        continue
    moves[int(k)] = [key, name["n"], tid.get(info["type"], 0), CAT.get(info["cat"], 2),
                     info["power"] if info["power"] is not None else -1,
                     info["acc"] if info["acc"] is not None else -1,
                     info["prio"] or 0]

abilities = {}
for k, name in AN.items():
    abilities[int(k)] = [name["k"], name["n"], name.get("d") or ""]

def mset(pred):
    return sorted(mid[k] for k, v in MV.items() if k in mid and pred(k, v))
def has_attr(a):
    return lambda k, v: a in v["attrs"]
def has_flag(f):
    return lambda k, v: any(x.split("(")[0] == f for x in v["flags"])
def attr_raw(a, needle):
    return lambda k, v: any(x == a and needle in r for x, r in zip(v["attrs"], v["attrRaw"]))
def tag(t):
    return lambda k, v: any(x.startswith("AddBattlerTag") and f"BattlerTagType.{t}" in r for x, r in zip(v["attrs"], v["attrRaw"]))
def keys(*ks):
    return sorted(mid[k] for k in ks if k in mid)

SPREAD_TARGETS = {"ALL_NEAR_ENEMIES", "ALL_NEAR_OTHERS", "ALL_ENEMIES", "ALL", "ALL_OTHERS"}
move_sets = {
    "multiHit": mset(lambda k, v: "MultiHitAttr" in v["attrs"]),
    # self-healing status moves (flag is triageMove on the live branch, healingMove on beta)
    "heal": sorted(set(mset(lambda k, v: v["cat"] == "STATUS" and any(x.split("(")[0] in ("triageMove", "healingMove") for x in v["flags"]))) | set(keys("INGRAIN", "AQUA_RING"))),
    "drain": mset(lambda k, v: "HitHealAttr" in v["attrs"]),
    "sound": mset(has_flag("soundBased")),
    "reflectable": mset(has_flag("reflectable")),
    "spread": mset(lambda k, v: v["target"] in SPREAD_TARGETS and v["cat"] != "STATUS"),
    "phaze": mset(attr_raw("ForceSwitchOutAttr", "false")),
    # src/data/moves/invalid-moves.ts noAbilityTypeOverrideMoves: Normalize never converts these
    "notNormalized": keys("WEATHER_BALL", "JUDGMENT", "REVELATION_DANCE", "MULTI_ATTACK", "TERRAIN_PULSE", "NATURAL_GIFT", "TECHNO_BLAST", "HIDDEN_POWER"),
    "typeless": mset(has_attr("TypelessAttr")),
    "ignoreAbility": mset(has_flag("ignoresAbilities")),
    "ohko": mset(has_attr("OneHitKOAttr")),
    "exposeGhost": mset(attr_raw("ExposedMoveAttr", "IGNORE_GHOST")),
    "ionDeluge": keys("ION_DELUGE", "PLASMA_FISTS"),
    "taunt": mset(tag("TAUNT")),
    "healBlock": mset(tag("HEAL_BLOCK")),
    "encore": mset(tag("ENCORE")),
    "disable": mset(tag("DISABLED")),
    "torment": mset(tag("TORMENT")),
    "imprison": keys("IMPRISON"),
    "trap": mset(tag("TRAPPED")) + keys("FAIRY_LOCK", "OCTOLOCK", "JAW_LOCK", "NO_RETREAT"),
    "perish": mset(tag("PERISH_SONG")),
    "destinyBond": mset(has_attr("DestinyBondAttr")),
    "abilityChange": mset(lambda k, v: any(a in v["attrs"] for a in ("SwitchAbilitiesAttr", "AbilityChangeAttr", "AbilityCopyAttr", "AbilityGiveAttr", "SuppressAbilitiesAttr", "SuppressAbilitiesIfActedAttr"))),
    "sandstorm": mset(attr_raw("WeatherChangeAttr", "SANDSTORM")),
    "hail": mset(attr_raw("WeatherChangeAttr", "WeatherType.HAIL")),
    "electricTerrain": mset(attr_raw("TerrainChangeAttr", "ELECTRIC")),
    "mistyTerrain": mset(attr_raw("TerrainChangeAttr", "MISTY")),
    "selfKO": mset(lambda k, v: "SacrificialAttr" in v["attrs"] or "SacrificialFullRestoreAttr" in v["attrs"]) + keys("MEMENTO", "FINAL_GAMBIT"),
    "substitute": mset(has_attr("AddSubstituteAttr")),
    "magicCoat": keys("MAGIC_COAT"),
    "safeguard": keys("SAFEGUARD"),
    "halfHp": mset(has_attr("TargetHalfHpDamageAttr")),
    "steal": mset(has_attr("StealHeldItemChanceAttr")),
    "itemRemove": mset(has_attr("RemoveHeldItemAttr")),
    "hpSplit": mset(has_attr("HpSplitAttr")),
}

def aset(pred):
    return sorted(aid[k] for k, v in AB.items() if k in aid and pred(k, v))
def a_attr(a):
    return lambda k, v: a in v["attrs"]
def a_flag(f):
    return lambda k, v: f in v["flags"]
def a_raw(a, needle):
    return lambda k, v: any(x == a and needle in r for x, r in zip(v["attrs"], v["attrRaw"]))
def akeys(*ks):
    return sorted(aid[k] for k in ks if k in aid)

ability_sets = {
    "lure": aset(a_attr("DoubleBattleChanceAbAttr")),
    "unreplaceable": aset(a_flag("unreplaceable")),
    "unsuppressable": aset(a_flag("unsuppressable")),
    "uncopiable": aset(a_flag("uncopiable")),
    "ignorable": aset(a_flag("ignorable")),
    "noFusion": aset(a_attr("NoFusionAbilityAbAttr")),
    "moldBreaker": akeys("MOLD_BREAKER", "TERAVOLT", "TURBOBLAZE"),
    "hitGhost": aset(a_attr("IgnoreTypeImmunityAbAttr")),
    "magicGuard": aset(a_attr("BlockNonDirectDamageAbAttr")),
    "magicBounce": aset(a_attr("ReflectStatusMoveAbAttr")),
    "goodAsGold": akeys("GOOD_AS_GOLD"),
    "liquidOoze": aset(a_attr("ReverseDrainAbAttr")),
    "neutralizingGas": akeys("NEUTRALIZING_GAS"),
    "sleepImmune": aset(lambda k, v: any((x in ("StatusEffectImmunityAbAttr", "UserFieldStatusEffectImmunityAbAttr")) and ("SLEEP" in r or r in ("StatusEffectImmunityAbAttr",) or "getNonVolatile" in r) for x, r in zip(v["attrs"], v["attrRaw"]))),
    "sturdy": akeys("STURDY"),
    "runAway": akeys("RUN_AWAY"),
    "trapping": aset(a_attr("ArenaTrapAbAttr")),
    "priorityBlock": aset(a_attr("FieldPriorityMoveImmunityAbAttr")),
    "sandstorm": aset(a_raw("PostSummonWeatherChangeAbAttr", "SANDSTORM")),
    "electricTerrain": aset(a_raw("PostSummonTerrainChangeAbAttr", "ELECTRIC")),
    "mistyTerrain": aset(a_raw("PostSummonTerrainChangeAbAttr", "MISTY")),
    "psychicTerrain": aset(a_raw("PostSummonTerrainChangeAbAttr", "PSYCHIC")),
    "waterAbsorb": aset(lambda k, v: any(x in ("TypeImmunityHealAbAttr", "TypeImmunityStatStageChangeAbAttr") and "PokemonType.WATER" in r for x, r in zip(v["attrs"], v["attrRaw"]))),
    "grassAbsorb": aset(lambda k, v: any(x in ("TypeImmunityHealAbAttr", "TypeImmunityStatStageChangeAbAttr") and "PokemonType.GRASS" in r for x, r in zip(v["attrs"], v["attrRaw"]))),
    "tauntImmune": akeys("OBLIVIOUS", "AROMA_VEIL"),
    "aromaVeil": akeys("AROMA_VEIL"),
    "parentalBond": aset(a_attr("AddSecondStrikeAbAttr")),
    "stickyHold": aset(a_attr("BlockItemTheftAbAttr")),
    "noForceSwitch": aset(a_attr("ForceSwitchOutImmunityAbAttr")),
    "soundproof": akeys("SOUNDPROOF"),
    "contactAbilityChange": aset(lambda k, v: "PostDefendAbilityGiveAbAttr" in v["attrs"] or "PostDefendAbilitySwapAbAttr" in v["attrs"]),
    "prankster": akeys("PRANKSTER"),
    "frisk": akeys("FRISK"),
    "wonderGuard": akeys("WONDER_GUARD"),
}

# END biome pool = Endless forced bosses (src/data/balance/biomes/end.ts)
sid = {v["k"]: k for k, v in species.items()}
end_pool = {
    "common": ["GREAT_TUSK", "SCREAM_TAIL", "BRUTE_BONNET", "FLUTTER_MANE", "SLITHER_WING", "SANDY_SHOCKS", "IRON_TREADS", "IRON_BUNDLE", "IRON_HANDS", "IRON_JUGULIS", "IRON_MOTH", "IRON_THORNS"],
    "uncommon": ["ROARING_MOON", "IRON_VALIANT"],
    "rare": ["WALKING_WAKE", "IRON_LEAVES", "GOUGING_FIRE", "RAGING_BOLT", "IRON_BOULDER", "IRON_CROWN"],
}
end_pool = {tier: [sid[k] for k in ks] for tier, ks in end_pool.items()}

natures = [raw["natures"][str(i)]["n"] for i in range(25)]

# candy costs by base starter cost (src/data/balance/starters.ts allStarterCandyCosts)
candy = [[40, 25, 60], [40, 25, 60], [35, 20, 50], [30, 15, 40], [25, 12, 35], [20, 10, 30], [15, 8, 20], [10, 5, 15], [10, 5, 15], [10, 5, 15]]

types = [raw["enums"]["PokemonType"][str(i)].title() for i in range(19)]

out = {
    "meta": {"version": "1.12.0.11", "branch": "main", "commit": "e4e9b53", "commitDate": "2026-08-23", "extracted": "2026-10-11"},
    "types": types,
    "natures": natures,
    "sp": species,
    "mv": moves,
    "ab": abilities,
    "egg": {int(k): v for k, v in raw["eggMoves"].items()},
    "ms": move_sets,
    "as": ability_sets,
    "end": end_pool,
    "candy": candy,
    "tmList": sorted(tm_ids),
    "biomes": {int(k): v.replace("_", " ").title() for k, v in raw["enums"]["BiomeId"].items()},
}
txt = json.dumps(out, separators=(",", ":"), ensure_ascii=False)
open(f"{ROOT}/data/game-data.json", "w", encoding="utf8").write(txt)
print("bytes", len(txt.encode("utf8")), "species", len(species), "moves", len(moves), "abilities", len(abilities))
for k, v in move_sets.items():
    print(f"  ms.{k} ({len(v)}):", ", ".join(moves[i][1] for i in v[:14]) + (" …" if len(v) > 14 else ""))
for k, v in ability_sets.items():
    print(f"  as.{k} ({len(v)}):", ", ".join(abilities[i][1] for i in v[:16]) + (" …" if len(v) > 16 else ""))
