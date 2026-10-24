/* Advice engine, part 3: what the Pokémon in front of you mean for the build. */
(function () {
  "use strict";
  var data = NZ.data, kb = NZ.kb, adv = NZ.advisor;
  var T = adv.TYPES;
  function M(key) { return data.M[key]; }
  function A(key) { return data.A[key]; }
  function names(ids, fn) { return NZ.util.uniq(ids.map(function (i) { return fn(i).name; })).join(", "); }
  function moveNames(ids) { return names(ids, data.mv); }

  /**
   * What is known about a wild Pokémon. With `exact` (the save was read with "hidden details" on) the ability and
   * moves are the real ones; otherwise they are the possibilities from the species' data.
   */
  function describe(subject, exact) {
    var id = subject.species, form = subject.form || 0, fusion = subject.fusion || null;
    var baseForm = data.form(id, form);
    if (!baseForm) return null;
    var fusionForm = fusion ? data.form(fusion.id, fusion.form) : null;
    var types = subject.types && subject.types.length ? subject.types : data.fusedTypes(baseForm.types, fusionForm ? fusionForm.types : null);
    var abilitySource = fusionForm ? fusionForm : baseForm;
    var possible = NZ.util.uniq(abilitySource.abilities.filter(function (a) { return a; }));
    var hiddenAbility = abilitySource.abilities[2] && abilitySource.abilities[2] !== abilitySource.abilities[0] && abilitySource.abilities[2] !== abilitySource.abilities[1] ? abilitySource.abilities[2] : 0;
    var level = subject.level || 100000;
    var pool = [];
    function addPool(sid, f) {
      data.levelMoves(sid, f).forEach(function (lm) { if (lm[0] >= 0 && lm[0] <= level && pool.indexOf(lm[1]) === -1) pool.push(lm[1]); });
    }
    addPool(id, form);
    if (fusion) addPool(fusion.id, fusion.form);
    var passiveId = subject.passive != null && exact ? subject.passive : data.passive(id, form);
    return {
      id: id, form: form, fusion: fusion,
      name: subject.name || data.pokemonName(id, form, fusion ? fusion.id : 0, fusion ? fusion.form : 0),
      types: types, level: subject.level || 0, boss: !!subject.boss, shiny: !!subject.shiny,
      exact: !!exact,
      abilities: exact && subject.ability ? [subject.ability] : possible,
      hiddenAbility: hiddenAbility,
      passive: passiveId, passiveOn: !!subject.passiveOn,
      moves: exact && subject.moves && subject.moves.length ? subject.moves.slice() : pool,
      speed: exact && subject.stats && subject.stats.length ? subject.stats[5] : null,
      baseSpeed: fusionForm ? Math.ceil((baseForm.stats[5] + fusionForm.stats[5]) / 2) : baseForm.stats[5],
      items: subject.items || {}
    };
  }

  function abilityHas(desc, setName) { return desc.abilities.filter(function (a) { return data.aIn(setName, a); }); }
  function passiveHas(desc, setName) { return desc.passiveOn && data.aIn(setName, desc.passive); }
  function movesIn(desc, setName) { return desc.moves.filter(function (m) { return data.mIn(setName, m); }); }
  function may(desc) { return desc.exact ? "" : "may have "; }
  function mayKnow(desc) { return desc.exact ? "knows" : "can know"; }
  function an(desc, a) {
    var hidden = !desc.exact && a === desc.hiddenAbility ? " (its hidden ability)" : "";
    return data.ab(a).name + hidden;
  }

  /**
   * Notes for fighting this Pokémon with the Normalize line (forced bosses, or an X0 boss you stay for).
   * killerTypes: typing of your boss killer, to judge sandstorm.
   */
  function bossNotes(desc, opts) {
    opts = opts || {};
    var notes = [], line = "standard";
    function add(sev, title, text) { notes.push({ sev: sev, title: title, text: text }); }

    // --- can Normalize be given, and does it protect you?
    var blockers = abilityHas(desc, "unreplaceable");
    var already = desc.abilities.indexOf(A("NORMALIZE")) !== -1;
    var scrappyPassive = passiveHas(desc, "hitGhost");
    var scrappyAbility = abilityHas(desc, "hitGhost");
    if (blockers.length) {
      var sure = desc.exact || blockers.length === desc.abilities.length;
      add(sure ? "danger" : "care", "Entrainment " + (sure ? "fails" : "may fail"),
        (sure ? "" : "If it has ") + names(blockers, data.ab) + (sure ? " cannot be replaced" : ", that ability cannot be replaced") +
        ". Then there is no Normalize: fight with Yamazone alone, Leech Seed first so Sturdy re-arms every turn.");
      if (sure) line = "sturdy";
    }
    if (already && desc.exact) add("info", "Already has Normalize", "Entrainment would fail, and is not needed: its moves are already Normal-type.");
    if (scrappyPassive) {
      add("danger", data.ab(desc.passive).name + " is its passive",
        "Entrainment replaces the ability, never the passive, so its Normal-type moves still hit Ghosts. Use Yamazone alone with Leech Seed first, or open with Gastro Acid (it suppresses the passive too) and then use the standard line.");
      line = "sturdy";
    }
    if (scrappyAbility.length) add("info", desc.exact ? data.ab(scrappyAbility[0]).name + " as its ability" : "May have " + an(desc, scrappyAbility[0]),
      "Normal- and Fighting-type moves hit Ghosts until Entrainment replaces it. Entrainment first, before anything else is on the field.");

    // --- abilities that stop your status moves or your damage
    function abilityRule(setName, sev, title, asAbility, asPassive) {
      var hit = abilityHas(desc, setName);
      if (passiveHas(desc, setName)) add(sev, data.ab(desc.passive).name + " (passive)", asPassive);
      else if (hit.length) add(desc.exact ? sev : "care", (desc.exact ? "" : "May have ") + an(desc, hit[0]), asAbility);
    }
    abilityRule("magicBounce", "danger", "Magic Bounce",
      "It reflects Entrainment, Leech Seed, Soak, Heal Block and Gastro Acid back at you. Suppress it with the Mold Breaker Gastro Acid Pokémon first.",
      "It reflects Entrainment, Leech Seed, Soak, Heal Block and Gastro Acid, and Entrainment would not remove a passive anyway. Mold Breaker Gastro Acid first.");
    abilityRule("goodAsGold", "danger", "Good as Gold",
      "Status moves aimed at it fail: Entrainment, Curse, Leech Seed, Soak, Heal Block and plain Gastro Acid. Use Mold Breaker Gastro Acid (or Core Enforcer) first.",
      "Status moves aimed at it fail. Use Mold Breaker Gastro Acid (or Core Enforcer) first.");
    abilityRule("magicGuard", "danger", "Magic Guard",
      "It takes no damage from Leech Seed, Curse or Salt Cure. Entrainment replaces the ability: do that before anything else.",
      "It takes no damage from Leech Seed, Curse or Salt Cure, and Entrainment cannot remove a passive. Gastro Acid first.");
    abilityRule("liquidOoze", "care", "Liquid Ooze",
      "Leech Seed would damage Yamazone instead of healing it. Entrainment (or Gastro Acid) before Leech Seed.",
      "Leech Seed would damage Yamazone instead of healing it. Gastro Acid before Leech Seed.");
    abilityRule("neutralizingGas", "danger", "Neutralizing Gas",
      "While it is out your Sturdy, Normalize, Psychic Surge and lures are switched off. Gastro Acid it first.",
      "While it is out your Sturdy, Normalize, Psychic Surge and lures are switched off. Gastro Acid it first.");
    abilityRule("parentalBond", "danger", "Parental Bond",
      "Every attack hits twice, which breaks Sturdy. Entrainment replaces it; until then Yamazone is not safe.",
      "Every attack hits twice, which breaks Sturdy, and it stays through Entrainment. Gastro Acid first.");
    abilityRule("moldBreaker", "care", "Ignores Sturdy",
      "Its attacks ignore Sturdy until Entrainment replaces the ability.",
      "Its attacks ignore Sturdy and Entrainment cannot remove a passive. Only matters if its moves can still hit you.");
    abilityRule("priorityBlock", "care", "Blocks priority",
      "Priority moves aimed at it fail, including Prankster status moves. Outspeed it instead; Tailwind is unaffected because it targets your side.",
      "Priority moves aimed at it fail, including Prankster status moves. Outspeed it instead; Tailwind is unaffected because it targets your side.");
    abilityRule("waterAbsorb", "care", "Absorbs Water moves",
      "Soak is a Water-type move and is absorbed. Entrainment replaces the ability first.",
      "Soak is a Water-type move and is absorbed for the whole fight. Salt Cure still works at normal strength.");
    abilityRule("grassAbsorb", "care", "Sap Sipper",
      "Leech Seed is a Grass-type move and is absorbed. Entrainment replaces the ability first.",
      "Leech Seed is a Grass-type move and is absorbed for the whole fight: no Sturdy loop from the seed.");
    abilityRule("aromaVeil", "care", "Aroma Veil",
      "Heal Block and Disable fail against it until Entrainment replaces the ability.",
      "Heal Block and Disable fail against it for the whole fight.");
    var sand = passiveHas(desc, "sandstorm") || abilityHas(desc, "sandstorm").length > 0 || movesIn(desc, "sandstorm").length > 0;
    if (sand) {
      var kt = opts.killerTypes;
      var safe = kt ? adv.sandSafe(kt) : null;
      add(safe === false ? "danger" : "care", "Sandstorm",
        "Sandstorm chips after the Leech Seed heal, so Sturdy stops re-arming unless Yamazone is Rock, Ground or Steel." +
        (safe === true ? " Yours is " + adv.typeNames(kt) + ": immune." : safe === false ? " Yours is " + adv.typeNames(kt) + ": not immune." : ""));
    }

    // --- its typing against your moves
    if (desc.types.indexOf(T.GRASS) !== -1) add("care", "Grass-type", "Leech Seed fails on Grass-types. Soak first, then Leech Seed.");
    if (desc.types.indexOf(T.DARK) !== -1) add("info", "Dark-type", "Status moves from a Prankster Pokémon fail when aimed at it. Tailwind still works: it targets your own side.");
    if (desc.types.indexOf(T.STEEL) !== -1 || (desc.types.length === 1 && desc.types[0] === T.WATER)) {
      add("info", desc.types.indexOf(T.STEEL) !== -1 ? "Steel-type" : "Pure Water", "Salt Cure already does double damage" + (desc.types.length === 1 && desc.types[0] === T.WATER ? "; Soak would fail and is not needed." : ". Soak is still worth it against a Grass half."));
    }

    // --- its moves
    var protectedByNormalize = line === "standard";
    var multi = movesIn(desc, "multiHit");
    if (multi.length) {
      if (protectedByNormalize) add("info", "Multi-hit: " + moveNames(multi), "Breaks Sturdy, but cannot hit a Ghost once it has Normalize.");
      else add("danger", "Multi-hit: " + moveNames(multi), "It " + mayKnow(desc) + " a move that hits more than once, which kills through Sturdy. Disable it after it is used once (you need one safe turn first: Gouot's entry-turn Mat Block or the Reviver Seed).");
    }
    var heals = movesIn(desc, "heal");
    if (heals.length) add("info", "Heals: " + moveNames(heals), "Heal Block early. It lasts 5 turns, so reapply it.");
    var perish = movesIn(desc, "perish");
    if (perish.length) add("care", "Perish Song", "It hits your Pokémon regardless of type, and bosses are immune to it. Switch out before the count ends and come back.");
    var taunt = movesIn(desc, "taunt");
    if (taunt.length) add("care", "Taunt", "Blocks status moves for a few turns: all four of Jynxgigas's moves and three of Yamazone's. Switching out clears it.");
    var phaze = movesIn(desc, "phaze").filter(function (m) { return data.mv(m).cat === 2; });
    if (phaze.length) add("care", "Forces switches: " + moveNames(phaze), "It can drag another party member onto the field. Switch back, and keep Pokémon that are not Ghost-type out of harm's way.");
    var expose = movesIn(desc, "exposeGhost");
    if (expose.length) add("danger", moveNames(expose), "After this move, Normal- and Fighting-type moves hit the Ghost it was used on. Switch that Pokémon out to clear it.");
    var odd = movesIn(desc, "notNormalized").concat(movesIn(desc, "typeless").filter(function (m) { return data.mv(m).key !== "STRUGGLE"; }));
    if (odd.length) add("care", "Not changed by Normalize: " + moveNames(odd), "These moves pick their own type, so they can still hit a Ghost (Weather Ball and Terrain Pulse only while weather or terrain is up).");
    var ion = movesIn(desc, "ionDeluge");
    if (ion.length) add("care", moveNames(ion), "Turns Normal-type moves Electric for the turn, so a Normalized attack can hit a Ghost that turn.");
    var meddle = movesIn(desc, "abilityChange");
    if (meddle.length) add("care", "Ability moves: " + moveNames(meddle), "It can swap, copy or overwrite abilities, including the Normalize you gave it or Yamazone's Sturdy. Re-check abilities if the fight goes wrong.");
    var hb = movesIn(desc, "healBlock").filter(function (m) { return data.mv(m).cat === 2; });
    if (hb.length) add("care", "Heal Block on you", "If it lands on Yamazone, Leech Seed stops healing for 5 turns and Sturdy does not re-arm.");
    var locks = movesIn(desc, "disable").concat(movesIn(desc, "encore"), movesIn(desc, "torment"), movesIn(desc, "imprison"));
    if (locks.length) add("info", "Move locks: " + moveNames(locks), "It can lock or repeat one of your moves for a few turns. Switching out clears it.");
    var sub = movesIn(desc, "substitute");
    if (sub.length) add("info", "Substitute", "Entrainment, Leech Seed, Soak, Heal Block and Gastro Acid fail against a substitute. Curse and Disable go through.");
    var coat = movesIn(desc, "magicCoat");
    if (coat.length) add("info", "Magic Coat", "Reflects your status moves on the turn it is used.");
    var pierce = movesIn(desc, "ignoreAbility");
    if (pierce.length && !protectedByNormalize) add("danger", "Ignores Sturdy: " + moveNames(pierce), "These moves ignore abilities.");
    var boom = movesIn(desc, "selfKO");
    if (boom.length) add("good", "May knock itself out: " + moveNames(boom), "No action needed.");

    var worst = notes.some(function (n) { return n.sev === "danger"; }) ? "danger" : notes.some(function (n) { return n.sev === "care"; }) ? "care" : "ok";
    return { notes: notes, line: line, level: worst };
  }

  /** Full dossier for a forced boss or a boss you choose to fight: guide notes first, then what the data adds. */
  function bossDossier(subject, ctx, wave) {
    var info = adv.waveInfo(wave || (ctx.session ? ctx.session.wave : 50));
    var exact = !!(ctx.peek && subject.fromSave);
    var s = {};
    for (var k in subject) s[k] = subject[k];
    if (s.passiveOn == null) s.passiveOn = info.kind === "paradox" || info.kind === "x0";
    if (info.kind === "eternatus" || info.kind === "eternamax") s.passiveOn = false;
    if (s.boss == null) s.boss = true;
    var desc = describe(s, exact);
    if (!desc) return null;
    var killer = ctx.assign.byRole.killer;
    var computed = bossNotes(desc, { killerTypes: killer ? killer.types : null });
    var key = data.sp(desc.id).k;
    var guide = kb.bossNotes[key] || null;
    var partner = ctx.assign.byRole.partner;
    var speedNote = null;
    if (desc.speed != null && partner && partner.stats.length) {
      var mine = partner.stats[5];
      speedNote = { mine: mine, theirs: desc.speed, faster: mine > desc.speed, who: partner.name };
    }
    var level = guide && guide.level === "danger" ? "danger" : computed.level === "danger" ? "danger" : (guide && guide.level === "care") || computed.level === "care" ? "care" : "ok";
    return { desc: desc, guide: guide, notes: computed.notes, line: computed.line, level: level, info: info, speed: speedNote,
      eternatus: key === "ETERNATUS", passiveActive: desc.passiveOn };
  }

  // ---- scouting wild Pokémon for the build ------------------------------------------------------------------------
  /**
   * Why a wild Pokémon is worth keeping for the build right now.
   * Returns [{ kind, step, text, sure }] ; sure=false means "this species can", sure=true means "this one does".
   */
  function scout(subject, ctx, exact) {
    var desc = describe(subject, exact);
    if (!desc) return [];
    var out = [];
    var ownMoves = [], prevoMoves = [];
    data.levelMoves(desc.id, desc.form).forEach(function (lm) { if (lm[0] >= 0) ownMoves.push(lm[1]); });
    kb.steps.forEach(function (step) {
      var eff = adv.effectiveStep(step, ctx);
      if (eff.state === "done") return;
      var roleName = kb.roles[step.who].name.toLowerCase();
      if (step.kind === "learn") {
        if (step.from) return;
        var who = adv.memberFor(ctx, step.who);
        var keys = (step.moves || step.anyOf).filter(function (k) { return !adv.knows(who, k); });
        keys.forEach(function (k) {
          var id = M(k);
          if (desc.exact && desc.moves.indexOf(id) !== -1) {
            out.push({ kind: "learn", step: step.id, sure: true, text: "Knows " + data.mv(id).name + " right now: " + step.title + " for your " + roleName + ". Catch it and splice." });
          } else if (ownMoves.indexOf(id) !== -1) {
            var lvl = data.knowsByLevel(desc.id, desc.form, id);
            out.push({ kind: "learn", step: step.id, sure: false, rare: !!step.rare,
              text: (desc.exact ? "Does not know " + data.mv(id).name + " right now, but its species learns it (" + adv.lvlLabel(lvl) + "): fuse, then a Memory Mushroom gets it."
                : "Its species learns " + data.mv(id).name + " (" + adv.lvlLabel(lvl) + "): " + step.title + " for your " + roleName + ". Check its moves after catching; a Memory Mushroom works once fused.") });
          } else if (data.canRelearn(desc.id, desc.form, id)) {
            out.push({ kind: "learn", step: step.id, sure: false, text: "An earlier stage learns " + data.mv(id).name + ": once fused, a Memory Mushroom can pull it (" + step.title + ")." });
          }
        });
      } else if (step.kind === "carbos") {
        var n = desc.items.CARBOS || 0;
        if (n > 0) {
          var holder = adv.memberFor(ctx, step.who);
          var where = (holder ? holder.name : roleName) + (eff.auto.progress ? " (" + eff.auto.progress[0] + " of " + eff.auto.progress[1] + ")" : "");
          var prior = out.filter(function (o) { return o.kind === "carbos"; })[0];
          if (prior) { prior.text = prior.text.replace(/ and unfuse\.$/, "") + ", or " + where + ", and unfuse."; }
          else out.push({ kind: "carbos", step: step.id, sure: true, text: "Holds " + n + " Carbos: catch it, fuse it onto " + where + " and unfuse." });
        }
      } else if (step.kind === "fuse" && step.need !== "normalize") {
        var wantSet = step.need === "sturdy" ? "sturdy" : "lure";
        var slots = desc.exact ? desc.abilities : desc.abilities;
        slots.forEach(function (a) {
          if (!data.aIn(wantSet, a)) return;
          var base = adv.roleSpecies(ctx, step.who);
          var fz = data.fusedTypes(data.form(base.id, base.form).types, data.form(desc.id, desc.form).types);
          var hidden = a === desc.hiddenAbility;
          if (step.need === "sturdy" && !adv.sandSafe(fz)) {
            out.push({ kind: "fuse", step: step.id, sure: false, weak: true, text: (desc.exact ? "Has " : "Can have ") + data.ab(a).name + ", but the fusion would be " + adv.typeNames(fz) + ": sandstorm still chips it." });
            return;
          }
          out.push({ kind: "fuse", step: step.id, sure: desc.exact,
            text: (desc.exact ? "Has " + data.ab(a).name : "Can have " + data.ab(a).name + (hidden ? " (hidden ability; check after catching)" : " (check which ability it has)")) +
              ": partner for " + step.title.replace(" (keep fused)", "") + " → " + adv.typeNames(fz) + "." });
        });
      }
    });
    return out;
  }

  /**
   * Would catching this Pokémon add anything to a species already in the dex? Mirrors the grey Poké Ball in the game's
   * enemy info box (EnemyBattleInfo): a missing shiny, variant, gender or form bit, or an ability the root starter has
   * not unlocked. Returns true or false, or null when the synced save cannot tell. It never says which part is new.
   */
  function dexNews(enemy, system) {
    if (!system || !system.dexAttrs || !enemy.dexKey || !data.sp(enemy.species)) return null;
    var have = system.dexAttrs[enemy.species];
    if (!have) return null;
    var k = enemy.dexKey, want = BigInt(0);
    if (k.gender === 0) want |= BigInt(4); else if (k.gender === 1) want |= BigInt(8);
    want |= k.shiny ? BigInt(2) : BigInt(1);
    want |= k.variant >= 2 ? BigInt(64) : k.variant === 1 ? BigInt(32) : BigInt(16);
    want |= BigInt(1) << BigInt(7 + (enemy.form || 0));
    try { if ((BigInt(have) & want) !== want) return true; } catch (e) { return null; }
    var rootId = data.root(enemy.species), rootSp = data.sp(rootId);
    if (!rootSp || !system.abilities) return false;
    var owned = system.abilities[rootId] || 0, current = rootSp.a[k.slot];
    for (var i = 0; i < 3; i++) if ((owned & (1 << i)) && rootSp.a[i] === current) return false;
    return true;
  }

  /**
   * What a catch does for the species' candy shop. Candies go to the root starter only (GameData.setPokemonSpeciesCaught
   * recurses down the prevolution chain and adds candy at the root): 1 per catch, 5 × 2^variant for a shiny, doubled for
   * a boss, capped at 9,999. The shop sells the passive and two cost reductions (starters.ts allStarterCandyCosts).
   * Returns null when no save is synced, the root starter is unknown to this page's data, or the save has no entry for it.
   *   left: unlocks still to buy, in shop order; next: the first of them; short: candies missing for it;
   *   rank: [unlocks left (more first), candies (fewer first)], the order the player catches in.
   */
  function candyNeed(enemy, system) {
    if (!system || !system.starters) return null;
    var rootId = data.root(enemy.species), rootSp = data.sp(rootId);
    if (!rootSp || !rootSp.c) return null;
    var st = system.starters[rootId];
    if (!st) return null;
    var candy = st.candy || 0, reductions = st.reductions || 0, passiveUnlocked = !!(st.passiveAttr & 1);
    var costs = data.candyCosts(rootSp.c), left = [];
    if (!passiveUnlocked) left.push({ what: "passive", cost: costs.passive });
    for (var i = reductions; i < 2; i++) left.push({ what: i === 0 ? "first cost reduction" : "second cost reduction", cost: costs.reductions[i] });
    var gain = (enemy.shiny ? 5 * Math.pow(2, enemy.variant || 0) : 1) * (enemy.boss ? 2 : 1);
    var next = left.length ? left[0] : null;
    return { root: rootId, name: rootSp.n, candy: candy, left: left, next: next, short: next ? Math.max(0, next.cost - candy) : 0,
      gain: Math.min(gain, Math.max(0, 9999 - candy)), rank: [left.length, candy] };
  }

  /** Order for catch targets: most unlocks left first, then fewest candies. Pokémon without candy data go last. */
  function candyOrder(a, b) {
    if (!a && !b) return 0;
    if (!a) return 1;
    if (!b) return -1;
    return b.rank[0] - a.rank[0] || a.rank[1] - b.rank[1];
  }

  /** The candy facts for a wild Pokémon's card: fully unlocked, or what its starter still needs. */
  function candyText(c) {
    var candies = function (n) { return n + (n === 1 ? " candy" : " candies"); };
    if (!c.left.length) return c.name + " is fully unlocked (" + candies(c.candy) + ").";
    var left = c.left.length === 1 ? "1 unlock left" : c.left.length + " unlocks left";
    var need = c.short ? "needs " + candies(c.short) + " more for its " + c.next.what + " (has " + c.candy + " of " + c.next.cost + ")"
      : "can already buy its " + c.next.what + " (has " + c.candy + " of " + c.next.cost + ")";
    return c.name + " " + need + ", " + left + ". A catch gives " + c.gain + ".";
  }

  /** Free-slot pickups for the running phase: Whimsicott-style Tailwind and a Mold Breaker Gastro Acid body. */
  function freeSlotMatches(desc, ctx) {
    var out = [];
    var extras = ctx.assign.extras || [];
    var haveTailwind = extras.some(function (m) { return m.ability === A("PRANKSTER") && m.moves.indexOf(M("TAILWIND")) !== -1; });
    var haveBreaker = extras.some(function (m) { return data.aIn("moldBreaker", m.ability); });
    if (!haveTailwind && desc.abilities.indexOf(A("PRANKSTER")) !== -1 && data.canRelearn(desc.id, desc.form, M("TAILWIND"))) {
      out.push({ kind: "free", sure: desc.exact, text: (desc.exact ? "Prankster" : "Can have Prankster") + " and learns Tailwind: the free-slot answer to a fast Eternatus." });
    }
    if (!haveBreaker && desc.abilities.some(function (a) { return data.aIn("moldBreaker", a); })) {
      out.push({ kind: "free", sure: desc.exact, text: (desc.exact ? "Has " : "Can have ") + names(desc.abilities.filter(function (a) { return data.aIn("moldBreaker", a); }), data.ab) + ": body for the Mold Breaker + Gastro Acid free slot." });
    }
    return out;
  }

  /**
   * Items on a wild Pokémon that the build is still short of and that can be taken (Thief, Mini Black Hole).
   * Wild Pokémon in Endless hold berries, vitamins, type boosters, Lucky Eggs and Golden Eggs, and the wave-1000
   * Eternatus carries a Mini Black Hole. Vitamins cannot be stolen: Carbos go through the fuse-and-dump steps instead.
   */
  function wantedItems(enemy, ctx) {
    var audit = adv.itemAudit(ctx), short = {}, order = [];
    audit.roles.forEach(function (r) { r.rows.forEach(function (row) { if (!row.done && row.key !== "CARBOS" && !short[row.key]) { short[row.key] = true; order.push(row.key); } }); });
    var out = [];
    order.forEach(function (key) {
      if (enemy.items[key]) out.push({ key: key, count: enemy.items[key], name: (kb.itemInfo[key] || { name: key }).name });
    });
    return out;
  }

  /**
   * Everything worth saying about one wild Pokémon on the current wave.
   * phase: "carry" or "run". Uses exact ability and moves only when ctx.peek is on.
   */
  function scanEnemy(enemy, ctx, phase) {
    var exact = !!ctx.peek;
    var desc = describe(enemy, exact);
    var alerts = [];
    if (!desc) return { desc: null, alerts: [{ sev: "info", text: "Unknown species #" + enemy.species + " (newer than this page's game data).", want: false }], wanted: false, steal: false, gas: "no", candy: null };
    function add(sev, text, want) { alerts.push({ sev: sev, text: text, want: !!want }); }

    if (enemy.shiny) add("shiny", "Shiny" + (enemy.variant ? " (tier " + (enemy.variant + 1) + ")" : "") + ". Master Ball it, or use the safe-capture steps.", true);
    if (ctx.system && data.sp(enemy.species)) {
      var caught = ctx.system.caught.indexOf(enemy.species) !== -1;
      if (!caught) add("want", data.sp(enemy.species).n + " is not in your dex yet.", true);
      else if (dexNews(enemy, ctx.system)) add("want", "Something about this " + data.sp(enemy.species).n + " is new to your dex. Catch it.", true);
      else if (dexNews(enemy, ctx.system) === null && enemy.shiny && ctx.system.shiny.indexOf(enemy.species) === -1) add("want", "You do not own this shiny.", true);
    }
    // candy: facts only (fully unlocked, or what its starter still needs); the order between two catches uses them
    var candy = candyNeed(enemy, ctx.system);
    if (candy) add("candy", candyText(candy), false);
    var matches = scout(enemy, ctx, exact);
    matches.forEach(function (m) {
      if (m.weak) return;
      add(m.sure ? "want" : "maybe", m.text, m.sure || m.kind === "carbos" || !!m.rare);
    });
    var forcedWave = ctx.session ? adv.waveInfo(ctx.session.wave).forced : false;
    wantedItems(enemy, ctx).forEach(function (it) {
      add("item", "Holds " + it.count + " × " + it.name + ", which you are still short of. " +
        (forcedWave ? "Mini Black Hole takes one item a turn while you fight; Thief works too." : "Thief or Mini Black Hole it, or catch it."), phase === "run" && !forcedWave);
    });
    if (phase === "run") freeSlotMatches(desc, ctx).forEach(function (m) { add(m.sure ? "want" : "maybe", m.text, m.sure); });

    // Neutralizing Gas: the one thing that changes how you leave
    var gas = "no";
    var gasAbility = desc.abilities.some(function (a) { return data.aIn("neutralizingGas", a); });
    var gasPassive = desc.passiveOn && data.aIn("neutralizingGas", desc.passive);
    if (gasPassive || (exact && gasAbility)) gas = "yes";
    else if (gasAbility) gas = "maybe";
    // wanted: worth catching (shiny, missing from the dex, a piece of the build). steal: only its items are.
    var wanted = alerts.some(function (a) { return a.want && a.sev !== "item"; });
    var steal = alerts.some(function (a) { return a.want && a.sev === "item"; });
    return { desc: desc, alerts: alerts, wanted: wanted, steal: steal, gas: gas, candy: candy };
  }

  /** Enemy indexes, catch targets first, each group in candy order (candyOrder). */
  function catchOrder(enemies, scans) {
    return enemies.map(function (e, i) { return i; }).sort(function (a, b) {
      return (scans[b].wanted ? 1 : 0) - (scans[a].wanted ? 1 : 0) || candyOrder(scans[a].candy, scans[b].candy) || a - b;
    });
  }

  /** When two wild Pokémon are both worth catching: which one first, and why. Balls need the other one gone. */
  function firstCatch(enemies, scans, order) {
    var a = scans[order[0]].candy, b = scans[order[1]].candy, name = enemies[order[0]].name;
    var why = !a || !b ? ""
      : a.left.length !== b.left.length ? a.name + " has more unlocks left (" + a.left.length + " against " + b.left.length + ")"
        : a.candy !== b.candy ? "both have " + a.left.length + " unlock" + (a.left.length === 1 ? "" : "s") + " left, and " + a.name + " has fewer candies (" + a.candy + " against " + b.candy + ")"
          : "";
    return "Both are worth catching. " + name + " first" + (why ? ": " + why : "") + ". Remove the other one, then throw.";
  }

  /** The per-wave call while running: three checks, then flee. */
  function verdict(ctx) {
    var s = ctx.session;
    if (!s) return null;
    var info = adv.waveInfo(s.wave);
    var scans = s.enemies.map(function (e) { return scanEnemy(e, ctx, "run"); });
    var runner = ctx.assign.byRole.runner;
    var fieldSlots = s.double ? 2 : 1;
    var runnerIdx = runner ? s.party.indexOf(runner) : -1;
    var runnerOut = runnerIdx !== -1 && runnerIdx < fieldSlots && runner.hp > 0;
    var runAway = !!runner && runner.passiveOn && runner.passive === A("RUN_AWAY") || (!!runner && runner.ability === A("RUN_AWAY"));
    var notes = [];
    if (info.forced) {
      return { action: "boss", title: adv.kindLabel(info.kind), info: info, scans: scans, notes: ["No fleeing and no catching on this wave. Gouot must be on the field when it ends."], reasons: [], catches: [], steals: [] };
    }
    var catches = [], steals = [];
    var order = catchOrder(s.enemies, scans);
    order.forEach(function (i) {
      scans[i].alerts.forEach(function (a) {
        if (a.want) (a.sev === "item" ? steals : catches).push({ who: s.enemies[i].name, text: a.text, sev: a.sev });
      });
    });
    var first = order.length > 1 && scans[order[0]].wanted && scans[order[1]].wanted ? firstCatch(s.enemies, scans, order) : "";
    var gasYes = scans.some(function (sc) { return sc.gas === "yes"; });
    var gasMaybe = scans.some(function (sc) { return sc.gas === "maybe"; });
    if (!runner) notes.push("No runner found in the synced party.");
    else if (!runAway) notes.push(runner.name + " does not have Run Away active: fleeing is not guaranteed.");
    else if (!runnerOut) notes.push(runner.name + " is not on the field (slot " + (runnerIdx + 1) + " in a " + (s.double ? "double" : "single") + " battle). Run Away only works for a Pokémon that is out.");
    if (first) notes.push(first);
    if (info.kind === "x0") notes.push("X0 wave: bosses cannot be Roared away. If you stay, Trick-or-Treat the one you want and Entrainment its partner.");
    // catch-worthy beats everything; Neutralizing Gas has to be answered before you can leave; items are a quick Thief
    var action = catches.length ? "stay" : gasYes ? "gastro" : steals.length ? "steal" : "run";
    var busy = action === "stay" || action === "steal";
    if (gasYes) notes.unshift("Neutralizing Gas is out: your lures and Run Away are off. " + (action === "stay" ? "Gastro Acid that Pokémon before anything else." : "Teddiurk uses Gastro Acid on it, then runs next turn."));
    else if (gasMaybe) notes.unshift("One of these can have Neutralizing Gas. If the game announces it" + (busy ? ", Gastro Acid that Pokémon first." : ": Gastro Acid, then run."));
    var title = { stay: "Stay", steal: "Steal, then run", gastro: "Gastro Acid, then run", run: "Run" }[action];
    return { action: action, title: title, info: info, scans: scans, reasons: catches.concat(steals), catches: catches, steals: steals, notes: notes };
  }

  NZ.advisor.describe = describe;
  NZ.advisor.bossNotes = bossNotes;
  NZ.advisor.bossDossier = bossDossier;
  NZ.advisor.scout = scout;
  NZ.advisor.scanEnemy = scanEnemy;
  NZ.advisor.verdict = verdict;
  NZ.advisor.wantedItems = wantedItems;
  NZ.advisor.dexNews = dexNews;
  NZ.advisor.candyNeed = candyNeed;
  NZ.advisor.candyOrder = candyOrder;
  NZ.advisor.catchOrder = catchOrder;
})();
