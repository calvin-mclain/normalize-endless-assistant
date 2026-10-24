/* Phase 2: the carry phase and its splice list. */
(function () {
  "use strict";
  var ui = NZ.ui, util = NZ.util, data = NZ.data, kb = NZ.kb, adv = NZ.advisor, h = util.esc, H = ui.html, F = ui.field;

  function nowPanel(ctx) {
    var s = ctx.session;
    if (!s) {
      return H.panel("This wave", H.callout("plain", "Nothing synced yet",
        H.teach("With a synced save this panel lists the wild Pokémon in front of you and flags the ones the build needs: a move for an open splice step, a Sturdy or lure ability, or Carbos to dump. ", "", "span") +
        '<button type="button" class="btn link" data-act="tab" data-tab="sync">Set up sync</button> or <button type="button" class="btn link" data-act="sample" data-sample="carry">look at a sample wave</button>.'), "");
    }
    var info = adv.waveInfo(s.wave);
    var scans = s.enemies.map(function (e) { return adv.scanEnemy(e, ctx, "carry"); });
    var foes = s.enemies.map(function (e, i) { return F.foeCard(e, scans[i], ctx); }).join("");
    var wanted = scans.filter(function (x) { return x.wanted; }).length;
    var candy = scans.filter(function (x) { return x.candyWant; }).length;
    var order = adv.catchOrder(s.enemies, scans);
    var firstName = order.length > 1 && (scans[order[0]].wanted || scans[order[0]].candyWant) && (scans[order[1]].wanted || scans[order[1]].candyWant) ? s.enemies[order[0]].name : "";
    var head = wanted ? H.callout("shiny", wanted === 1 ? "One of these is worth catching" : wanted + " of these are worth catching",
        (firstName ? h(firstName) + " first: more unlocks left to buy, or fewer candies. " : "") + "Catch before Regigigas knocks it out. Balls cannot be thrown while two wild Pokémon are on the field: remove the other one first.")
      : candy ? H.callout("plain", candy === 1 ? "One of these is worth a catch for its candies" : candy + " of these are worth a catch for their candies",
        (firstName ? h(firstName) + " first: more unlocks left to buy, or fewer candies. " : "") + "Its starter still has something to buy and is short of candies. You are fighting this wave anyway, so a catch costs little and brings a shop.")
      : "";
    var forced = info.forced ? H.callout("danger", adv.kindLabel(info.kind), "A forced single boss: no fleeing, no catching. Regigigas handles it during the carry phase.") : "";
    var next = '<p class="sub">Next forced boss: wave ' + util.fmt(info.nextForced) + " (" + h(adv.kindLabel(info.nextForcedKind)) + ")" + (info.toForced ? ", in " + info.toForced + " waves." : ", now.") + "</p>";
    return H.panel("This wave", F.waveLine(s) + forced + head + '<div class="foes">' + (foes || '<p class="sub">No wild Pokémon in this save.</p>') + "</div>" + next,
      "synced " + h(util.ago(ui.game.at)));
  }

  function carryKit(ctx) {
    var m = ctx.assign.byRole.carry;
    var kit = [
      { keys: ["ROCK_SLIDE", "LANDS_WRATH"], label: "Rock Slide (TM) or Land's Wrath", why: "spread move for doubles; Land's Wrath is stronger, and Ground-type when Neutralizing Gas turns Normalize off" },
      { keys: ["STORM_THROW", "DARKEST_LARIAT"], label: "Storm Throw or Darkest Lariat", why: "single targets" },
      { keys: ["ENDURE"], label: "Endure (TM)", why: "survive a hit and collect berry boosts" },
      { keys: ["ENTRAINMENT", "PROTECT"], label: "Protect, until Entrainment arrives", why: "the last slot is held for Entrainment" }
    ];
    var rows = kit.map(function (k) {
      var st = m ? (k.keys.some(function (key) { return adv.knows(m, key); }) ? "ok" : "locked") : "manual";
      return '<li class="check">' + H.mark(st === "manual" ? "info" : st) + '<div><div class="check-label">' + h(k.label) + '</div><div class="check-detail teach">' + h(k.why) + "</div></div></li>";
    }).join("");
    var name = m ? m.name : data.sp(ctx.roster.carry).n;
    var merged = ctx.assign.flags.carry && ctx.assign.flags.carry.mergedInto;
    if (merged) return H.panel("Carry kit", H.callout("good", "The carry is fused", "It now lives inside " + h(ctx.assign.flags.carry.member.name) + ". You are past the carry phase."), "");
    return H.panel("Carry kit", '<ul class="checks">' + rows + "</ul>" + H.teach(h(name) + " should clear every double by itself. Abuse Endure; skip Rare Candies and Candy Jars.", "note"), h(name));
  }

  function candidateHtml(step, ctx) {
    var c = adv.stepCandidates(step, ctx), out = "";
    if (c.own.length) out += '<ul class="bullets">' + c.own.map(function (t) { return "<li>" + h(t) + "</li>"; }).join("") + "</ul>";
    c.groups.forEach(function (g) {
      if (!g.rows.length) return;
      out += '<div><div class="group-title">' + h(g.title) + " (" + g.rows.length + ')</div><div class="chips">' +
        g.rows.map(function (r) { return H.monChip(r.id, r.form, r.sub, r.weak || g.weak); }).join("") + "</div></div>";
    });
    if (step.kind === "learn" && !step.from) out += H.teach("A wild one may not have the move in its four. Fused, your Pokémon can relearn it from the partner's level-up list with a Memory Mushroom.", "sub");
    return out || '<p class="sub">No candidates in the data.</p>';
  }

  function stepRow(step, index, ctx) {
    var eff = adv.effectiveStep(step, ctx);
    var done = eff.state === "done";
    var src = eff.source === "manual" ? H.pill("ticked by hand", "quiet") + (ctx.session ? ' <button type="button" class="btn link" data-act="step-reset" data-id="' + step.id + '">use save</button>' : "")
      : "";
    var detail = eff.auto.detail ? '<div class="step-detail' + (eff.auto.problem ? " alert" : "") + '">' + h(eff.auto.detail) + "</div>" : "";
    var bar = eff.auto.progress ? '<div class="row"><span class="num sub">' + eff.auto.progress[0] + " / " + eff.auto.progress[1] + "</span>" + H.segbar(eff.auto.progress[0], eff.auto.progress[1], "go") + "</div>" : "";
    var openId = "cand-" + step.id;
    var label = step.kind === "learn" ? "Who has it" : step.kind === "fuse" ? "Fusion partners" : "How";
    var cand = done ? "" : '<details data-open-id="' + openId + '" data-lazy="1"' + (ui.state.open[openId] ? " open" : "") + "><summary>" + label + '</summary><div class="details-body">' + (ui.state.open[openId] ? candidateHtml(step, ctx) : "") + "</div></details>";
    return '<li class="step' + (done ? " done" : "") + '">' +
      H.mark(done ? "ok" : "todo", 'data-act="step-toggle" data-id="' + step.id + '" aria-pressed="' + done + '" aria-label="' + h(step.title) + (done ? ": done" : ": to do") + '"') +
      '<div><div class="step-title"><span class="step-n">' + (index + 1) + '</span><span class="who">' + h(kb.roles[step.who].name) + '</span><span class="t">' + h(step.title) + "</span>" +
      (step.rare ? H.pill("rare carrier", "todo") : "") + (step.sketch ? H.pill("can be sketched", "quiet") : "") + src + "</div>" +
      (done ? "" : '<div class="step-how teach">' + h(step.how) + "</div>") + detail + bar + cand + "</div></li>";
  }

  function splicePanel(ctx) {
    var done = kb.steps.filter(function (s) { return adv.effectiveStep(s, ctx).state === "done"; }).length;
    var rows = kb.steps.map(function (s, i) { return stepRow(s, i, ctx); }).join("");
    return H.panel("Splice list", '<div class="meter"><div class="meter-top"><span>' + H.teach("In the guide's priority order. A rarer carrier jumps the queue when it shows up.", "", "span") + '</span><strong class="num">' + done + " / " + kb.steps.length + "</strong></div>" +
      '<span class="segbar go" aria-hidden="true">' + kb.steps.map(function (s) { return "<i" + (adv.effectiveStep(s, ctx).state === "done" ? ' class="on"' : "") + "></i>"; }).join("") + "</span></div>" +
      H.teach("Unsplice means: fuse, learn the move, unfuse. The first Pokémon keeps its passive; the second gives its ability and is used up.", "note") + '<ol class="steps">' + rows + "</ol>",
      ctx.session ? "ticks follow your save" : "tick by hand, or sync");
  }

  /** Item targets for the final team. phase: "carry" or "run"; the Running tab shows the same counts so eggs can be tracked without switching back. */
  function itemsPanel(ctx, phase) {
    var audit = adv.itemAudit(ctx);
    var all = audit.roles.reduce(function (acc, r) { return acc.concat(r.rows); }, []).concat(audit.bag);
    var left = all.filter(function (row) { return !row.done; });
    var onlyOpen = phase === "run"; // while running, list only what is still to collect
    function show(row) { return !onlyOpen || !row.done; }
    var roles = audit.roles.filter(function (r) { return r.rows.some(show); }).map(function (r) {
      var rows = r.rows.filter(show).map(function (row) {
        var count = audit.synced ? '<span class="cnt">' + row.have + " / " + row.target + "</span>" : H.stepper("items." + r.role + ":" + row.key, row.have, 0, row.target);
        return '<div class="audit-row' + (row.done ? " done" : "") + '" title="' + h(row.why) + '"><span>' + h(row.name) + (row.note ? ' <span class="sub">' + h(row.note) + "</span>" : "") + "</span>" + count + H.segbar(row.have, row.target, "go") + "</div>";
      }).join("");
      return '<div class="audit-role"><div class="row between"><strong>' + h(r.name) + '</strong><span class="who">' + h(kb.roles[r.role].name) + "</span></div>" + rows + "</div>";
    }).join("");
    var bag = audit.bag.filter(show).map(function (b) {
      var count = audit.synced ? '<span class="cnt">' + b.have + " / " + b.target + "</span>" : H.stepper("items.bag:" + b.key, b.have, 0, b.target);
      return '<div class="audit-row' + (b.done ? " done" : "") + '" title="' + h(b.why) + '"><span>' + h(b.name) + (b.note ? ' <span class="sub">' + h(b.note) + "</span>" : "") + "</span>" + count + H.segbar(b.have, b.target, "go") + "</div>";
    }).join("");
    var balls = audit.balls && !(onlyOpen && audit.balls.master >= 50) ? '<div class="audit-row' + (audit.balls.master >= 50 ? " done" : "") + '"><span>Master Balls <span class="sub">about 50 before running</span></span><span class="cnt">' + audit.balls.master + " / 50</span>" + H.segbar(audit.balls.master, 50, "go") +
      '</div><div class="audit-row"><span>Rogue Balls</span><span class="cnt">' + audit.balls.rogue + "</span><span></span></div>" : "";
    var meter = '<div class="meter"><div class="meter-top"><span>' + (left.length ? (onlyOpen ? "Still to collect while you run; the rest is met." : "Still to collect: " + left.map(function (row) { return h(row.name); }).join(", ")) : "Every item target is met.") +
      '</span><strong class="num">' + (all.length - left.length) + " / " + all.length + "</strong></div>" + H.segbar(all.length - left.length, all.length, "go") + "</div>";
    var note = phase === "run" ? H.teach("Eggs and Grip Claws come off wild Pokémon only: Thief or Mini Black Hole whatever carries one, or catch it. Vitamins cannot be stolen; Carbos come through fuse-and-dump.", "sub")
      : H.teach("Don't wait for every egg: start running and keep stealing. Grip Claws only work on attacking moves, so they belong on whoever attacks, not on Jynxgigas.", "sub");
    var bagBlock = bag || balls ? '<div class="audit-role"><div class="row between"><strong>Bag</strong></div>' + bag + balls + "</div>" : "";
    return H.panel("Items", meter + (roles || bagBlock ? '<div class="audit">' + roles + bagBlock + "</div>" : "") + note,
      audit.synced ? "counted from your save" : "set counts by hand, or sync", ' id="items-' + (phase || "carry") + '"');
  }

  function readyPanel(ctx) {
    var r = adv.readiness(ctx);
    function rows(level) {
      return r.rows.filter(function (x) { return x.level === level; }).map(function (x) {
        var st = x.state === "ok" ? "ok" : x.state === "todo" ? "locked" : "manual";
        return '<li class="check">' + H.mark(st) + '<div><div class="check-label">' + h(x.label) + "</div>" + (x.detail && x.state !== "ok" ? '<div class="check-detail">' + h(x.detail) + "</div>" : "") + "</div></li>";
      }).join("");
    }
    var head = r.ready ? H.callout("good", "Ready to run", "Every must-have is in place.")
      : r.known ? H.callout("warn", r.open + " must-have" + (r.open === 1 ? "" : "s") + " open", H.teach("Regigigas can carry well past wave 2000 if you need longer, but the earlier you run the better.", "", "span"))
        : H.teach(H.callout("plain", "Sync to check this for you", "Without a save, tick the splice list by hand and judge these yourself."), "", "div");
    return H.panel("Ready to run?", head + '<h3 class="h">Must have</h3><ul class="checks">' + rows("need") + '</ul><h3 class="h">Good to have</h3><ul class="checks">' + rows("nice") +
      '</ul><div class="row"><button type="button" class="btn primary" data-act="tab" data-tab="run">Start running</button></div>', "");
  }

  ui.views.carry = function (ctx) {
    return '<div class="view-head"><p class="eyebrow">Phase 2 · waves 1 to about 1000</p><h1>Carry</h1><p class="lede">Regigigas kills every double battle with one spread move while the other five learn their moves through fusions. The whole setup can be done by wave 1000.</p></div>' +
      '<div class="cols"><div class="col">' + nowPanel(ctx) + splicePanel(ctx) + '</div><div class="col">' + F.lurePanel(ctx, "carry") + carryKit(ctx) + F.scoutPanel(ctx, "carry") + itemsPanel(ctx, "carry") + readyPanel(ctx) + "</div></div>";
  };

  ui.on("step-toggle", function (t) {
    var id = t.getAttribute("data-id");
    var step = kb.steps.filter(function (s) { return s.id === id; })[0];
    if (!step) return;
    var eff = adv.effectiveStep(step, ui.context());
    var next = eff.state === "done" ? "todo" : "done";
    if (eff.auto.state === next) delete ui.state.splice[id]; else ui.state.splice[id] = next;
    ui.persist(); ui.render();
  });
  ui.lazy("cand", function (id) {
    var step = kb.steps.filter(function (s) { return "cand-" + s.id === id; })[0];
    return step ? candidateHtml(step, ui.context()) : "";
  });
  ui.on("step-reset", function (t) {
    delete ui.state.splice[t.getAttribute("data-id")];
    ui.persist(); ui.render();
  });

  ui.carry = { itemsPanel: itemsPanel, readyPanel: readyPanel };
})();
