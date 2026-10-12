/* Advice engine, part 2: the splice list, item targets and run readiness. */
(function () {
  "use strict";
  var data = NZ.data, kb = NZ.kb, adv = NZ.advisor;
  var T = adv.TYPES, SPD = 5;
  function M(key) { return data.M[key]; }
  function A(key) { return data.A[key]; }

  /** Everything a piece of advice may need. `manual` is what the player ticked by hand. */
  function makeContext(opts) {
    var roster = opts.roster || adv.defaultRoster();
    var ctx = {
      session: opts.session || null, system: opts.system || null, roster: roster,
      manual: opts.manual || { splice: {}, items: {}, reductions: {} }, peek: !!opts.peek
    };
    ctx.assign = adv.assignRoles(ctx.session, roster);
    return ctx;
  }

  /** The party member doing a role's job right now; the carry lives inside the partner after the last fusion. */
  function memberFor(ctx, role) {
    var m = ctx.assign.byRole[role];
    if (m) return m;
    var f = ctx.assign.flags[role];
    return f && f.member ? f.member : null;
  }

  /** Species currently filling a role (for "what would this fusion give" questions before anything is synced). */
  function roleSpecies(ctx, role) {
    var m = ctx.assign.byRole[role];
    if (m) return { id: m.species, form: m.form };
    var id = ctx.roster[role];
    // the staller and partner are fused in their evolved forms; answer with the form the guide fuses
    if (role === "staller" && data.sp(id).k === "PUMPKABOO") id = data.S.GOURGEIST;
    if (role === "partner" && data.sp(id).k === "SMOOCHUM") id = data.S.JYNX;
    return { id: id, form: kb.needs[role].form || 0 };
  }

  function typeNames(types) { return types.map(data.typeName).join("/"); }
  function sandSafe(types) { return types.indexOf(T.ROCK) !== -1 || types.indexOf(T.GROUND) !== -1 || types.indexOf(T.STEEL) !== -1; }

  /**
   * Where a splice step stands, read from the save. state "unknown" means nothing is synced (or the Pokémon is not
   * in the party), and the page falls back to what was ticked by hand.
   */
  function stepStatus(step, ctx) {
    if (!ctx.session) return { state: "unknown", detail: "" };
    var who = memberFor(ctx, step.who);
    if (step.id === "s4" && !ctx.assign.byRole.carry) who = memberFor(ctx, "carry") || ctx.assign.byRole.partner;
    if (!who) return { state: "unknown", detail: kb.roles[step.who].name + " is not in the synced party." };
    var flags = ctx.assign.flags[step.who] || {};

    if (step.kind === "learn") {
      var wanted = step.moves || step.anyOf;
      var have = wanted.filter(function (k) { return adv.knows(who, k); });
      // a move meant for the fusion may still sit on the other half
      if (step.who === "partner" && ctx.assign.byRole.carry) {
        wanted.forEach(function (k) { if (have.indexOf(k) === -1 && adv.knows(ctx.assign.byRole.carry, k)) have.push(k); });
      }
      var done = step.anyOf ? have.length > 0 : have.length === wanted.length;
      var missing = wanted.filter(function (k) { return have.indexOf(k) === -1; });
      return {
        state: done ? "done" : "todo", who: who,
        detail: done ? who.name + " knows " + have.map(function (k) { return data.mv(M(k)).name; }).join(" and ") + "."
          : "Missing on " + who.name + ": " + missing.map(function (k) { return data.mv(M(k)).name; }).join(step.anyOf ? " or " : ", ") + "."
      };
    }

    if (step.kind === "carbos") {
      var cap = Math.min(31, who.ivs.length ? who.ivs[SPD] : 31);
      var n = who.items.CARBOS || 0;
      return {
        state: n >= cap ? "done" : "todo", who: who, progress: [n, cap],
        detail: who.name + " holds " + n + " of " + cap + " Carbos" + (cap < 31 ? " (its Speed IV is " + cap + ", so that is the cap)." : ".")
      };
    }

    // fusions that stay
    if (flags.wrongOrder) {
      return { state: "todo", who: who, problem: "order",
        detail: who.name + " is fused the wrong way round: " + data.sp(who.species).n + " is the base, so the passive is " + data.ab(who.passive).name +
          ". Unsplice and fuse again with " + data.sp(ctx.roster[step.who]).n + "'s line first." };
    }
    if (!who.fusion) return { state: "todo", who: who, detail: who.name + " is not fused yet." };
    var issues = [];
    if (step.need === "sturdy") {
      var sturdy = who.ability === A("STURDY") || (who.passiveOn && who.passive === A("STURDY"));
      if (!sturdy) issues.push("its ability is " + data.ab(who.ability).name + ", not Sturdy");
      if (!who.passiveOn) issues.push("its passive is not unlocked");
      if (!sandSafe(who.types)) issues.push("it is " + typeNames(who.types) + ", so sandstorm will chip it (wants Rock, Ground or Steel)");
      if (who.types.indexOf(T.GHOST) === -1) issues.push("it is not Ghost-type");
    } else if (step.need === "lureFast") {
      var count = adv.memberLures({ hp: 1, ability: who.ability, passive: who.passive, passiveOn: who.passiveOn }).length;
      if (count < 2) issues.push("it brings " + count + " lure source" + (count === 1 ? "" : "s") + " (ability " + data.ab(who.ability).name + ", passive " + data.ab(who.passive).name + "); the goal is two");
    } else if (step.need === "lure") {
      if (!adv.isLure(who.ability)) issues.push("its ability is " + data.ab(who.ability).name + ", which is not a lure");
      if (!(who.passiveOn && who.passive === A("RUN_AWAY"))) issues.push("Run Away is not its active passive");
    } else if (step.need === "normalize") {
      if (who.ability !== A("NORMALIZE")) issues.push("its ability is " + data.ab(who.ability).name + ", not Normalize");
      if (!(who.passiveOn && who.passive === A("PSYCHIC_SURGE"))) issues.push("its active passive is not Psychic Surge");
    }
    return {
      state: issues.length ? "todo" : "done", who: who,
      detail: issues.length ? who.name + ": " + issues.join("; ") + "." : who.name + " (" + data.ab(who.ability).name + " / " + data.ab(who.passive).name + ", " + typeNames(who.types) + ")."
    };
  }

  /** Step state after applying a manual tick: a hand tick wins over the save when the two disagree. */
  function effectiveStep(step, ctx) {
    var auto = stepStatus(step, ctx);
    var manual = ctx.manual.splice ? ctx.manual.splice[step.id] : undefined;
    var state = manual || (auto.state === "unknown" ? "todo" : auto.state);
    return { state: state, auto: auto, manual: manual || null, source: manual ? "manual" : (auto.state === "unknown" ? "none" : "save") };
  }

  function lvlLabel(lvl) { return lvl > 0 ? "Lv " + lvl : lvl === 0 ? "on evolving" : "Memory Mushroom only"; }

  /** Ways the role's own Pokémon could get a move without a splice. */
  function ownRoutes(ctx, role, moveKey) {
    var sp = roleSpecies(ctx, role), out = [], id = M(moveKey);
    var lvl = data.knowsByLevel(sp.id, sp.form, id);
    if (lvl != null) out.push(data.sp(sp.id).n + " learns " + data.mv(id).name + " itself (" + lvlLabel(lvl) + ").");
    else if (data.canRelearn(sp.id, sp.form, id)) out.push(data.sp(sp.id).n + " can relearn " + data.mv(id).name + " from an earlier stage with a Memory Mushroom.");
    if (data.canTm(sp.id, id)) out.push(data.sp(sp.id).n + " can use the " + data.mv(id).name + " TM.");
    var eggSlot = data.eggMoves(ctx.roster[role]).indexOf(id);
    if (eggSlot !== -1) out.push(data.mv(id).name + " is an egg move of " + data.sp(data.root(ctx.roster[role])).n + (eggSlot === 3 ? " (rare)" : "") + ": start with it if unlocked.");
    return out;
  }

  /**
   * Wild Pokémon worth catching for a step, from game data.
   * learn steps: every species with the move in its level-up list. fuse steps: every species form with a fitting
   * ability, with what the fusion would come out as.
   */
  function stepCandidates(step, ctx) {
    var out = { own: [], groups: [] };
    if (step.kind === "learn") {
      var keys = step.moves || step.anyOf;
      var who = memberFor(ctx, step.who);
      var pending = keys.filter(function (k) { return !adv.knows(who, k); });
      if (!pending.length) pending = keys;
      pending.forEach(function (k) { out.own = out.own.concat(ownRoutes(ctx, step.who, k)); });
      var lists = pending.map(function (k) { return data.learners(M(k)); });
      if (step.moves && pending.length > 1) {
        var both = lists[0].filter(function (a) { return lists.slice(1).every(function (l) { return l.some(function (b) { return b.id === a.id && b.lvl >= 0; }); }) && a.lvl >= 0; });
        if (both.length) out.groups.push({ title: "Knows " + pending.map(function (k) { return data.mv(M(k)).name; }).join(" and "), rows: both.map(function (r) { return { id: r.id, form: 0, sub: "" }; }) });
      }
      pending.forEach(function (k, i) {
        var rows = lists[i].slice().sort(function (a, b) { return (a.lvl < 0) - (b.lvl < 0) || data.sp(a.id).n.localeCompare(data.sp(b.id).n); })
          .map(function (r) { return { id: r.id, form: 0, sub: lvlLabel(r.lvl), weak: r.lvl < 0 }; });
        out.groups.push({ title: data.mv(M(k)).name, rows: rows });
      });
      if (step.from) out.own.unshift("Source: your " + kb.roles[step.from].name.toLowerCase() + " (" + data.sp(ctx.roster[step.from]).n + ").");
      return out;
    }
    if (step.kind === "carbos") {
      out.own.push("Any wild Pokémon holding Carbos. Enemy items show as icons under its name; the live sync flags them for you.");
      return out;
    }
    var base = roleSpecies(ctx, step.who);
    if (step.need === "sturdy") {
      var killer = memberFor(ctx, "killer");
      var missing = kb.finalTeam.killer.moves.filter(function (k) { return !adv.knows(killer, k); });
      var rows = data.withAbility(A("STURDY")).map(function (r) {
        var fz = data.fuse(base, r);
        var teaches = missing.filter(function (k) { return data.canRelearn(r.id, r.form, M(k)); });
        return { id: r.id, form: r.form, ok: sandSafe(fz.types), hidden: r.slot === 2,
          sub: "→ " + typeNames(fz.types) + (r.slot === 2 ? " · hidden ability" : "") + (teaches.length ? " · also teaches " + teaches.map(function (k) { return data.mv(M(k)).name; }).join(", ") : ""),
          sort: (sandSafe(fz.types) ? 0 : 1) + "" + (teaches.length ? 0 : 1) + data.sp(r.id).n };
      }).sort(function (a, b) { return a.sort < b.sort ? -1 : 1; });
      out.groups.push({ title: "Sturdy, and the fusion comes out Rock, Ground or Steel", rows: rows.filter(function (r) { return r.ok; }) });
      out.groups.push({ title: "Sturdy, but the typing does not stop sandstorm", rows: rows.filter(function (r) { return !r.ok; }), weak: true });
      return out;
    }
    if (step.need === "lureFast" || step.need === "lure") {
      var lureRows = [];
      data.set("as", "lure").forEach(function (a) {
        data.withAbility(a).forEach(function (r) {
          var fz = data.fuse(base, r), f = data.form(r.id, r.form);
          var megaLike = /mega|gigantamax|primal/.test(f.key);
          lureRows.push({ id: r.id, form: r.form, hidden: r.slot === 2, speed: fz.stats[SPD], ghost: fz.types.indexOf(T.GHOST) !== -1,
            sub: data.ab(a).name + (r.slot === 2 ? " (hidden)" : "") + " · base Speed " + f.stats[SPD] + " → fusion " + fz.stats[SPD] + " · " + typeNames(fz.types) + (megaLike ? " · needs its form item" : "") });
        });
      });
      if (step.need === "lureFast") {
        lureRows.sort(function (a, b) { return b.speed - a.speed; });
        out.groups.push({ title: "Lure abilities, fastest fusion first", rows: lureRows });
      } else {
        lureRows.sort(function (a, b) { return (b.ghost - a.ghost) || (b.speed - a.speed); });
        out.groups.push({ title: "Lure abilities; Ghost-type results first", rows: lureRows });
      }
      return out;
    }
    if (step.need === "normalize") out.own.push("Fuse your carry (" + data.sp(ctx.roster.carry).n + ", Normalize) onto " + data.sp(base.id).n + ". Do it last: the carry stops carrying.");
    return out;
  }

  /** Have/target rows for the four fusions and the bag. Manual counts fill in when nothing is synced. */
  function itemAudit(ctx) {
    var out = { roles: [], bag: [], balls: null, synced: !!ctx.session };
    ["staller", "runner", "partner", "killer"].forEach(function (role) {
      var m = ctx.assign.byRole[role], targets = kb.finalTeam[role].items, rows = [];
      Object.keys(targets).forEach(function (key) {
        var target = targets[key], have, note = "";
        if (ctx.session) {
          have = m ? (m.items[key] || 0) : 0;
          if (role === "partner" && ctx.assign.byRole.carry) {
            var onCarry = ctx.assign.byRole.carry.items[key] || 0;
            if (onCarry) { note = onCarry + " on " + ctx.assign.byRole.carry.name; have += onCarry; }
          }
          if (key === "CARBOS" && m && m.ivs.length && m.ivs[SPD] < 31) { target = m.ivs[SPD]; note = (note ? note + "; " : "") + "capped by Speed IV " + m.ivs[SPD]; }
        } else {
          have = (ctx.manual.items && ctx.manual.items[role + ":" + key]) || 0;
        }
        rows.push({ key: key, name: kb.itemInfo[key].name, have: have, target: target, done: have >= target, note: note, why: kb.itemInfo[key].why });
      });
      out.roles.push({ role: role, name: m ? m.name : kb.finalTeam[role].name, member: m || null, rows: rows });
    });
    kb.bagTargets.forEach(function (b) {
      var have = ctx.session ? (ctx.session.bag[b.key] || 0) : ((ctx.manual.items && ctx.manual.items["bag:" + b.key]) || 0);
      out.bag.push({ key: b.key, name: kb.itemInfo[b.key].name, have: have, target: b.target, done: have >= b.target, soft: !!b.soft, note: b.note || "", why: kb.itemInfo[b.key].why });
    });
    if (ctx.session) out.balls = { master: ctx.session.balls[4], rogue: ctx.session.balls[3], ultra: ctx.session.balls[2] };
    return out;
  }

  /** Is the team ready to start running? "need" rows block the plan; "nice" rows only make it smoother. */
  function readiness(ctx) {
    var rows = [];
    function row(level, label, state, detail) { rows.push({ level: level, label: label, state: state, detail: detail || "" }); }
    var unknown = !ctx.session;
    function movesState(role) {
      var m = ctx.assign.byRole[role];
      if (unknown || !m) return { state: "unknown", missing: [] };
      var missing = [];
      kb.finalTeam[role].moves.forEach(function (mv) {
        var opts = Array.isArray(mv) ? mv : [mv];
        var ok = opts.some(function (k) { return adv.knows(m, k); });
        if (!ok && role === "partner" && ctx.assign.byRole.carry) ok = opts.some(function (k) { return adv.knows(ctx.assign.byRole.carry, k); });
        if (!ok) missing.push(opts.map(function (k) { return data.mv(M(k)).name; }).join(" or "));
      });
      return { state: missing.length ? "todo" : "ok", missing: missing };
    }
    var stepById = {};
    kb.steps.forEach(function (s) { stepById[s.id] = effectiveStep(s, ctx); });
    function st(id) { return stepById[id].state === "done" ? "ok" : (unknown && !stepById[id].manual ? "unknown" : "todo"); }

    var ms = movesState("staller");
    row("need", "Mega Gouot knows Dark Void, Mat Block, Powder Snow and Trick-or-Treat", ms.state, ms.missing.length ? "Missing: " + ms.missing.join(", ") + "." : "");
    row("need", "Mega Gouot brings two lures (fast lure fusion)", st("s16"), stepById.s16.auto.detail);
    ms = movesState("runner");
    row("need", "Teddiurk knows Roar and Gastro Acid, plus Thief and a half-HP move", ms.state, ms.missing.length ? "Missing: " + ms.missing.join(", ") + "." : "");
    row("need", "Teddiurk has a lure ability and Run Away", st("s17"), stepById.s17.auto.detail || "Without it, X0 waves are a coin flip for a double.");
    ms = movesState("partner");
    row("need", "Jynxgigas is fused: Normalize with Psychic Surge", st("s18"), stepById.s18.auto.detail);
    row("need", "Jynxgigas knows Entrainment, Curse, Gastro Acid and Disable", ms.state, ms.missing.length ? "Missing: " + ms.missing.join(", ") + "." : "");
    var partner = ctx.assign.byRole.partner;
    var hasOrb = ctx.session ? (ctx.session.bag.TERA_ORB || 0) > 0 : null;
    row("need", "Jynxgigas can Terastallize Ghost",
      unknown || !partner ? "unknown" : (partner.tera === T.GHOST && hasOrb ? "ok" : "todo"),
      unknown || !partner ? "Needs a Tera Orb and a Ghost Tera Shard." : (partner.tera !== T.GHOST ? partner.name + "'s Tera type is " + data.typeName(partner.tera) + ". " : "") + (hasOrb ? "" : "No Tera Orb in the bag."));
    ms = movesState("killer");
    row("need", "Yamazone is fused: Sturdy with Purifying Salt, Rock, Ground or Steel", st("s10"), stepById.s10.auto.detail);
    row("need", "Yamazone knows Heal Block, Leech Seed, Soak and Salt Cure", ms.state, ms.missing.length ? "Missing: " + ms.missing.join(", ") + "." : "");

    var audit = itemAudit(ctx);
    function itemRow(role, key, label) {
      var r = audit.roles.filter(function (x) { return x.role === role; })[0].rows.filter(function (x) { return x.key === key; })[0];
      row("nice", label, unknown && !r.have ? "unknown" : (r.done ? "ok" : "todo"), r.have + " of " + r.target + (r.note ? " (" + r.note + ")" : "") + ".");
    }
    itemRow("staller", "CARBOS", "31 Carbos on Gouot");
    itemRow("partner", "CARBOS", "31 Carbos on Jynxgigas");
    itemRow("staller", "WIDE_LENS", "3 Wide Lens on Gouot (Dark Void never misses)");
    itemRow("killer", "WIDE_LENS", "2 Wide Lens on Yamazone (Leech Seed never misses)");
    itemRow("runner", "REVIVER_SEED", "A Reviver Seed on Teddiurk");
    var master = audit.balls ? audit.balls.master : null;
    row("nice", "About 50 Master Balls", master == null ? "unknown" : (master >= 50 ? "ok" : "todo"), master == null ? "A good mark for a first run: you will be catching a lot." : master + " in the bag.");
    var charms = audit.bag.filter(function (b) { return b.key === "SHINY_CHARM"; })[0];
    row("nice", "4 Shiny Charms", unknown && !charms.have ? "unknown" : (charms.done ? "ok" : "todo"), charms.have + " of 4.");
    var needRows = rows.filter(function (r) { return r.level === "need"; });
    return {
      rows: rows,
      ready: needRows.every(function (r) { return r.state === "ok"; }),
      open: needRows.filter(function (r) { return r.state !== "ok"; }).length,
      known: !unknown
    };
  }

  /** Which phase the synced run is in. */
  function detectPhase(ctx) {
    if (!ctx.session) return null;
    var r = readiness(ctx);
    if (r.ready) return "run";
    var fused = ["s16", "s17", "s18", "s10"].filter(function (id) { return stepStatus(kb.steps.filter(function (s) { return s.id === id; })[0], ctx).state === "done"; });
    return fused.length >= 3 && !ctx.assign.byRole.carry ? "run" : "carry";
  }

  NZ.advisor.makeContext = makeContext;
  NZ.advisor.memberFor = memberFor;
  NZ.advisor.roleSpecies = roleSpecies;
  NZ.advisor.stepStatus = stepStatus;
  NZ.advisor.effectiveStep = effectiveStep;
  NZ.advisor.stepCandidates = stepCandidates;
  NZ.advisor.itemAudit = itemAudit;
  NZ.advisor.readiness = readiness;
  NZ.advisor.detectPhase = detectPhase;
  NZ.advisor.typeNames = typeNames;
  NZ.advisor.sandSafe = sandSafe;
  NZ.advisor.lvlLabel = lvlLabel;
})();
