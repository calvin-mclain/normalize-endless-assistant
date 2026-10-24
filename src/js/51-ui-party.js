/* Phase 1: party building. */
(function () {
  "use strict";
  var ui = NZ.ui, util = NZ.util, data = NZ.data, kb = NZ.kb, adv = NZ.advisor, h = util.esc, H = ui.html;

  var STATE_PILL = { ok: ["ready", "ok"], locked: ["locked", "todo"], manual: ["check", "quiet"], no: ["no", "bad"], info: ["note", "info"] };

  function budgetPanel(ctx) {
    var b = adv.budget(ctx.roster, ctx.system, ui.state.reductions);
    var cells = 15, on = Math.min(15, Math.ceil(b.total));
    var bar = '<span class="segbar ' + (b.over ? "over" : "go") + '" style="height:14px" aria-hidden="true">';
    for (var i = 0; i < cells; i++) bar += "<i" + (i < on ? ' class="on"' : "") + "></i>";
    bar += "</span>";
    var rows = b.rows.map(function (r) {
      var sp = data.sp(r.id);
      var control = r.fromSave ? '<span class="num">' + r.reductions + " of 2</span>" : H.stepper("reductions." + r.role, r.reductions, 0, 2);
      var candy = r.nextCost == null ? "fully reduced" : "next: " + r.nextCost + " candies" + (r.candy != null ? " (you have " + r.candy + ")" : "");
      return '<li class="budget-row"><div class="b-name"><strong>' + h(sp.n) + '</strong> <span class="who">' + h(kb.roles[r.role].name) + '</span></div><div class="b-base"><span class="lbl">Base</span><span class="num">' + r.base +
        '</span></div><div class="b-red"><span class="lbl">Reductions</span>' + control + '</div><div class="b-cost"><span class="lbl">Cost</span><strong class="num">' + r.cost + '</strong></div><div class="b-next sub">' + candy + "</div></li>";
    }).join("");
    var verdict = b.over
      ? H.callout("warn", b.total + " of 15 points: " + b.over + " over", "Fully reduced, this team costs " + b.floor + ". " + H.teach("Buy candy cost reductions until the six fit. Each reduction takes 1 point off a starter that costs more than 1, then halves it.", "", "span"))
      : H.callout("good", b.total + " of 15 points: the team fits", b.total < 15 ? (15 - b.total) + " to spare." : "Exactly on the limit.");
    return H.panel("Starter points", '<div class="meter"><div class="meter-top"><span>Endless gives you 15 starter points</span><strong class="num">' + b.total + " / 15</strong></div>" + bar + "</div>" + verdict +
      '<ul class="budget">' + rows + "</ul>",
      ctx.system ? "reductions read from your save" : "set your reductions by hand, or sync");
  }

  function checkRow(role, c) {
    var st = c.state;
    var manualOn = st === "manual" && ui.state.unlocks[role] && ui.state.unlocks[role][c.id];
    var shown = manualOn ? "ok" : st;
    var markHtml = st === "manual"
      ? H.mark(shown, 'data-act="unlock" data-role="' + role + '" data-id="' + h(c.id) + '" aria-pressed="' + !!manualOn + '" title="Tick when you have it"')
      : H.mark(shown);
    // the detail is the reason when the check passes (teaching), and the problem when it does not (state)
    var why = st === "ok" || st === "manual";
    return '<li class="check">' + markHtml + '<div><div class="check-label">' + h(c.label) + (st === "locked" ? " " + H.pill("locked", "todo") : "") + (st === "no" ? " " + H.pill("does not fit", "bad") : "") +
      "</div>" + (c.detail ? '<div class="check-detail' + (why ? " teach" : "") + '">' + h(c.detail) + "</div>" : "") + "</div></li>";
  }

  function roleCard(role, ctx) {
    var id = ctx.roster[role], sp = data.sp(id), need = kb.needs[role];
    var formIndex = adv.roleForm(role, id);
    var alts = adv.alternatives(role);
    var options = alts.map(function (a) {
      var label = data.name(a.id, a.form) + (data.sp(a.id).c ? " · " + data.sp(a.id).c + " pts" : "") + (a.note ? " · " + a.note : "");
      return '<option value="' + a.id + '"' + (a.id === id ? " selected" : "") + ">" + h(label) + "</option>";
    }).join("");
    if (!alts.some(function (a) { return a.id === id; })) options = '<option value="' + id + '" selected>' + h(sp.n) + "</option>" + options;
    var checks = adv.starterChecks(role, id, ctx.system);
    var open = checks.filter(function (c) { return c.state === "locked" || c.state === "no"; }).length;
    var todoManual = checks.filter(function (c) { return c.state === "manual" && !(ui.state.unlocks[role] && ui.state.unlocks[role][c.id]); }).length;
    var status = open ? H.pill(open + " to fix", "todo") : todoManual ? H.pill(todoManual + " to confirm", "quiet") : H.pill("ready", "ok");
    return '<article class="role-card"><div class="role-top"><span class="role-name">' + h(kb.roles[role].name) + "</span>" + status + "</div>" +
      '<label class="field"><span class="sr">Starter for ' + h(kb.roles[role].name) + '</span><select id="pick-' + role + '" data-bind="roster.' + role + '" data-num="1">' + options + "</select></label>" +
      '<div class="mon-id">' + H.typeChips(data.form(id, formIndex).types) + '<span class="cost num">' + (sp.c || "–") + " pts</span>" + (sp.k !== kb.roles[role].pick ? H.pill("alternative", "info") : "") + "</div>" +
      H.teach(h(kb.roles[role].job), "role-job") +
      '<ul class="checks">' + checks.map(function (c) { return checkRow(role, c); }).join("") + "</ul>" +
      (need.altNote ? H.teach(h(need.altNote), "sub") : "") + "</article>";
  }

  function teamPanel() {
    var rows = ["staller", "runner", "partner", "killer"].map(function (role) {
      var t = kb.finalTeam[role];
      var moves = t.moves.map(function (m) {
        var keys = Array.isArray(m) ? m : [m];
        return '<span class="chip move">' + keys.map(function (k) { return h(data.mv(data.M[k]).name); }).join(" or ") + "</span>";
      }).join("");
      var items = Object.keys(t.items).map(function (k) { return '<span class="chip">' + h(kb.itemInfo[k].name) + " <small>×" + t.items[k] + "</small></span>"; }).join("");
      return '<div class="team-row"><div class="row between"><span class="team-name">' + h(t.name) + '</span><span class="sub">' + h(t.made) + "</span></div>" +
        '<dl class="kv"><dt>Ability / passive</dt><dd>' + h(t.ability) + " / " + h(t.passive) + "</dd><dt>Nature</dt><dd>" + h(t.nature) + (t.tera ? " · Tera Ghost" : "") + "</dd></dl>" +
        '<div class="chips">' + moves + '</div><div class="chips">' + items + "</div>" + H.teach(h(t.why), "note") + "</div>";
    }).join("");
    return H.panel("What you are building toward", H.teach("Four fusions do everything; the last two slots stay free. In every fusion the Pokémon named first keeps its passive and nature, and the second gives its ability.", "note") +
      '<div class="team">' + rows + "</div>", "the final team", "", true);
  }

  function variantsPanel() {
    var body = kb.variants.map(function (v) {
      return '<div><div class="check-label">' + h(v.name) + '</div><div class="note">' + h(v.change) + " " + h(v.trade) + "</div></div>";
    }).join("");
    return H.panel("Variants", body, "if you are missing an unlock", "", true);
  }

  ui.views.party = function (ctx) {
    var syncNote = ctx.system
      ? H.teach(H.callout("good", "Unlocks read from your save", "Passives, hidden abilities, natures, egg moves, IVs and candy counts below come from the system save synced " + h(util.ago(ui.game.at)) + "."), "", "div")
      : H.teach(H.callout("plain", "Check your unlocks automatically", 'Sync your save and every tick below fills itself in from your real unlocks. <button type="button" class="btn link" data-act="tab" data-tab="sync">Open Sync</button>'), "", "div");
    var cards = kb.ROLE_ORDER.map(function (role) { return roleCard(role, ctx); }).join("");
    return '<div class="view-head"><p class="eyebrow">Phase 1</p><h1>Party building</h1><p class="lede">Six starters chosen for their passives. Unlock every passive and hidden ability before the run starts: they do not unlock mid-run. Keep the first four unevolved until their fusions.</p></div>' +
      syncNote + budgetPanel(ctx) + '<div class="grid-3">' + cards + "</div>" + '<div class="cols"><div class="col">' + teamPanel() + '</div><div class="col">' + variantsPanel() +
      '<div class="row"><button type="button" class="btn primary" data-act="tab" data-tab="carry">Team picked: go to Carry</button></div></div></div>';
  };

  ui.on("unlock", function (t) {
    var role = t.getAttribute("data-role"), id = t.getAttribute("data-id");
    var u = ui.state.unlocks[role] || (ui.state.unlocks[role] = {});
    if (u[id]) delete u[id]; else u[id] = true;
    ui.persist(); ui.render();
  });
})();
