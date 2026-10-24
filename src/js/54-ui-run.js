/* Phase 3: running, boss fights, catching, shop and speed. */
(function () {
  "use strict";
  var ui = NZ.ui, util = NZ.util, data = NZ.data, kb = NZ.kb, adv = NZ.advisor, h = util.esc, H = ui.html, F = ui.field;
  var SEV_PILL = { danger: ["danger", "bad"], care: ["warning", "todo"], info: ["note", "info"], good: ["good", "ok"] };
  var REASON_PILL = { shiny: ["shiny", "shiny"], item: ["item", "todo"], maybe: ["check", "info"], want: ["catch", "ok"] };

  function currentWave(ctx) { return ctx.session ? ctx.session.wave : Math.max(1, Math.floor(ui.state.run.wave || 1)); }

  function steps(list, prefix) {
    return '<ol class="numbered">' + list.map(function (s, i) {
      var id = prefix + i, done = !!ui.state.run.bossSteps[id];
      return "<li><div><label class=\"switch\"><input type=\"checkbox\" id=\"bs-" + id + '" data-bind="run.bossSteps.' + id + '"' + (done ? " checked" : "") + "><span>" + h(s.t) + '</span></label><div class="d teach">' + h(s.d) + "</div></div></li>";
    }).join("") + "</ol>";
  }

  // ---- the per-wave call ---------------------------------------------------------------------------------------------
  function nowPanel(ctx) {
    var s = ctx.session;
    if (s) {
      var v = adv.verdict(ctx);
      var cls = { boss: "boss", stay: "stay", steal: "steal", gastro: "gastro" }[v.action] || "run";
      var call = v.action === "boss" ? "Boss fight" : v.title;
      // one short line per reason; the foe card below carries the full alert and its advice
      var reasons = v.reasons.length ? '<ul class="alerts">' + v.reasons.map(function (r) {
        var p = REASON_PILL[r.sev] || REASON_PILL.want;
        return '<li class="alert">' + H.pill(p[0], p[1]) + "<span><strong>" + h(r.who) + "</strong> · " + h(r.label) + "</span></li>";
      }).join("") + "</ul>" : "";
      var notes = v.notes.map(function (n) { return "<li>" + h(n) + "</li>"; }).join("");
      var warnings = (v.warnings || []).map(function (w) { return H.callout("warn", w.title, h(w.text)); }).join("");
      var foes = s.enemies.map(function (e, i) { return F.foeCard(e, v.scans[i], ctx); }).join("");
      var sub = { run: "Nothing to catch or steal. Teddiurk runs.", stay: "This wave is worth staying for.", boss: "See the boss panel below.",
        steal: "Nothing to catch, but there are items you are short of. Thief takes the best item first (30 % a hit, three hits with two Multi Lens); then Teddiurk runs.",
        gastro: v.steals.length ? "There are items to take once the gas is off." : "" }[v.action] || "";
      return H.panel("This wave", F.waveLine(s) + '<div class="verdict ' + cls + '"><div class="verdict-call">' + h(call) + "</div>" + (sub ? H.teach(h(sub), "", "div") : "") + reasons +
        (notes ? '<ul class="bullets">' + notes + "</ul>" : "") + "</div>" + warnings + '<div class="foes">' + foes + "</div>");
    }
    var r = ui.state.run, info = adv.waveInfo(r.wave);
    var action = info.forced ? "boss" : r.want ? "stay" : r.gas ? "gastro" : "run";
    var call = { boss: "Boss fight", stay: "Stay", gastro: "Gastro Acid, then run", run: "Run" }[action];
    var sub = { boss: adv.kindLabel(info.kind) + ": no fleeing and no catching. Gouot must be on the field when it ends.",
      stay: r.gas ? "Gastro Acid the Neutralizing Gas Pokémon first, then follow the catching steps." : "Follow the catching steps below.",
      gastro: "Neutralizing Gas switches off your lures and Run Away. Teddiurk uses Gastro Acid on it, then runs next turn.",
      run: "Nothing to stay for: Teddiurk runs. Run Away never fails outside forced bosses." }[action];
    return H.panel("This wave",
      '<div class="row"><label class="field" for="run-wave">Wave<input type="number" id="run-wave" min="1" max="99999" step="1" data-bind="run.wave" value="' + r.wave + '"></label>' +
      '<button type="button" class="btn" data-act="wave-next">Next wave</button>' + H.pill(adv.kindLabel(info.kind), info.forced ? "bad" : info.kind === "x0" ? "todo" : "quiet") + "</div>" +
      '<div class="row"><label class="switch"><input type="checkbox" id="run-gas" data-bind="run.gas"' + (r.gas ? " checked" : "") + '><span>Neutralizing Gas was announced</span></label>' +
      '<label class="switch"><input type="checkbox" id="run-want" data-bind="run.want"' + (r.want ? " checked" : "") + "><span>A shiny or a wanted Pokémon is out</span></label></div>" +
      '<div class="verdict ' + action + '"><div class="verdict-call">' + h(call) + "</div>" + H.teach(h(sub), "", "div") + "</div>" +
      '<p class="sub">' + H.teach("Three checks a wave, then flee. With a synced save the checks are made from the save. ", "", "span") + '<button type="button" class="btn link" data-act="tab" data-tab="sync">Set up sync</button> or <button type="button" class="btn link" data-act="sample" data-sample="shiny">try a sample wave</button>.</p>');
  }

  function positionPanel(ctx) {
    var w = currentWave(ctx), info = adv.waveInfo(w);
    var left = kb.FINAL_WAVE - w;
    return H.panel("Position", F.ruler(w) + '<dl class="kv"><dt>Next forced boss</dt><dd>Wave ' + util.fmt(info.nextForced) + " · " + h(adv.kindLabel(info.nextForcedKind)) + (info.toForced ? " · in " + info.toForced + " waves" : " · now") +
      "</dd><dt>Next X0 wave</dt><dd>Wave " + util.fmt(info.nextX0) + (info.nextX0 === w ? " · now" : "") + "</dd><dt>End of Endless</dt><dd>Wave " + util.fmt(kb.FINAL_WAVE) + (left > 0 ? " · " + util.fmt(left) + " to go" : "") + "</dd></dl>" +
      H.teach("Every 50 waves: a Paradox Pokémon. Every 250: Eternatus. Every 1000: Eternamax Eternatus. X0 waves hold wild bosses you can still flee.", "sub"));
  }

  // ---- boss desk -------------------------------------------------------------------------------------------------------
  function bossSubject(ctx) {
    var s = ctx.session;
    if (s && adv.waveInfo(s.wave).forced && s.enemies.length) {
      var e = s.enemies[0], subject = {};
      for (var k in e) subject[k] = e[k];
      subject.fromSave = true;
      return { subject: subject, wave: s.wave, auto: true };
    }
    var id = ui.state.run.boss;
    if (!id || !data.sp(id)) return null;
    var w = currentWave(ctx), info = adv.waveInfo(w);
    var isEternatus = data.sp(id).k === "ETERNATUS";
    var wave = isEternatus ? (info.nextForcedKind !== "paradox" ? info.nextForced : Math.ceil(w / 250) * 250) : (info.nextForcedKind === "paradox" ? info.nextForced : info.nextForced + 50);
    return { subject: { species: id, form: 0 }, wave: wave, auto: false };
  }

  function bossPicker(ctx) {
    var pool = data.endPool();
    var ids = pool.common.concat(pool.uncommon, pool.rare, [data.S.ETERNATUS]);
    return '<div class="chips">' + ids.map(function (id) {
      var d = adv.bossDossier({ species: id, form: 0 }, ctx, data.sp(id).k === "ETERNATUS" ? 250 : 50);
      var on = ui.state.run.boss === id;
      return '<button type="button" class="chip' + (on ? " have" : "") + '" data-act="boss-pick" data-id="' + id + '" aria-pressed="' + on + '">' + h(data.sp(id).n) +
        (d.level === "danger" ? " " + H.pill("danger", "bad") : d.level === "care" ? " " + H.pill("warning", "todo") : "") + "</button>";
    }).join("") + "</div>";
  }

  function dossierHtml(target, ctx) {
    var d = adv.bossDossier(target.subject, ctx, target.wave);
    if (!d) return '<p class="sub">Unknown species.</p>';
    var desc = d.desc;
    var abil = desc.exact ? H.ab(desc.abilities[0]) : desc.abilities.map(function (a) { return H.ab(a) + (a === desc.hiddenAbility ? ' <span class="sub">(hidden)</span>' : ""); }).join(" or ");
    var passive = d.passiveActive ? H.ab(desc.passive) + ' <span class="sub">(active: bosses keep their passive)</span>' : '<span class="sub">none on Eternatus waves</span>';
    var moves = desc.moves.slice(0, 40).map(function (m) { return H.moveChip(m); }).join("");
    var head = '<div class="foe-top"><span class="foe-name">' + h(desc.name) + "</span>" + H.typeChips(desc.types) + (desc.level ? '<span class="sub num">Lv ' + util.fmt(desc.level) + "</span>" : "") +
      H.pill(d.level === "danger" ? "needs a different line" : d.level === "care" ? "standard line, with care" : "standard line", d.level === "danger" ? "bad" : d.level === "care" ? "todo" : "ok") + "</div>" +
      '<dl class="kv"><dt>Ability</dt><dd>' + abil + "</dd><dt>Passive</dt><dd>" + passive + "</dd><dt>" + (desc.exact ? "Speed" : "Base Speed") + '</dt><dd class="num">' + (desc.exact && desc.speed != null ? util.fmt(desc.speed) : desc.baseSpeed) + "</dd></dl>";
    var speed = "";
    if (d.speed) {
      speed = H.callout(d.speed.faster ? "good" : "danger", d.speed.faster ? h(d.speed.who) + " outspeeds it" : "It outspeeds " + h(d.speed.who),
        '<span class="num">' + util.fmt(d.speed.mine) + " against " + util.fmt(d.speed.theirs) + "</span> Speed, before boosts." + (d.speed.faster ? "" : " Whimsicott's Tailwind first, then Entrainment."));
    }
    var guide = d.guide ? H.callout(d.guide.level === "danger" ? "danger" : d.guide.level === "care" ? "warn" : "plain", "From the guide", h(d.guide.problem) + '<ul class="bullets" style="margin-top:6px">' + d.guide.plan.map(function (p) { return "<li>" + h(p) + "</li>"; }).join("") + "</ul>") : "";
    var notes = d.notes.length ? '<ul class="alerts">' + d.notes.map(function (n) {
      var p = SEV_PILL[n.sev] || SEV_PILL.info;
      return '<li class="alert">' + H.pill(p[0], p[1]) + "<span><strong>" + h(n.title) + ".</strong> " + h(n.text) + "</span></li>";
    }).join("") + "</ul>" : '<p class="sub">Nothing in its typing, abilities or level-up moves gets in the way of the standard line.</p>';
    var line = d.line === "sturdy"
      ? '<h3 class="h">Sturdy line</h3>' + steps(kb.sturdyLine, "st")
      : '<h3 class="h">Standard line</h3>' + steps(kb.standardLine, "sl");
    var eter = d.eternatus ? '<h3 class="h">Eternatus cases</h3><div class="table-wrap"><table><thead><tr><th>When</th><th>Problem</th><th>Do</th></tr></thead><tbody>' +
      kb.eternatusCases.map(function (c) { return "<tr><th>" + h(c.when) + "</th><td>" + h(c.problem) + "</td><td>" + h(c.plan) + "</td></tr>"; }).join("") + "</tbody></table></div>" : "";
    var known = desc.exact ? "Read from your save: these are its real ability and moves." : "From game data: abilities and moves are what this species can have, not what this one rolled.";
    return head + speed + guide + line + '<h3 class="h">From game data</h3>' + notes + eter +
      H.details("boss-moves", (desc.exact ? "Its four moves" : "Level-up moves it can know") + " (" + desc.moves.length + ")", '<div class="chips">' + moves + "</div>") +
      '<p class="sub">' + H.teach(known + " ", "", "span") + '<button type="button" class="btn link" data-act="boss-reset">Clear the ticks</button></p>';
  }

  function bossPanel(ctx) {
    var target = bossSubject(ctx);
    var w = currentWave(ctx), info = adv.waveInfo(w);
    var intro = '<p class="note">Next forced boss: <strong>wave ' + util.fmt(info.nextForced) + "</strong> (" + h(adv.kindLabel(info.nextForcedKind)) + ")" + (info.toForced ? ", in " + info.toForced + " waves" : ", now") + ". " + H.teach("Pick the boss to see its plan.", "", "span") + "</p>";
    var body = target && target.auto ? "" : intro + bossPicker(ctx);
    body += target ? dossierHtml(target, ctx) : H.teach("Paradox bosses are drawn from 20 species. Slither Wing is the one that breaks the standard line.", "sub");
    return H.panel("Boss fights", body, ' id="boss-panel"');
  }

  // ---- catching, shop, speed, free slots -----------------------------------------------------------------------------
  function catchPanel() {
    return H.panel("Catching", '<ul class="bullets">' + kb.catching.map(function (t) { return "<li>" + h(t) + "</li>"; }).join("") + "</ul>" +
      '<h3 class="h">Safe capture</h3><ol class="numbered">' + kb.safeCapture.map(function (s) { return "<li><div><strong>" + h(s.t) + '</strong><div class="d teach">' + h(s.d) + "</div></div></li>"; }).join("") + "</ol>" +
      H.callout("warn", "X0 waves", "Both wild Pokémon may be bosses, so you cannot Roar one away and the partner's spread move can kill the shiny. Trick-or-Treat the shiny (it becomes part Ghost) and Entrainment the partner: after two turns neither can hurt it or you."),
      "", true);
  }

  function shopPanel(ctx) {
    var w = currentWave(ctx);
    var first = adv.rerollCost(w, 0), nugget = adv.moneyReward(w, 1);
    var rows = "<tr><th>First reroll</th><td class=\"n\">₽" + util.short(first) + "</td></tr><tr><th>Fifth reroll in the same shop</th><td class=\"n\">₽" + util.short(adv.rerollCost(w, 4)) +
      "</td></tr><tr><th>A Nugget here pays</th><td class=\"n\">₽" + util.short(nugget) + " · " + adv.rerollsAffordable(w, nugget) + " rerolls</td></tr>";
    if (ctx.session) rows += "<tr><th>Your money</th><td class=\"n\">₽" + util.short(ctx.session.money) + " · " + adv.rerollsAffordable(w, ctx.session.money) + " rerolls</td></tr>";
    var balls = ctx.session ? '<h3 class="h">Ball stock</h3><dl class="kv"><dt>Master Balls</dt><dd class="num">' + ctx.session.balls[4] + "</dd><dt>Rogue Balls</dt><dd class=\"num\">" + ctx.session.balls[3] + "</dd><dt>Ultra Balls</dt><dd class=\"num\">" + ctx.session.balls[2] + "</dd></dl>" : "";
    return H.panel("Shop and money", H.teach("Fleeing gives no shop and no EXP. You see a shop only after a win or a catch, or after knocking out one of two wild Pokémon and fleeing the other.", "note") + balls +
      H.teach('<h3 class="h">Take, in this order</h3><ol class="numbered">' + kb.shopRules.map(function (t) { return "<li><div>" + h(t) + "</div></li>"; }).join("") + "</ol>", "", "div") +
      '<h3 class="h">Reroll costs at wave ' + util.fmt(w) + '</h3><div class="table-wrap"><table><tbody>' + rows + "</tbody></table></div>" +
      H.teach("Reroll cost grows in a straight line with the wave and doubles per reroll in one shop; money rewards grow much faster. From about wave 1500 one Nugget covers any shop.", "sub"));
  }

  function speedCard(label, base, opts, actual) {
    var now = actual != null ? actual : adv.speedStat({ base: base, iv: opts.iv, level: opts.level, carbos: opts.carbos, soulDew: opts.soulDew, nature: opts.nature });
    var need = adv.levelForSpeed({ base: base, iv: opts.iv, carbos: opts.carbos, soulDew: opts.soulDew, nature: opts.nature }, kb.SPEED_TARGET);
    var nature = opts.nature > 0 ? "+Speed nature" : opts.nature < 0 ? "−Speed nature" : "neutral Speed nature";
    var gap = need > opts.level ? util.fmt(need - opts.level) + " levels to go" : "reached";
    return '<div class="slot' + (need > opts.level ? "" : " done") + '"><span class="slot-n">base ' + base + " · " + nature + "</span><strong>" + h(label) + '</strong><div class="big-odds num">' + util.short(now) + ' <span class="unit">Speed</span></div>' +
      '<dl class="kv tight"><dt>Level</dt><dd class="num">' + util.fmt(opts.level) + '</dd><dt>Carbos</dt><dd class="num">' + opts.carbos + (opts.iv < 31 ? " of " + opts.iv + " (Speed IV)" : " of 31") +
      '</dd><dt>Soul Dew</dt><dd class="num">' + opts.soulDew + ' of 10</dd></dl><div class="sub">' + util.short(kb.SPEED_TARGET) + ' Speed at level <span class="num">' + util.fmt(need) + "</span>: " + gap + ".</div></div>";
  }

  /** The one thing that matters while running: are both speed Pokémon on course, and is anything feeding the one on the bench? */
  function goalCallout(ctx) {
    var g = adv.speedGoal(ctx);
    if (!g.known) return "";
    if (g.done) return H.callout("good", "Both have " + util.short(kb.SPEED_TARGET) + " Speed", "The eggs have done their job: Lucky and Golden Eggs are no longer targets, and EXP no longer matters. Take whatever else the shop offers.");
    var parts = g.rows.map(function (r) { return r.done ? h(r.name) + " is there" : h(r.name) + ": <span class=\"num\">" + util.fmt(r.levelsToGo) + "</span> levels to go"; });
    var partner = g.rows.filter(function (r) { return r.role === "partner"; })[0];
    var shares = g.shares == null ? "" : g.shares < 5
      ? " EXP Share <span class=\"num\">" + g.shares + " of 5</span>: " + (partner ? h(partner.name) : "the partner") + " gets " + (g.shares * 10) + " % of each catch from the bench" + (g.shares ? "" : ", so it is not levelling at all") + "."
      : "";
    return H.callout(g.shares != null && g.shares < 5 ? "warn" : "plain", "The goal while running", parts.join(". ") + "." + shares + " " +
      H.teach("Levels come from catches, multiplied by eggs; a Pokémon that sat out the battle earns nothing without EXP Shares.", "", "span"));
  }

  function speedPanel(ctx) {
    var cards = "", sp = ui.state.speed;
    var fromSave = false;
    ["staller", "partner"].forEach(function (role) {
      var m = ctx.assign.byRole[role];
      if (!m) return;
      fromSave = true;
      var base = m.fusion ? data.fuse({ id: m.species, form: m.form }, m.fusion).stats[5] : data.form(m.species, m.form).stats[5];
      var eff = data.natureEffect(m.nature);
      cards += speedCard(m.name, base, { iv: m.ivs.length ? m.ivs[5] : 31, level: m.level, carbos: m.items.CARBOS || 0, soulDew: m.items.SOUL_DEW || 0, nature: eff && eff.up === 5 ? 1 : eff && eff.down === 5 ? -1 : 0 }, m.stats[5]);
    });
    if (!fromSave) {
      var gouot = data.fuse({ id: data.S.GOURGEIST, form: 0 }, { id: data.S.PIDGEOT, form: 1, slot: 0 }).stats[5];
      var jynx = data.fuse({ id: data.S.JYNX, form: 0 }, { id: data.S.REGIGIGAS, form: 0, slot: 2 }).stats[5];
      cards += speedCard("Mega Gouot", gouot, { iv: 31, level: sp.level, carbos: sp.carbos, soulDew: sp.soulDew, nature: 1 });
      cards += speedCard("Jynxgigas", jynx, { iv: 31, level: sp.level, carbos: sp.carbos, soulDew: sp.soulDew, nature: 1 });
    }
    var controls = fromSave ? "" : '<div class="row"><label class="field" for="sp-level">Level<input type="number" id="sp-level" min="1" max="200000" data-bind="speed.level" value="' + sp.level + '"></label>' +
      '<label class="field" for="sp-carbos">Carbos<input type="number" id="sp-carbos" min="0" max="31" data-bind="speed.carbos" value="' + sp.carbos + '"></label>' +
      '<label class="field" for="sp-dew">Soul Dew<input type="number" id="sp-dew" min="0" max="10" data-bind="speed.soulDew" value="' + sp.soulDew + '"></label></div>';
    return H.panel("Speed and levels", (fromSave ? goalCallout(ctx) : "") + controls + '<div class="slots">' + cards + "</div>" + '<ul class="bullets teach">' + kb.speedNotes.map(function (t) { return "<li>" + h(t) + "</li>"; }).join("") + "</ul>", ' id="speed-panel"');
  }

  function freePanel(ctx) {
    var extras = ctx.assign.extras || [];
    var haveTail = extras.filter(function (m) { return m.ability === data.A.PRANKSTER && m.moves.indexOf(data.M.TAILWIND) !== -1; })[0];
    var haveBreaker = extras.filter(function (m) { return data.aIn("moldBreaker", m.ability); })[0];
    var status = [haveTail, haveBreaker];
    var rows = kb.freeSlots.map(function (f, i) {
      var st = ctx.session ? (status[i] ? "ok" : "locked") : "info";
      var extra = "";
      if (i === 1 && status[i] && status[i].moves.indexOf(data.M.GASTRO_ACID) === -1) extra = " " + status[i].name + " does not know Gastro Acid yet.";
      return '<li class="check">' + H.mark(st) + '<div><div class="check-label">' + h(f.name) + (status[i] ? ' <span class="sub">in your party' + (status[i].name !== f.name ? ": " + h(status[i].name) : "") + "</span>" : "") + "</div>" +
        '<div class="check-detail">' + H.teach(h(f.how) + " " + h(f.why), "", "span") + h(extra) + "</div></div></li>";
    }).join("");
    var tail = data.withAbility(data.A.PRANKSTER).filter(function (r) { return data.knowsByLevel(r.id, r.form, data.M.TAILWIND) != null; });
    var breakers = [];
    data.set("as", "moldBreaker").forEach(function (a) { data.withAbility(a).forEach(function (r) { if (!/mega|gigantamax/.test(data.form(r.id, r.form).key)) breakers.push(r); }); });
    return H.panel("The two free slots", '<ul class="checks">' + rows + "</ul>" +
      H.details("free-tail", "Prankster with Tailwind (" + tail.length + ")", '<div class="chips">' + tail.map(function (r) { return H.monChip(r.id, r.form, r.slot === 2 ? "hidden ability" : ""); }).join("") + "</div>") +
      H.details("free-breaker", "Mold Breaker, Teravolt or Turboblaze (" + breakers.length + ")", '<div class="chips">' + breakers.map(function (r) { return H.monChip(r.id, r.form, r.slot === 2 ? "hidden ability" : ""); }).join("") + "</div>") +
      H.details("free-gastro", "Gastro Acid by level-up", '<div class="chips">' + data.learners(data.M.GASTRO_ACID).map(function (l) { return H.monChip(l.id, 0, adv.lvlLabel(l.lvl), l.lvl < 0); }).join("") + "</div>"));
  }

  function troublePanel() {
    return H.panel("Troubleshooting", kb.troubleshooting.map(function (t, i) {
      var body = '<p class="note">' + h(t.intro) + "</p>" + (t.list ? '<ol class="numbered">' + t.list.map(function (x) { return "<li><div>" + h(x) + "</div></li>"; }).join("") + "</ol>" : "");
      return H.details("tr-" + i, h(t.q), body, "big");
    }).join(""));
  }

  ui.views.run = function (ctx) {
    var r = adv.readiness(ctx);
    var warn = ctx.session && !r.ready ? H.callout("warn", "The synced team is not ready to run", r.open + " must-have" + (r.open === 1 ? "" : "s") + ' open. <button type="button" class="btn link" data-act="tab" data-tab="carry">See the Carry checklist</button>') : "";
    return '<div class="view-head"><p class="eyebrow">Phase 3</p><h1>Running</h1><p class="lede">Mega Gouot in slot 1, Teddiurk in slot 2, every wave a double. Three checks a wave; everything else is Run. The goal from here is Speed: ' + util.fmt(kb.SPEED_TARGET) + ' on both Gouot and Jynxgigas by the end.</p></div>' + warn +
      '<div class="cols"><div class="col">' + nowPanel(ctx) + bossPanel(ctx) + catchPanel() + troublePanel() + '</div><div class="col">' + speedPanel(ctx) + positionPanel(ctx) + shopPanel(ctx) + ui.carry.itemsPanel(ctx, "run") + freePanel(ctx) + "</div></div>";
  };

  ui.on("wave-next", function () {
    ui.state.run.wave = Math.min(99999, (Number(ui.state.run.wave) || 0) + 1);
    ui.state.run.gas = false; ui.state.run.want = false;
    ui.persist(); ui.render();
  });
  ui.on("boss-pick", function (t) {
    var id = Number(t.getAttribute("data-id"));
    ui.state.run.boss = ui.state.run.boss === id ? 0 : id;
    ui.state.run.bossSteps = {};
    ui.persist(); ui.render();
  });
  ui.on("boss-reset", function () { ui.state.run.bossSteps = {}; ui.persist(); ui.render(); });
  ui.bind("run", function (path) {
    if (path === "run.wave") { ui.state.run.gas = false; ui.state.run.want = false; }
  });
})();
