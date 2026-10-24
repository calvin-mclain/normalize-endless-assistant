/* Pieces shared by the Carry and Running views: the current wave, the lure picture and the scout box. */
(function () {
  "use strict";
  var ui = NZ.ui, util = NZ.util, data = NZ.data, kb = NZ.kb, adv = NZ.advisor, h = util.esc, H = ui.html;

  var ALERT_PILL = { shiny: ["shiny", "shiny"], want: ["catch", "ok"], maybe: ["check", "info"], item: ["item", "todo"], info: ["note", "quiet"] };
  var KIND_PILL = { normal: "quiet", x0: "todo", paradox: "bad", eternatus: "bad", eternamax: "bad" };

  function itemList(items) {
    var keys = Object.keys(items || {});
    if (!keys.length) return "";
    return keys.map(function (k) {
      var name = kb.itemInfo[k] ? kb.itemInfo[k].name : k.toLowerCase().replace(/_/g, " ").replace(/\b\w/g, function (c) { return c.toUpperCase(); });
      return h(name) + (items[k] > 1 ? " ×" + items[k] : "");
    }).join(", ");
  }

  function waveLine(session) {
    var info = adv.waveInfo(session.wave);
    return '<div class="wave-line"><span class="wave-num">Wave ' + util.fmt(session.wave) + "</span>" + H.pill(adv.kindLabel(info.kind), KIND_PILL[info.kind]) +
      '<span class="sub">' + h(data.biomeName(session.biome)) + " · " + (session.double ? "double battle" : "single battle") + (session.endless ? "" : " · not an Endless run") + "</span></div>";
  }

  function hiddenLine(e) {
    if (!e.known) return "";
    var moves = e.moves.map(function (m) { return H.moveChip(m); }).join("");
    return '<div class="sub">Ability ' + H.ab(e.ability) + (e.passiveOn ? " · passive " + H.ab(e.passive) : "") + (e.stats.length ? ' · Speed <span class="num">' + util.short(e.stats[5]) + "</span>" : "") + '</div><div class="chips">' + moves + "</div>";
  }

  function foeCard(enemy, scan, ctx) {
    var tags = "";
    if (enemy.shiny) tags += " " + H.pill("shiny", "shiny");
    if (enemy.boss) tags += " " + H.pill("boss" + (enemy.segments ? " · " + enemy.segments + " bars" : ""), "bad");
    if (enemy.fusion) tags += " " + H.pill("fusion", "info");
    var items = itemList(enemy.items);
    var alerts = scan.alerts.map(function (a) {
      var p = ALERT_PILL[a.sev] || ALERT_PILL.info;
      return '<li class="alert">' + H.pill(p[0], p[1]) + "<span>" + h(a.text) + (a.advice ? " " + H.teach(h(a.advice), "", "span") : "") + "</span></li>";
    }).join("");
    return '<div class="foe' + (scan.wanted ? " wanted" : scan.steal ? " steal" : "") + '"><div class="foe-top">' + H.monHead(enemy) + tags + "</div>" +
      (items ? '<div class="sub">Holds: ' + items + "</div>" : "") + (ctx.peek ? hiddenLine(enemy) : "") +
      (alerts ? '<ul class="alerts">' + alerts + "</ul>" : '<div class="sub">Nothing for the build.</div>') +
      '<div><button type="button" class="btn link" data-act="scout" data-id="' + enemy.species + '" data-form="' + enemy.form + '">Species details</button></div></div>';
  }

  function ruler(wave) {
    var start = Math.floor((wave - 1) / 50) * 50 + 1;
    var cells = "";
    for (var i = 0; i < 50; i++) {
      var w = start + i;
      var cls = w === wave ? "now" : w % 50 === 0 ? "forced" : w % 10 === 0 ? "x0" : w < wave ? "past" : "";
      cells += "<i" + (cls ? ' class="' + cls + '"' : "") + ' title="Wave ' + w + '"></i>';
    }
    var labels = "";
    for (var l = 0; l <= 5; l++) labels += "<span>" + util.fmt(l === 0 ? start : start + l * 10 - 1) + "</span>";
    return '<div class="ruler" role="img" aria-label="Position in the 50-wave cycle: wave ' + wave + " of " + start + " to " + (start + 49) + '"><div class="ruler-cells">' + cells +
      '</div><div class="ruler-labels">' + labels + '</div><div class="legend"><span><i class="now"></i>current wave</span><span><i class="x0"></i>X0 boss wave</span><span><i class="forced"></i>forced boss (no flee, no catch)</span></div></div>';
  }

  function odds(p) { return p >= 1 ? "guaranteed" : p <= 0 ? "never" : p === 0.5 ? "1 in 2" : "1 in " + Math.round(1 / p); }

  function lurePanel(ctx, phase) {
    var body = "";
    if (ctx.session) {
      var ls = adv.lureStatus(ctx.session);
      var slots = ls.field.map(function (f, i) {
        var lures = f.lures.length ? f.lures.map(function (a) { return H.ab(a); }).join(" + ") : "no lure";
        return '<div class="slot' + (f.fainted ? " off" : "") + '"><span class="slot-n">Slot ' + (i + 1) + (f.fainted ? " · fainted" : "") + "</span><strong>" + h(f.member.name) + "</strong><span class=\"sub\">" + lures + "</span></div>";
      }).join("");
      if (ls.field.length === 1) slots += '<div class="slot off"><span class="slot-n">Slot 2</span><strong>not on the field</strong><span class="sub">single battle: only slot 1 counts</span></div>';
      var itemTxt = ls.items.length ? ls.items.map(function (l) { return h(l.tier.replace(/_/g, " ").toLowerCase().replace(/\b\w/g, function (c) { return c.toUpperCase(); })) + " (" + l.left + " battles left)"; }).join(", ") : "no lure item";
      var next = ls.next;
      var nextInfo = adv.waveInfo(next);
      var nextText = nextInfo.forced ? "a forced single boss" : odds(ls.nextChance) + (ls.nextChance >= 1 ? " double" : " for a double");
      body += '<div class="slots">' + slots + "</div>" +
        '<dl class="kv"><dt>Lure sources</dt><dd class="num">' + ls.count + " (" + ls.sources.length + " on the field, " + ls.items.length + " item" + (ls.items.length === 1 ? "" : "s") + ")</dd><dt>Bag</dt><dd>" + itemTxt +
        "</dd><dt>Wave " + util.fmt(next) + "</dt><dd>" + nextText + "</dd><dt>At this count</dt><dd>normal waves " + odds(ls.normalChance) + ", X0 waves " + odds(ls.x0Chance) + "</dd></dl>";
      if (ls.field.some(function (f) { return f.fainted; })) body += H.callout("warn", "A fainted Pokémon's lures do not count", "Revive it before the battle ends.");
    } else {
      body += H.teach("Each lure source on the field when a battle ends divides the odds by 4: a lure ability, a lure passive, or a lure item tier in the bag. The roll uses slot 1, plus slot 2 after a double.", "note") +
        '<div class="table-wrap"><table><thead><tr><th>Sources</th><th>Normal wave</th><th>X0 wave</th></tr></thead><tbody>' +
        [0, 1, 2, 3].map(function (n) { return '<tr><th class="num">' + n + "</th><td>" + odds(adv.doubleChance(1, n)) + "</td><td>" + odds(adv.doubleChance(10, n)) + "</td></tr>"; }).join("") + "</tbody></table></div>";
    }
    // the Running tab has no lure panel: once both fusions are out every wave is a double, and the verdict warns when Gouot is not in slot 1
    if (phase === "carry") {
      body += '<ul class="bullets teach"><li><strong>Regigigas in slot 1,</strong> Pumpkaboo or Gourgeist in slot 2 for its Illuminate.</li><li>Regigigas has no lure, so until the fast lure fusion lands, Illuminate is the only source: normal waves 1 in 2, X0 waves 1 in 8. A lure item in the bag is one more source while it lasts (normal waves guaranteed, X0 waves 1 in 2). Take a lure when the shop offers one; two tiers at once make X0 waves doubles too. Once Gourgeist has No Guard as well, normal waves are guaranteed without one.</li><li>After a single battle only slot 1 is out, so the next wave rolls without the Illuminate in slot 2.</li></ul>';
    } else {
      body += '<ul class="bullets teach"><li><strong>Mega Gouot in slot 1, Teddiurk in slot 2.</strong> Three sources guarantee every wave, X0 included.</li><li>After a forced boss only Gouot is out; its two sources still guarantee the next normal wave, so the chain restarts by itself.</li><li>No lure item is needed. If Teddiurk fainted or was switched out, an X0 wave is 1 in 2 for one wave and the chain picks up again.</li></ul>';
    }
    return H.panel("Doubles chain", body, "lure sources on the field");
  }

  function scoutCard(id, formIndex, ctx, phase) {
    var sp = data.sp(id);
    if (!sp) return "";
    var f = data.form(id, formIndex);
    var subject = { species: id, form: formIndex, level: 0, items: {}, passiveOn: false };
    var matches = adv.scout(subject, ctx, false);
    var abilities = f.abilities.map(function (a, i) { return a ? H.ab(a) + (i === 2 ? ' <span class="sub">(hidden)</span>' : "") : null; }).filter(Boolean);
    var seen = {};
    abilities = abilities.filter(function (x) { if (seen[x]) return false; seen[x] = 1; return true; });
    var lm = data.levelMoves(id, formIndex).slice().sort(function (a, b) { return a[0] - b[0]; });
    var moveChips = lm.map(function (p) { return '<span class="chip' + (p[0] < 0 ? " weak" : "") + '">' + h(data.mv(p[1]).name) + " <small>" + h(adv.lvlLabel(p[0])) + "</small></span>"; }).join("");
    var dex = "";
    if (ctx.system) dex = ctx.system.caught.indexOf(id) !== -1 ? H.pill("in your dex", "ok") : H.pill("not caught yet", "todo");
    var forms = "";
    if (sp.f && sp.f.length > 1) {
      forms = '<div class="chips">' + sp.f.map(function (ff, i) {
        return '<button type="button" class="chip' + (i === formIndex ? " have" : "") + '" data-act="scout" data-id="' + id + '" data-form="' + i + '">' + h(ff[1] || "Base") + "</button>";
      }).join("") + "</div>";
    }
    var list = matches.length ? '<ul class="alerts">' + matches.map(function (m) {
      return '<li class="alert">' + H.pill(m.weak ? "no" : m.kind === "fuse" ? "fusion" : m.kind === "carbos" ? "carbos" : "move", m.weak ? "quiet" : "ok") + "<span>" + h(m.text) + "</span></li>";
    }).join("") + "</ul>" : '<p class="sub">Nothing on your open splice steps needs this species.</p>';
    var boss = adv.bossNotes(adv.describe({ species: id, form: formIndex, passiveOn: true, boss: true }, false), {});
    var threat = boss.notes.filter(function (n) { return n.sev === "danger" || n.sev === "care"; }).slice(0, 4).map(function (n) {
      return '<li class="alert">' + H.pill(n.sev === "danger" ? "danger" : "care", n.sev === "danger" ? "bad" : "todo") + "<span><strong>" + h(n.title) + ".</strong> " + h(n.text) + "</span></li>";
    }).join("");
    return '<div class="foe"><div class="foe-top"><span class="foe-name">' + h(data.name(id, formIndex)) + "</span>" + H.typeChips(f.types) + dex + (sp.c ? '<span class="sub num">starter · ' + sp.c + " pts</span>" : "") + "</div>" + forms +
      '<dl class="kv"><dt>Abilities</dt><dd>' + abilities.join(", ") + "</dd><dt>Passive</dt><dd>" + H.ab(data.passive(id, formIndex)) + " " + H.teach("(bosses and unlocked starters only)", "sub", "span") + '</dd><dt>Base Speed</dt><dd class="num">' + f.stats[5] + "</dd></dl>" +
      '<h3 class="h">Use in the build</h3>' + list +
      (threat ? H.details("scout-threat", "As a boss", '<ul class="alerts">' + threat + "</ul>") : "") +
      H.details("scout-moves", "Level-up moves (" + lm.length + ")", '<div class="chips">' + moveChips + "</div>" + H.teach("Wild Pokémon only know level-up moves. A fused Pokémon can relearn any of these with a Memory Mushroom.", "sub")) + "</div>";
  }

  /** Body of the Pokédex popover: a search box, its hits, and the card for the chosen species. */
  ui.dexView = function (ctx) {
    var st = ui.state, phase = st.tab === "run" ? "run" : "carry";
    var card = st.scout ? scoutCard(st.scout, st.scoutForm || 0, ctx, phase) : H.teach("Type a species name, or click any Pokémon on the page. The card says what it offers: moves for an open splice step, a Sturdy or lure ability, or a free-slot role. From game data, no sync needed.", "sub");
    return '<div class="dex-b"><label class="field" for="scout-q">Species<input type="search" id="scout-q" data-live="scout" autocomplete="off" placeholder="Throh, Golurk, Garganacl…"></label><div id="scout-hits" class="chips"></div><div id="scout-card">' + card + "</div></div>";
  };

  ui.live("scout", function (input) {
    var box = document.getElementById("scout-hits");
    if (!box) return;
    var hits = data.search(input.value, 10);
    box.innerHTML = hits.map(function (x) { return H.monChip(x.id, 0); }).join("");
  });
  ui.on("scout", function (t) {
    ui.state.scout = Number(t.getAttribute("data-id")) || 0;
    ui.state.scoutForm = Number(t.getAttribute("data-form")) || 0;
    ui.openDex(false);
    var d = document.getElementById("dex");
    if (d) d.scrollTop = 0;
  });

  ui.field = { waveLine: waveLine, foeCard: foeCard, ruler: ruler, lurePanel: lurePanel, itemList: itemList, odds: odds };
})();
