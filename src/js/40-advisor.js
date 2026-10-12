/* Turns game data + the build + (optionally) a synced save into advice. Pure functions, no DOM. */
NZ.advisor = (function () {
  "use strict";
  var data = NZ.data, kb = NZ.kb;
  var GHOST = 7, GRASS = 11, DARK = 16, WATER = 10, STEEL = 8, ROCK = 5, GROUND = 4;
  var SPD = 5;

  function M(key) { return data.M[key]; }
  function A(key) { return data.A[key]; }
  function S(key) { return data.S[key]; }

  // ---- roster and roles ------------------------------------------------------------------------------------------
  function defaultRoster() {
    var r = {};
    kb.ROLE_ORDER.forEach(function (role) { r[role] = S(kb.roles[role].pick); });
    return r;
  }

  function isLure(abilityId) { return data.aIn("lure", abilityId); }

  /** Lure sources one Pokémon contributes: ability and passive each count, an identical pair counts once. */
  function memberLures(m) {
    if (!m || m.hp <= 0) return [];
    var out = [];
    if (isLure(m.ability)) out.push(m.ability);
    if (m.passiveOn && isLure(m.passive) && m.passive !== m.ability) out.push(m.passive);
    return out;
  }

  /**
   * Match party members to build roles. First by evolution family of the chosen starters, then (for a fused Pokémon
   * whose base is something else) by the fused-in half, then by what the Pokémon's passive suggests.
   */
  function assignRoles(session, roster) {
    var byRole = {}, used = {}, flags = {};
    if (!session) return { byRole: byRole, extras: [], flags: flags };
    var party = session.party;
    function take(role, m, why) { byRole[role] = m; used[m.id] = role; if (why) flags[role] = why; }
    kb.ROLE_ORDER.forEach(function (role) {
      var want = data.root(roster[role]);
      for (var i = 0; i < party.length; i++) {
        if (!used[party[i].id] && data.root(party[i].species) === want) { take(role, party[i]); return; }
      }
    });
    // absorbed halves: the carry inside the partner, the tutor inside the staller
    ["carry", "tutor"].forEach(function (role) {
      if (byRole[role]) return;
      var want = data.root(roster[role]);
      for (var i = 0; i < party.length; i++) {
        var m = party[i];
        if (m.fusion && data.root(m.fusion.id) === want) { flags[role] = { mergedInto: used[m.id] || null, member: m }; return; }
      }
    });
    // fused the wrong way round: the role's family is the fused-in half of an unassigned Pokémon
    ["staller", "runner", "partner", "killer"].forEach(function (role) {
      if (byRole[role]) return;
      var want = data.root(roster[role]);
      for (var i = 0; i < party.length; i++) {
        var m = party[i];
        if (!used[m.id] && m.fusion && data.root(m.fusion.id) === want) { take(role, m, { wrongOrder: true }); return; }
      }
    });
    // last resort: read the role off the passive
    var guess = {
      runner: function (m) { return m.passive === A("RUN_AWAY"); },
      staller: function (m) { return isLure(m.passive); },
      partner: function (m) { return m.passive === A("PSYCHIC_SURGE") || (m.fusion && m.ability === A("NORMALIZE")); },
      killer: function (m) { return m.passive === A("PURIFYING_SALT") || m.passive === A("STURDY"); },
      carry: function (m) { return !m.fusion && data.withAbility(A("NORMALIZE")).some(function (r) { return r.id === m.species; }); }
    };
    ["runner", "staller", "partner", "killer", "carry"].forEach(function (role) {
      if (byRole[role] || (flags[role] && flags[role].mergedInto !== undefined)) return;
      for (var i = 0; i < party.length; i++) {
        if (!used[party[i].id] && guess[role](party[i])) { take(role, party[i], { guessed: true }); return; }
      }
    });
    var extras = party.filter(function (m) { return !used[m.id]; });
    return { byRole: byRole, extras: extras, flags: flags };
  }

  function knows(member, moveKey) { return !!member && member.moves.indexOf(M(moveKey)) !== -1; }

  // ---- party building --------------------------------------------------------------------------------------------
  /** Slot of an ability on a species form, or -1. */
  function abilitySlot(speciesId, formIndex, abilityId) {
    var f = data.form(speciesId, formIndex);
    return f ? f.abilities.indexOf(abilityId) : -1;
  }

  /**
   * Requirement checks for one starter. state: "ok" (the species has it and, when synced, it is unlocked),
   * "locked" (the species has it but your save has not unlocked it), "manual" (the species has it; no save to check),
   * "no" (the species cannot do this), "info" (a note).
   */
  /** Form a role wants from a species: Spiky-eared Pichu and Antique Sinistea carry the Sturdy passive. */
  function roleForm(role, speciesId) {
    var sp = data.sp(speciesId);
    if (role === "killer" && sp && (sp.k === "PICHU" || sp.k === "SINISTEA")) return 1;
    return kb.needs[role].form || 0;
  }

  function starterChecks(role, speciesId, system) {
    var need = kb.needs[role], sp = data.sp(speciesId), out = [];
    if (!sp) return out;
    var st = system && system.starters[data.root(speciesId)];
    var synced = !!system;
    var formIndex = roleForm(role, speciesId);
    function push(id, label, state, detail) { out.push({ id: id, label: label, state: state, detail: detail || "" }); }

    if (synced) push("caught", "In your starter list", st && st.caught ? "ok" : "locked", st && st.caught ? "" : "Not caught yet on this save.");

    if (need.passive || need.passiveSet) {
      var p = data.passive(speciesId, formIndex);
      var fits = need.passiveSet ? data.aIn(need.passiveSet, p) : need.passive.indexOf(data.ab(p).key) !== -1;
      var label = "Passive: " + data.ab(p).name;
      if (!fits) {
        push("passive", label, need.passiveOptional ? "info" : "no",
          need.passiveOptional ? "The usual pick has " + need.passive.map(function (k) { return data.ab(A(k)).name; }).join(" or ") + " here."
            : "This role needs " + (need.passiveSet ? "a lure passive (Illuminate, Arena Trap, No Guard or Commander)" : need.passive.map(function (k) { return data.ab(A(k)).name; }).join(" or ")) + ".");
      } else if (!synced) push("passive", label, "manual", need.passiveWhy + " Unlock it before the run: passives do not unlock mid-run.");
      else {
        // a starter only brings its passive when it is both unlocked and switched on (PassiveAttr.UNLOCKED | ENABLED)
        var unlocked = !!(st && (st.passiveAttr & 1)), enabled = !!(st && (st.passiveAttr & 2));
        push("passive", label, unlocked && enabled ? "ok" : "locked",
          unlocked && enabled ? need.passiveWhy
            : unlocked ? "Unlocked, but switched off. Turn the passive on in starter select before the run."
              : "Not unlocked. Costs " + data.candyCosts(sp.c).passive + " candies (you have " + (st ? st.candy : 0) + ").");
      }
    }

    if (need.ability) {
      var slots = need.ability.map(function (k) { return { key: k, slot: abilitySlot(speciesId, formIndex, A(k)) }; }).filter(function (x) { return x.slot !== -1; });
      if (!slots.length) {
        if (!need.abilityOptional) push("ability", "Ability: " + need.ability.map(function (k) { return data.ab(A(k)).name; }).join(" or "), "no", "This species cannot have it.");
      } else {
        var owned = slots.filter(function (x) { return st && (st.abilityAttr & (1 << x.slot)); });
        var names = slots.map(function (x) { return data.ab(A(x.key)).name + (x.slot === 2 ? " (hidden)" : ""); }).join(" or ");
        if (!synced) push("ability", "Ability: " + names, "manual", need.abilityWhy);
        else if (owned.length) push("ability", "Ability: " + owned.map(function (x) { return data.ab(A(x.key)).name + (x.slot === 2 ? " (hidden)" : ""); }).join(" or "), "ok", need.abilityWhy);
        else push("ability", "Ability: " + names, need.abilityOptional ? "info" : "locked", "Not unlocked on this save. " + need.abilityWhy);
      }
    }

    if (need.speedNature || need.natureNames) {
      var wanted = [];
      for (var n = 0; n < 25; n++) {
        var eff = data.natureEffect(n);
        if (need.speedNature ? (eff && eff.up === SPD) : need.natureNames.indexOf(data.natureName(n)) !== -1) wanted.push(n);
      }
      var preferred = need.speedNature ? wanted.filter(function (n) { var e = data.natureEffect(n); return e.down === 1 || e.down === 3; }) : wanted;
      var nLabel = "Nature: " + (need.speedNature ? "+Speed (Jolly or Timid)" : need.natureNames.join(" or "));
      if (!synced) push("nature", nLabel, "manual", need.natureWhy);
      else {
        var have = wanted.filter(function (n) { return st && (st.natureAttr & (1 << (n + 1))); });
        var havePref = preferred.filter(function (n) { return st && (st.natureAttr & (1 << (n + 1))); });
        if (havePref.length) push("nature", "Nature: " + havePref.map(data.natureName).join(", "), "ok", need.natureWhy);
        else if (have.length) push("nature", "Nature: " + have.map(data.natureName).join(", "), "ok", need.natureWhy + " Jolly or Timid would cost a stat it does not use.");
        else push("nature", nLabel, "locked", "None of these natures is unlocked for it yet. " + need.natureWhy);
      }
    }

    (need.eggMoves || []).forEach(function (em) {
      var slot = data.eggMoves(speciesId).indexOf(M(em.key));
      var label = "Egg move: " + data.mv(M(em.key)).name + (slot === 3 ? " (rare)" : "");
      if (slot === -1) { if (!em.optional) push("egg-" + em.key, label, "no", "Not one of this species' egg moves."); return; }
      if (!synced) push("egg-" + em.key, label, em.optional ? "info" : "manual", em.why);
      else push("egg-" + em.key, label, st && (st.eggMoves & (1 << slot)) ? "ok" : (em.optional ? "info" : "locked"),
        st && (st.eggMoves & (1 << slot)) ? em.why : "Not unlocked on this save. " + em.why);
    });

    (need.levelMoves || []).forEach(function (k) {
      var lvl = data.knowsByLevel(speciesId, formIndex, M(k));
      push("lv-" + k, "Learns " + data.mv(M(k)).name, lvl != null ? "ok" : "no", lvl != null ? "Level " + Math.max(lvl, 1) + ". " + (need.levelWhy || "") : "This species does not learn it. " + (need.levelWhy || ""));
    });

    if (need.tms) {
      var missing = need.tms.filter(function (k) { return !data.canTm(speciesId, M(k)); });
      push("tm", "TMs: " + need.tms.map(function (k) { return data.mv(M(k)).name; }).join(", "), missing.length ? "no" : "ok",
        missing.length ? "Cannot use: " + missing.map(function (k) { return data.mv(M(k)).name; }).join(", ") + "." : need.tmWhy + " Found in shops during the run.");
    }

    if (need.type) {
      var t = data.form(speciesId, formIndex).types;
      var isType = t.indexOf(GHOST) !== -1;
      push("type", "Ghost-type", isType ? "ok" : "info", isType ? need.typeWhy : "Not Ghost-type: it relies on Sturdy alone until it is fused or Terastallized Ghost.");
    }

    if (need.speedIv) {
      if (synced && st && st.ivs.length) push("iv", "Speed IV " + st.ivs[SPD], st.ivs[SPD] >= 31 ? "ok" : "info",
        st.ivs[SPD] >= 31 ? "Carbos stack up to the Speed IV, so 31 is the full stack." : "Carbos stack only up to the Speed IV: this one caps at " + st.ivs[SPD] + ".");
      else push("iv", "Speed IV 31", "manual", "Carbos stack only up to the Speed IV.");
    }

    if (need.keepUnevolved) {
      var changes = (sp.v || []).filter(function (ev) { return data.passive(ev[0], 0) !== data.passive(speciesId, 0); });
      if (changes.length) push("evo", "Never evolve it", "info", changes.map(function (ev) { return data.sp(ev[0]).n + " has " + data.ab(data.passive(ev[0], 0)).name + " instead"; }).join("; ") + ". Pause evolutions in its summary.");
    }
    if (role === "partner" && sp.v) {
      var gains = sp.v.filter(function (ev) { return data.passive(ev[0], 0) === A("PSYCHIC_SURGE") && data.passive(speciesId, 0) !== A("PSYCHIC_SURGE"); });
      if (gains.length) out.forEach(function (c) {
        if (c.id === "passive" && c.state === "no") { c.state = "info"; c.detail = "It gains Psychic Surge when it evolves into " + data.sp(gains[0][0]).n + " (level " + gains[0][1] + ")."; }
      });
    }
    return out;
  }

  /** Starter point budget. reductions: per role, 0-2 candy cost reductions (from the save when synced). */
  function budget(roster, system, manualReductions) {
    var rows = [], total = 0, floor = 0;
    kb.ROLE_ORDER.forEach(function (role) {
      var id = data.root(roster[role]), sp = data.sp(id);
      var base = sp && sp.c ? sp.c : 0;
      var st = system && system.starters[id];
      var red = st ? st.reductions : (manualReductions && manualReductions[role]) || 0;
      var cost = data.reducedCost(base, red);
      total += cost; floor += data.reducedCost(base, 2);
      rows.push({ role: role, id: id, base: base, reductions: red, cost: cost, fromSave: !!st,
        candy: st ? st.candy : null, nextCost: red < 2 && base ? data.candyCosts(base).reductions[red] : null });
    });
    return { rows: rows, total: total, limit: kb.STARTER_POINTS, over: Math.max(0, total - kb.STARTER_POINTS), floor: floor };
  }

  /** Starters that could fill a role, from game data: the guide's named alternatives first, then everything that fits. */
  function alternatives(role) {
    var need = kb.needs[role], out = [], seen = {};
    function add(id, form, note) { var key = id + ":" + form; if (!seen[key] && data.sp(id)) { seen[key] = 1; out.push({ id: id, form: form, note: note || "" }); } }
    add(S(kb.roles[role].pick), need.form || 0, "the guide's pick");
    (need.alternatives || []).forEach(function (k) { add(S(k), roleForm(role, S(k)), "named in the guide"); });
    if (role === "runner") data.startersWithPassive(A("RUN_AWAY")).forEach(function (r) { add(r.id, r.form); });
    if (role === "partner") data.startersWithPassive(A("PSYCHIC_SURGE")).forEach(function (r) { add(r.id, r.form); });
    if (role === "killer") {
      data.startersWithPassive(A("PURIFYING_SALT")).forEach(function (r) { add(r.id, r.form); });
      data.startersWithPassive(A("STURDY")).forEach(function (r) { add(r.id, r.form); });
    }
    if (role === "carry") data.withAbility(A("NORMALIZE")).forEach(function (r) { if (data.sp(r.id).c) add(r.id, r.form); });
    if (role === "tutor") data.eggMoveOwners(M("DARK_VOID")).forEach(function (r) { add(r.id, 0); });
    if (role === "staller") data.set("as", "lure").forEach(function (a) { data.startersWithPassive(a).forEach(function (r) { add(r.id, r.form, data.knowsByLevel(r.id, r.form, M("TRICK_OR_TREAT")) == null ? "no Trick-or-Treat: standard build only" : ""); }); });
    return out;
  }

  // ---- waves -----------------------------------------------------------------------------------------------------
  function waveInfo(wave) {
    var w = Math.max(1, Math.floor(wave || 1));
    var kind = w % 1000 === 0 ? "eternamax" : w % 250 === 0 ? "eternatus" : w % 50 === 0 ? "paradox" : w % 10 === 0 ? "x0" : "normal";
    var forced = kind === "eternamax" || kind === "eternatus" || kind === "paradox";
    var nextForced = forced ? w : (Math.floor(w / 50) + 1) * 50;
    var nf = nextForced % 1000 === 0 ? "eternamax" : nextForced % 250 === 0 ? "eternatus" : "paradox";
    return {
      wave: w, kind: kind, forced: forced, canFlee: !forced, canCatch: !forced,
      bossPassive: kind === "paradox" || kind === "x0",
      nextForced: nextForced, toForced: nextForced - w, nextForcedKind: nf,
      nextX0: w % 10 === 0 ? w : (Math.floor(w / 10) + 1) * 10
    };
  }

  var KIND_LABEL = { normal: "Normal wave", x0: "Boss wave (X0)", paradox: "Forced Paradox boss", eternatus: "Eternatus", eternamax: "Eternamax Eternatus" };
  function kindLabel(kind) { return KIND_LABEL[kind] || kind; }

  /** Chance the wave after `wave` is a double, given `sources` lure sources on the field and in the bag. */
  function doubleChance(nextWave, sources) {
    if (nextWave % 50 === 0) return 0;
    var value = (nextWave % 10 === 0 ? 32 : 8) / Math.pow(4, sources);
    return 1 / Math.max(value, 1);
  }

  /**
   * Lure picture for the next wave. The game rolls before the new battle exists, from the Pokémon on the field at
   * the end of this one: the first slot, or the first two after a double (BattleScene.getDoubleBattleChance).
   */
  function lureStatus(session) {
    var field = [], sources = [], items = [];
    if (session) {
      var slots = session.double ? 2 : 1;
      for (var i = 0; i < Math.min(slots, session.party.length); i++) {
        var m = session.party[i];
        var ls = memberLures(m);
        field.push({ member: m, lures: ls, fainted: m.hp <= 0 });
        ls.forEach(function (a) { sources.push({ from: m.name, ability: a }); });
      }
      session.lures.forEach(function (l) { if (l.left > 0) items.push(l); });
    }
    var count = sources.length + items.length;
    var next = session ? session.wave + 1 : null;
    return {
      field: field, sources: sources, items: items, count: count,
      next: next, nextChance: next ? doubleChance(next, count) : null,
      normalChance: doubleChance(1, count), x0Chance: doubleChance(10, count)
    };
  }

  // ---- shop arithmetic -------------------------------------------------------------------------------------------
  function moneyReward(wave, multiplier) {
    var set = Math.ceil(wave / 10) - 1;
    var v = Math.pow((set + 1 + (0.75 + (((wave - 1) % 10) + 1) / 10)) * 100, 1 + 0.005 * set) * (multiplier || 1);
    return Math.floor(v / 10) * 10;
  }
  function rerollCost(wave, rerollsSoFar, lockedTierValue) {
    return Math.min(Math.ceil(wave / 10) * (lockedTierValue || 250) * Math.pow(2, rerollsSoFar || 0), Number.MAX_SAFE_INTEGER);
  }
  /** How many rerolls in one shop a sum of money pays for. */
  function rerollsAffordable(wave, money, lockedTierValue) {
    var n = 0, spent = 0;
    while (n < 60) {
      var c = rerollCost(wave, n, lockedTierValue);
      if (spent + c > money) break;
      spent += c; n++;
    }
    return n;
  }

  return {
    defaultRoster: defaultRoster, roleForm: roleForm, assignRoles: assignRoles, memberLures: memberLures, isLure: isLure, knows: knows,
    starterChecks: starterChecks, budget: budget, alternatives: alternatives, waveInfo: waveInfo, kindLabel: kindLabel,
    doubleChance: doubleChance, lureStatus: lureStatus, moneyReward: moneyReward, rerollCost: rerollCost,
    rerollsAffordable: rerollsAffordable,
    TYPES: { GHOST: GHOST, GRASS: GRASS, DARK: DARK, WATER: WATER, STEEL: STEEL, ROCK: ROCK, GROUND: GROUND }
  };
})();

