/* Game data access. The dataset is extracted from the PokéRogue source (see meta) and embedded at build time. */
NZ.data = (function () {
  "use strict";
  var D = null;
  var M = {}, A = {}, S = {};          // enum key -> id
  var learnerIndex = null;             // moveId -> [{id, lvl}]
  var abilityIndex = null;             // abilityId -> [{id, form, slot}]
  var nameIndex = null;                // [{id, name, lower}]

  var TYPE_COLORS = ["#A8A77A", "#C22E28", "#A98FF3", "#A33EA1", "#E2BF65", "#B6A136", "#A6B91A", "#735797", "#B7B7CE",
    "#EE8130", "#6390F0", "#7AC74C", "#F7D02C", "#F95587", "#96D9D6", "#6F35FC", "#705746", "#D685AD", "#40B5A5"];

  function init(dataset) {
    D = dataset;
    M = {}; A = {}; S = {};
    var k;
    for (k in D.mv) M[D.mv[k][0]] = +k;
    for (k in D.ab) A[D.ab[k][0]] = +k;
    for (k in D.sp) S[D.sp[k].k] = +k;
    api.M = M; api.A = A; api.S = S; api.meta = D.meta;
    learnerIndex = null; abilityIndex = null; nameIndex = null;
  }

  function sp(id) { return D.sp[id] || null; }

  function mv(id) {
    var m = D.mv[id];
    if (!m) return { id: id, key: "UNKNOWN", name: "Move #" + id, type: 0, cat: 2, power: -1, acc: -1, prio: 0 };
    return { id: +id, key: m[0], name: m[1], type: m[2], cat: m[3], power: m[4], acc: m[5], prio: m[6] };
  }

  function ab(id) {
    var a = D.ab[id];
    if (!a) return { id: id, key: "UNKNOWN", name: "Ability #" + id, desc: "" };
    return { id: +id, key: a[0], name: a[1], desc: a[2] };
  }

  function inSet(kind, name, id) {
    var set = D[kind][name];
    return !!set && set.indexOf(+id) !== -1;
  }
  function mIn(name, id) { return inSet("ms", name, id); }
  function aIn(name, id) { return inSet("as", name, id); }

  /** Form record for a species; species without forms answer with their base data for any index. */
  function form(id, formIndex) {
    var s = sp(id);
    if (!s) return null;
    var f = s.f && s.f[formIndex || 0];
    if (!f) return { key: "", name: "", types: s.t, abilities: s.a, stats: s.b };
    return { key: f[0], name: f[1], types: [f[2], f[3]], abilities: [f[4], f[5], f[6]], stats: f.slice(7, 13) };
  }

  function name(id, formIndex) {
    var s = sp(id);
    if (!s) return "Species #" + id;
    var f = s.f && s.f[formIndex || 0];
    if (f && f[0] && f[1] && f[1] !== "Normal") return s.n + " (" + f[1] + ")";
    return s.n;
  }

  /** Ability in a slot (0, 1 or 2 = hidden); an empty slot falls back to the first ability, as the game does. */
  function abilityAt(id, formIndex, slot) {
    var f = form(id, formIndex);
    if (!f) return 0;
    var a = f.abilities[slot == null ? 0 : slot];
    return a || f.abilities[0] || (sp(id).a[0]);
  }

  /** Passive of a species form: per-form table falls back to form 0 (species-data-registry getPassive). */
  function passive(id, formIndex) {
    var s = sp(id);
    if (!s) return 0;
    if (typeof s.p === "number") return s.p;
    var fi = formIndex || 0;
    return s.p[fi] != null ? s.p[fi] : s.p[0];
  }

  function root(id) { var s = sp(id); return s ? s.s : id; }

  /** Pairs [level, moveId] for a species form. Level 0 = learned on evolving, -1 = Memory Mushroom only. */
  function levelMoves(id, formIndex) {
    var s = sp(id);
    if (!s) return [];
    var out = [], i;
    for (i = 0; i < s.l.length; i += 2) out.push([s.l[i], s.l[i + 1]]);
    if (s.fl) {
      var f = form(id, formIndex);
      var extra = s.fl[f.key];
      if (extra) for (i = 0; i < extra.length; i += 2) out.push([extra[i], extra[i + 1]]);
    }
    return out;
  }

  function prevoChain(id) {
    var out = [], s = sp(id), guard = 0;
    while (s && s.e && guard++ < 6) { out.push(s.e); s = sp(s.e); }
    return out;
  }

  function buildLearners() {
    learnerIndex = {};
    for (var id in D.sp) {
      var s = D.sp[id], seen = {};
      var lists = [s.l];
      if (s.fl) for (var fk in s.fl) lists.push(s.fl[fk]);
      for (var li = 0; li < lists.length; li++) {
        var l = lists[li];
        for (var i = 0; i < l.length; i += 2) {
          var lvl = l[i], move = l[i + 1];
          if (seen[move] != null && !(lvl >= 0 && (seen[move] < 0 || lvl < seen[move]))) continue;
          seen[move] = lvl;
        }
      }
      for (var m in seen) (learnerIndex[m] = learnerIndex[m] || []).push({ id: +id, lvl: seen[m] });
    }
  }

  /** Species that have the move in their own level-up list. lvl: lowest level; 0 = on evolving; -1 = relearn only. */
  function learners(moveId) {
    if (!learnerIndex) buildLearners();
    return (learnerIndex[moveId] || []).slice();
  }

  function knowsByLevel(id, formIndex, moveId) {
    var lm = levelMoves(id, formIndex);
    for (var i = 0; i < lm.length; i++) if (lm[i][1] === moveId) return lm[i][0];
    return null;
  }

  /** Can a Pokémon of this species relearn the move with a Memory Mushroom (own or pre-evolution level list)? */
  function canRelearn(id, formIndex, moveId) {
    if (knowsByLevel(id, formIndex, moveId) != null) return true;
    var chain = prevoChain(id);
    for (var i = 0; i < chain.length; i++) if (knowsByLevel(chain[i], 0, moveId) != null) return true;
    return false;
  }

  function buildAbilityIndex() {
    abilityIndex = {};
    function add(abilityId, rec) { if (abilityId) (abilityIndex[abilityId] = abilityIndex[abilityId] || []).push(rec); }
    for (var id in D.sp) {
      var s = D.sp[id];
      var forms = s.f ? s.f.length : 1;
      for (var fi = 0; fi < forms; fi++) {
        var f = form(+id, fi), seen = {};
        for (var slot = 0; slot < 3; slot++) {
          var a = f.abilities[slot];
          if (!a || seen[a] != null) continue;
          seen[a] = slot;
          add(a, { id: +id, form: fi, slot: slot });
        }
      }
    }
  }

  /** Species forms that can have the ability, with the slot it sits in (2 = hidden ability). */
  function withAbility(abilityId) {
    if (!abilityIndex) buildAbilityIndex();
    return (abilityIndex[abilityId] || []).slice();
  }

  function startersWithPassive(abilityId) {
    var out = [];
    for (var id in D.sp) {
      var s = D.sp[id];
      if (!s.c) continue;
      if (typeof s.p === "number") { if (s.p === abilityId) out.push({ id: +id, form: 0 }); continue; }
      for (var fi in s.p) if (s.p[fi] === abilityId) out.push({ id: +id, form: +fi });
    }
    return out;
  }

  function eggMoves(id) { return D.egg[root(id)] || []; }

  function eggMoveOwners(moveId) {
    var out = [];
    for (var id in D.egg) {
      var slot = D.egg[id].indexOf(moveId);
      if (slot !== -1) out.push({ id: +id, slot: slot });
    }
    return out;
  }

  function canTm(id, moveId) { var s = sp(id); return !!(s && s.tm && s.tm.indexOf(moveId) !== -1); }

  /**
   * Typing of a (possibly fused) Pokémon, as Pokemon.getBaseTypes resolves it: the first type comes from the base
   * species; the second is the partner's second type, else the partner's first type, when that differs from the first.
   */
  function fusedTypes(baseTypes, partnerTypes) {
    var first = baseTypes[0];
    var second = baseTypes[1] >= 0 ? baseTypes[1] : -1;
    if (partnerTypes) {
      var p1 = partnerTypes[0], p2 = partnerTypes[1] >= 0 ? partnerTypes[1] : -1;
      if (p2 !== -1 && p2 !== first) second = p2;
      else if (p1 !== first) second = p1;
    }
    return second === -1 || second === first ? [first] : [first, second];
  }

  /**
   * What a fusion ends up with. `base` keeps its passive and nature and gives the first type;
   * `partner` gives the ability. Base stats are averaged and rounded up (Pokemon.calculateBaseStats).
   */
  function fuse(base, partner) {
    var bf = form(base.id, base.form), pf = form(partner.id, partner.form);
    var stats = [];
    for (var i = 0; i < 6; i++) stats.push(Math.ceil((bf.stats[i] + pf.stats[i]) / 2));
    return {
      types: fusedTypes(bf.types, pf.types),
      ability: abilityAt(partner.id, partner.form, partner.slot),
      passive: passive(base.id, base.form),
      stats: stats
    };
  }

  function buildNames() {
    nameIndex = [];
    for (var id in D.sp) nameIndex.push({ id: +id, name: D.sp[id].n, lower: D.sp[id].n.toLowerCase() });
    nameIndex.sort(function (a, b) { return a.name < b.name ? -1 : a.name > b.name ? 1 : 0; });
  }

  /** Name search for the scout box: prefix matches first, then substring matches. */
  function search(query, limit) {
    if (!nameIndex) buildNames();
    var q = String(query || "").trim().toLowerCase();
    if (!q) return [];
    var pre = [], sub = [];
    for (var i = 0; i < nameIndex.length; i++) {
      var pos = nameIndex[i].lower.indexOf(q);
      if (pos === 0) pre.push(nameIndex[i]);
      else if (pos > 0) sub.push(nameIndex[i]);
    }
    return pre.concat(sub).slice(0, limit || 12);
  }

  function findByName(text) {
    if (!nameIndex) buildNames();
    var q = String(text || "").trim().toLowerCase();
    for (var i = 0; i < nameIndex.length; i++) if (nameIndex[i].lower === q) return nameIndex[i].id;
    return null;
  }

  function typeName(t) { return t >= 0 && D.types[t] ? D.types[t] : "—"; }
  function typeColor(t) { return TYPE_COLORS[t] || "#888888"; }
  function natureName(n) { return D.natures[n] || "?"; }

  /** Stat a nature raises / lowers, as indexes into [HP, Atk, Def, SpAtk, SpDef, Spd]; null for neutral natures. */
  function natureEffect(n) {
    var order = [1, 2, 5, 3, 4];
    var up = order[Math.floor(n / 5)], down = order[n % 5];
    return up === down ? null : { up: up, down: down };
  }

  function candyCosts(starterCost) {
    var row = D.candy[clampCost(starterCost) - 1];
    return { passive: row[0], reductions: [row[1], row[2]] };
  }
  function clampCost(c) { return Math.max(1, Math.min(10, c || 1)); }

  /** Starter cost after candy reductions: -1 per step while above 1, then halved (GameData.getSpeciesStarterValue). */
  function reducedCost(baseCost, reductions) {
    var c = baseCost;
    for (var i = 0; i < (reductions || 0); i++) c = c > 1 ? c - 1 : c / 2;
    return c;
  }

  function endPool() { return D.end; }
  function allSpeciesIds() { return Object.keys(D.sp).map(Number); }
  function set(kind, name) { return (D[kind][name] || []).slice(); }
  function biomeName(id) { return D.biomes[id] || "Biome " + id; }

  var api = {
    init: init, sp: sp, mv: mv, ab: ab, mIn: mIn, aIn: aIn, form: form, name: name, abilityAt: abilityAt, passive: passive,
    root: root, levelMoves: levelMoves, prevoChain: prevoChain, learners: learners, knowsByLevel: knowsByLevel,
    canRelearn: canRelearn, withAbility: withAbility, startersWithPassive: startersWithPassive, eggMoves: eggMoves,
    eggMoveOwners: eggMoveOwners, canTm: canTm, fusedTypes: fusedTypes, fuse: fuse, search: search, findByName: findByName,
    typeName: typeName, typeColor: typeColor, natureName: natureName, natureEffect: natureEffect, candyCosts: candyCosts,
    reducedCost: reducedCost, endPool: endPool, allSpeciesIds: allSpeciesIds, set: set, biomeName: biomeName,
    M: M, A: A, S: S, meta: null
  };
  return api;
})();

/* Names as the game prints them, including its fusion-name blend (ported from src/utils/pokemon-utils.ts). */
(function () {
  "use strict";
  var data = NZ.data;

  /** Species name with the battle-form template the game applies (Mega X, Primal X, G-Max X, E-Max X). */
  function gameName(id, formIndex) {
    var s = data.sp(id);
    if (!s) return "Species #" + id;
    var base = s.o || s.n;
    if (s.k === "BATTLE_BOND_GRENINJA" || s.k === "ETERNAL_FLOETTE" || s.k === "BLOODMOON_URSALUNA") base = base.replace(/ \(.*\)$/, "");
    var f = data.form(id, formIndex);
    var key = f ? f.key : "";
    switch (key) {
      case "mega": case "mega-original": case "mega-curly": case "mega-droopy": case "mega-stretchy": return "Mega " + base;
      case "mega-x": return "Mega " + base + " X";
      case "mega-y": return "Mega " + base + " Y";
      case "mega-z": return "Mega " + base + " Z";
      case "primal": return "Primal " + base;
      case "eternamax": return "E-Max " + base;
    }
    if (key.indexOf("gigantamax") !== -1) return "G-Max " + base;
    return base;
  }

  function fusedName(speciesAName, speciesBName) {
    var fragAPattern = /([a-z]{2}.*?[aeiou(?:y$)\-']+)(.*?)$/i;
    var fragBPattern = /([a-z]{2}.*?[aeiou(?:y$)\-'])(.*?)$/i;
    var pa = /^(?:[^ ]+) /.exec(speciesAName), pb = /^(?:[^ ]+) /.exec(speciesBName);
    var prefixA = pa ? pa[0] : "", prefixB = pb ? pb[0] : "";
    if (prefixA) speciesAName = speciesAName.slice(prefixA.length);
    if (prefixB) speciesBName = speciesBName.slice(prefixB.length);
    var sa = / (?:[^ ]+)$/.exec(speciesAName), sb = / (?:[^ ]+)$/.exec(speciesBName);
    var suffixA = sa ? sa[0] : "", suffixB = sb ? sb[0] : "";
    if (suffixA) speciesAName = speciesAName.slice(0, -suffixA.length);
    if (suffixB) speciesBName = speciesBName.slice(0, -suffixB.length);
    var splitA = speciesAName.split(/ /g), splitB = speciesBName.split(/ /g);
    var fragAMatch = fragAPattern.exec(speciesAName), fragBMatch = fragBPattern.exec(speciesBName);
    var fragA = splitA.length === 1 ? (fragAMatch ? fragAMatch[1] : speciesAName) : splitA[splitA.length - 1];
    var fragB;
    if (splitB.length === 1) {
      if (fragBMatch) {
        var lastCharA = fragA.slice(fragA.length - 1);
        var prevCharB = fragBMatch[1].slice(fragBMatch.length - 1);
        fragB = (/[-']/.test(prevCharB) ? prevCharB : "") + fragBMatch[2] || prevCharB;
        if (lastCharA === fragB[0]) {
          if (/[aiu]/.test(lastCharA)) {
            fragB = fragB.slice(1);
          } else {
            var newCharMatch = new RegExp("[^" + lastCharA + "]").exec(fragB);
            if (newCharMatch && newCharMatch.index !== undefined && newCharMatch.index > 0) fragB = fragB.slice(newCharMatch.index);
          }
        }
      } else {
        fragB = speciesBName;
      }
    } else {
      fragB = splitB[splitB.length - 1];
    }
    if (splitA.length > 1) fragA = splitA.slice(0, splitA.length - 1).join(" ") + " " + fragA;
    fragB = fragB.slice(0, 1).toLowerCase() + fragB.slice(1);
    if (fragA === "Rapi") {
      fragA = "Rapid";
      if (fragB === "ng") fragB = speciesBName.slice(speciesBName.length - 3);
    }
    return (prefixA || prefixB) + fragA + fragB + (suffixB || suffixA);
  }

  /**
   * Name to show for a Pokémon. Fusions use the game's own blend, so they read exactly as on screen.
   * Unfused regional forms keep their prefix ("Galarian Weezing"), which the game leaves out.
   */
  function pokemonName(id, formIndex, fusionId, fusionFormIndex) {
    if (fusionId) return fusedName(gameName(id, formIndex), gameName(fusionId, fusionFormIndex));
    var s = data.sp(id), plain = gameName(id, formIndex);
    if (s && s.o && s.n !== s.o && s.n.indexOf(s.o) > 0) return plain.replace(s.o, s.n);
    return plain;
  }

  data.gameName = gameName;
  data.fusedName = fusedName;
  data.pokemonName = pokemonName;
})();