/* Speed arithmetic, as Pokemon.calculateStats does it (vitamins scale the base stat, Soul Dew stretches the nature). */
(function () {
  "use strict";
  /** opts: { base, iv, level, carbos, soulDew, nature: 1 | 0 | -1 } */
  function speedStat(opts) {
    var base = Math.floor(opts.base * (1 + (opts.carbos || 0) * 0.1));
    var v = Math.floor((2 * base + (opts.iv == null ? 31 : opts.iv)) * (opts.level || 1) * 0.01) + 5;
    var mult = opts.nature > 0 ? 1.1 : opts.nature < 0 ? 0.9 : 1;
    if (mult !== 1) mult += 0.1 * (opts.soulDew || 0) * (mult > 1 ? 1 : -1);
    if (mult !== 1) v = Math.max(mult > 1 ? Math.ceil(v * mult) : Math.floor(v * mult), 1);
    return Math.max(v, 1);
  }
  /** Lowest level at which the Speed stat reaches `target`. */
  function levelForSpeed(opts, target) {
    var lo = 1, hi = 1;
    var at = function (lvl) { var o = {}; for (var k in opts) o[k] = opts[k]; o.level = lvl; return speedStat(o); };
    while (at(hi) < target && hi < 1e9) hi *= 2;
    while (lo < hi) { var mid = Math.floor((lo + hi) / 2); if (at(mid) >= target) hi = mid; else lo = mid + 1; }
    return lo;
  }
  NZ.advisor.speedStat = speedStat;
  NZ.advisor.levelForSpeed = levelForSpeed;
})();
