/* Page state, rendering loop and the small HTML builders every view shares. */
NZ.ui = (function () {
  "use strict";
  var util = NZ.util, data = NZ.data, kb = NZ.kb, adv = NZ.advisor, h = util.esc;
  var STATE_KEY = "nz.state.v1", GAME_KEY = "nz.game.v1";
  var TABS = ["party", "carry", "run", "sync"];

  function defaultState() {
    return {
      v: 1, tab: "party",
      roster: adv.defaultRoster(),
      unlocks: {},            // role -> { checkId: true } ticked by hand
      reductions: {},         // role -> 0..2 candy cost reductions, when no save is synced
      splice: {},             // stepId -> "done" | "todo" ticked by hand
      items: {},              // "role:ITEM" -> count, when no save is synced
      open: {},               // which <details> are open
      run: { wave: 1001, gas: false, want: false, boss: 0, bossSteps: {}, rerolls: 0 },
      speed: { level: 2300, carbos: 31, soulDew: 10 },
      scout: 0, scoutForm: 0, // species (and form) shown in the scout card
      // density: "explain" shows the teaching prose (class "teach"); "compact" hides it and folds reference panels
      settings: { peek: false, sound: false, soundItems: false, gameUrl: "https://pokerogue.net/", density: "explain", hintedCompact: false }
    };
  }
  var DENSITIES = ["explain", "compact"];

  var state = defaultState();
  var game = { session: null, system: null, at: 0, via: "", sample: false };
  var views = {}, handlers = {}, binders = {}, liveInputs = {}, lazies = {};
  var saveTimer = null;

  function merge(base, extra) {
    if (!extra || typeof extra !== "object") return base;
    for (var k in base) {
      if (!Object.prototype.hasOwnProperty.call(extra, k)) continue;
      if (base[k] && typeof base[k] === "object" && !Array.isArray(base[k]) && k !== "roster") base[k] = shallow(base[k], extra[k]);
      else if (k === "roster") base[k] = cleanRoster(extra[k], base[k]);
      else if (typeof extra[k] === typeof base[k]) base[k] = extra[k];
    }
    return base;
  }
  function shallow(base, extra) {
    if (!extra || typeof extra !== "object") return base;
    var keys = Object.keys(base).length ? Object.keys(base) : Object.keys(extra);
    var out = {};
    for (var k in base) out[k] = base[k];
    if (!Object.keys(base).length) { for (var e in extra) out[e] = extra[e]; return out; }
    keys.forEach(function (k2) { if (Object.prototype.hasOwnProperty.call(extra, k2) && typeof extra[k2] === typeof base[k2]) out[k2] = extra[k2]; });
    return out;
  }
  function cleanRoster(r, fallback) {
    var out = {};
    kb.ROLE_ORDER.forEach(function (role) { out[role] = r && data.sp(r[role]) ? r[role] : fallback[role]; });
    return out;
  }

  function load() {
    state = merge(defaultState(), util.store.get(STATE_KEY, null));
    if (TABS.indexOf(state.tab) === -1) state.tab = "party";
    if (DENSITIES.indexOf(state.settings.density) === -1) state.settings.density = "explain";
    var g = util.store.get(GAME_KEY, null);
    if (g && typeof g === "object") {
      game.session = g.session && g.session.kind === "session" ? g.session : null;
      game.system = g.system && g.system.kind === "system" ? g.system : null;
      game.at = g.at || 0; game.via = g.via || ""; game.sample = false;
    }
  }
  function persist() {
    if (saveTimer) return;
    saveTimer = setTimeout(function () {
      saveTimer = null;
      util.store.set(STATE_KEY, state);
      if (!game.sample) util.store.set(GAME_KEY, { session: game.session, system: game.system, at: game.at, via: game.via });
    }, 250);
  }

  function context() {
    return adv.makeContext({
      session: game.session, system: game.system, roster: state.roster,
      manual: { splice: state.splice, items: state.items, reductions: state.reductions }, peek: state.settings.peek
    });
  }

  // ---- HTML builders -----------------------------------------------------------------------------------------------
  function typeChips(types) {
    return '<span class="types">' + types.filter(function (t) { return t >= 0; }).map(function (t) {
      return '<span class="type" style="--t:' + data.typeColor(t) + '">' + h(data.typeName(t)) + "</span>";
    }).join("") + "</span>";
  }
  function ab(id) {
    var a = data.ab(id);
    return '<span class="ab" title="' + h(a.desc) + '">' + h(a.name) + "</span>";
  }
  function pill(text, cls) { return '<span class="pill ' + (cls || "") + '">' + h(text) + "</span>"; }
  function moveChip(id, cls) { return '<span class="chip move ' + (cls || "") + '">' + h(data.mv(id).name) + "</span>"; }
  function monChip(id, form, sub, weak) {
    return '<button type="button" class="chip' + (weak ? " weak" : "") + '" data-act="scout" data-id="' + id + '" data-form="' + (form || 0) + '">' + h(data.name(id, form)) + (sub ? " <small>" + h(sub) + "</small>" : "") + "</button>";
  }
  var MARK_TEXT = { ok: "✓", no: "×", locked: "!", info: "i", manual: "", todo: "", unknown: "" };
  function mark(st, attrs) {
    var tag = attrs ? "button" : "span";
    return "<" + tag + ' class="mark ' + st + '"' + (attrs ? ' type="button" ' + attrs : ' aria-hidden="true"') + ">" + (MARK_TEXT[st] || "") + "</" + tag + ">";
  }
  /** Segmented bar, at most `max` cells (the boss-health look). */
  function segbar(have, target, cls) {
    var cells = Math.min(Math.max(target, 1), 10), on = target ? Math.round(Math.min(have / target, 1) * cells) : 0;
    if (have > 0 && on === 0) on = 1;
    var out = '<span class="segbar ' + (cls || "") + '" aria-hidden="true">';
    for (var i = 0; i < cells; i++) out += "<i" + (i < on ? ' class="on"' : "") + "></i>";
    return out + "</span>";
  }
  function details(id, summary, body, cls) {
    return '<details data-open-id="' + h(id) + '"' + (state.open[id] ? " open" : "") + (cls ? ' class="' + cls + '"' : "") + "><summary>" + summary + '</summary><div class="details-body">' + body + "</div></details>";
  }
  function compact() { return state.settings.density === "compact"; }
  /** Teaching prose: shown in Explain, hidden in Compact. `tag` defaults to a paragraph; `cls` is the usual text class. */
  function teach(html, cls, tag) {
    tag = tag || "p";
    return "<" + tag + ' class="teach' + (cls ? " " + cls : "") + '">' + html + "</" + tag + ">";
  }
  /** A panel. `ref` marks reference material (rules, background): in Compact its body folds behind a "Show" toggle. */
  function panel(title, body, meta, attrs, ref) {
    var cls = "panel" + (ref ? " ref" : "");
    if (ref && compact()) {
      var id = "ref-" + title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
      body = details(id, "Show", body);
    }
    return '<section class="' + cls + '"' + (attrs || "") + '><div class="panel-h"><h2>' + h(title) + "</h2>" + (meta ? '<span class="meta">' + meta + "</span>" : "") + '</div><div class="panel-b">' + body + "</div></section>";
  }
  function callout(kind, title, text) {
    return '<div class="callout ' + kind + '">' + (title ? '<div class="t">' + h(title) + "</div>" : "") + (text ? "<div>" + text + "</div>" : "") + "</div>";
  }
  function stepper(bind, value, min, max) {
    return '<span class="stepper"><button type="button" data-act="step" data-bind="' + h(bind) + '" data-d="-1" data-min="' + min + '" data-max="' + max + '" aria-label="Less">−</button><output>' + value +
      '</output><button type="button" data-act="step" data-bind="' + h(bind) + '" data-d="1" data-min="' + min + '" data-max="' + max + '" aria-label="More">+</button></span>';
  }
  /** One party member or wild Pokémon in a line: name, level, typing. */
  function monHead(m) {
    var bits = '<span class="foe-name">' + h(m.name) + "</span>";
    if (m.nickname && m.nickname !== m.name) bits += ' <span class="sub">“' + h(m.nickname) + "”</span>";
    if (m.level) bits += ' <span class="sub num">Lv ' + util.fmt(m.level) + "</span>";
    bits += " " + typeChips(m.types || []);
    return bits;
  }

  // ---- state paths for data-bind -------------------------------------------------------------------------------------
  function getPath(path) {
    var parts = path.split("."), o = state;
    for (var i = 0; i < parts.length; i++) { if (o == null) return undefined; o = o[parts[i]]; }
    return o;
  }
  function setPath(path, value) {
    var parts = path.split("."), o = state;
    for (var i = 0; i < parts.length - 1; i++) { if (o[parts[i]] == null || typeof o[parts[i]] !== "object") o[parts[i]] = {}; o = o[parts[i]]; }
    o[parts[parts.length - 1]] = value;
  }

  // ---- render ----------------------------------------------------------------------------------------------------------
  function syncLabel() {
    if (game.sample) return { cls: "sample", text: "Sample save" };
    if (!game.session && !game.system) return { cls: "", text: "Not synced" };
    var age = Date.now() - game.at;
    var live = game.via === "live" && age < 120000;
    var bit = game.session ? "Wave " + util.fmt(game.session.wave) : "Unlocks only";
    return { cls: live ? "live" : "stale", text: (live ? "Live · " : "") + bit + (live ? "" : " · " + util.ago(game.at)) };
  }

  var MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  function dayLabel(iso) { var d = new Date(iso + "T00:00:00Z"); return d.getUTCDate() + " " + MONTHS[d.getUTCMonth()]; }
  /** Events that change something an Endless run sees (shiny odds, candy, luck, biome links, extra wild species). */
  function visibleEvents(day) {
    return data.activeEvents(day).filter(function (e) { return e.shiny || e.candy || e.luck || e.biomes || e.sp || e.fusions; });
  }
  /** One line of state for an event: what it changes, for the bar and the Sync tab. */
  function eventLine(e) {
    var bits = [];
    if (e.shiny) bits.push("shiny odds ×" + e.shiny);
    if (e.luck) bits.push("+" + e.luck + " luck");
    if (e.candy) bits.push("+" + e.candy + " candy per catch");
    if (e.fusions) bits.push("more fusion items");
    if (e.biomes) bits.push(Object.keys(e.biomes).map(function (b) { return data.biomeName(+b) + " leads to " + e.biomes[b].map(function (t) { return data.biomeName(t); }).join(" or "); }).join(", "));
    if (e.sp) bits.push(e.sp.length + " event species can show up in any biome");
    return bits.join(" · ");
  }

  function renderBar(ctx) {
    var detected = adv.detectPhase(ctx);
    var events = visibleEvents();
    var tabs = [["party", "Party building", "Party"], ["carry", "Carry", "Carry"], ["run", "Running", "Running"]];
    var html = '<div class="bar-in"><div class="brand"><span class="brand-mark" aria-hidden="true"><i></i><i></i><i></i><i></i></span><div><div class="brand-name">Normalize Assistant</div>' +
      '<div class="brand-sub">Entrainment endless build · PokéRogue ' + h(data.meta.version) + ' data' + events.map(function (e) { return " · " + h(e.n) + " event until " + dayLabel(e.to); }).join("") + '</div></div></div><nav class="phases" role="tablist" aria-label="Phases">';
    tabs.forEach(function (t, i) {
      html += '<button type="button" class="phase-btn" role="tab" id="tab-' + t[0] + '" aria-selected="' + (state.tab === t[0]) + '" data-act="tab" data-tab="' + t[0] + '"><span class="n">' + (i + 1) +
        '</span><span class="phase-label"><span class="long">' + t[1] + '</span><span class="short">' + t[2] + "</span></span>" + (detected === t[0] ? '<span class="here" title="Your synced save is in this phase"></span>' : "") + "</button>";
    });
    var sl = syncLabel();
    html += '</nav><div class="bar-right"><div class="density" role="group" aria-label="How much to explain" id="density">' +
      DENSITIES.map(function (d) {
        var on = state.settings.density === d;
        return '<button type="button" class="density-btn" id="density-' + d + '" data-act="density" data-density="' + d + '" aria-pressed="' + on + '" title="' +
          (d === "explain" ? "Show the reasoning behind every check and step" : "Only the state: verdicts, ticks and counts") + '">' + (d === "explain" ? "Explain" : "Compact") + "</button>";
      }).join("") + "</div>" +
      '<button type="button" class="sync-pill" id="tab-sync" role="tab" aria-selected="' + (state.tab === "sync") + '" data-act="tab" data-tab="sync"><span class="dot ' + sl.cls + '"></span><span>' + h(sl.text) + "</span></button></div></div>";
    return html;
  }

  function render() {
    var bar = document.getElementById("bar"), view = document.getElementById("view");
    if (!bar || !view) return;
    var active = document.activeElement, keep = null;
    if (active && active.id && view.contains(active)) {
      // free-typed fields (the scout box, the paste box) keep their text; bound fields are redrawn from state
      var typed = /^(INPUT|TEXTAREA)$/.test(active.tagName) && !active.getAttribute("data-bind") && active.type !== "checkbox" && active.type !== "file";
      keep = { id: active.id, start: null, end: null, value: typed ? active.value : null };
      try { keep.start = active.selectionStart; keep.end = active.selectionEnd; } catch (e) { /* not a text field */ }
    }
    var ctx = context();
    view.setAttribute("data-density", state.settings.density);
    bar.innerHTML = renderBar(ctx);
    var fn = views[state.tab] || views.party;
    var banner = "";
    if (game.sample) banner = '<div class="banner sample"><span><strong>Sample save loaded.</strong> These Pokémon and numbers are an example, not your run.</span><button type="button" class="btn small" data-act="clear-sample">Remove sample</button></div>';
    view.innerHTML = banner + fn(ctx) + footer();
    if (keep) {
      var el = document.getElementById(keep.id);
      if (el) {
        if (keep.value != null && el.value !== keep.value) {
          el.value = keep.value;
          var liveName = el.getAttribute("data-live");
          if (liveName && liveInputs[liveName]) liveInputs[liveName](el);
        }
        el.focus({ preventScroll: true });
        try { if (keep.start != null) el.setSelectionRange(keep.start, keep.end); } catch (e2) { /* ignore */ }
      }
    }
  }

  function footer() {
    return '<footer class="foot"><div>Game data: PokéRogue ' + h(data.meta.version) + " (live branch, commit " + h(data.meta.commit) + "), extracted " + h(data.meta.extracted) +
      ". Strategy: Grex's Endless Entrainment Normalize Build and your project guide.</div><div>A fan-made helper. It reads save data you hand it and never sends input to the game.</div></footer>";
  }

  var toastBox = null;
  function toast(msg, bad) {
    if (!toastBox) { toastBox = document.getElementById("toasts"); if (!toastBox) return; }
    var el = document.createElement("div");
    el.className = "toast" + (bad ? " bad" : "");
    el.setAttribute("role", "status");
    el.textContent = msg;
    toastBox.appendChild(el);
    setTimeout(function () { if (el.parentNode) el.parentNode.removeChild(el); }, bad ? 6000 : 3200);
  }

  function setTab(tab) {
    if (TABS.indexOf(tab) === -1) return;
    state.tab = tab;
    persist(); render();
    try { window.scrollTo(0, 0); } catch (e) { /* not scrollable */ }
  }

  // ---- events ----------------------------------------------------------------------------------------------------------
  function on(act, fn) { handlers[act] = fn; }
  function bind(prefix, fn) { binders[prefix] = fn; }
  function live(name, fn) { liveInputs[name] = fn; }
  /** Body for a <details data-lazy> whose id starts with `prefix-`, built the first time it is opened. */
  function lazy(prefix, fn) { lazies[prefix] = fn; }

  function wire() {
    document.addEventListener("click", function (e) {
      var t = e.target.closest ? e.target.closest("[data-act]") : null;
      if (!t) return;
      var fn = handlers[t.getAttribute("data-act")];
      if (fn) { fn(t, e); }
    });
    document.addEventListener("change", function (e) {
      var t = e.target;
      if (!t || !t.getAttribute) return;
      var path = t.getAttribute("data-bind");
      if (!path || t.tagName === "BUTTON") return;
      var value = t.type === "checkbox" ? t.checked : t.type === "number" ? (t.value === "" ? 0 : Number(t.value)) : t.value;
      if (t.type === "number" && !isFinite(value)) return;
      if (t.type === "number") {
        if (t.min !== "") value = Math.max(Number(t.min), value);
        if (t.max !== "") value = Math.min(Number(t.max), value);
      }
      if (t.getAttribute("data-num") === "1") value = Number(value);
      setPath(path, value);
      var prefix = path.split(".")[0];
      if (binders[prefix]) binders[prefix](path, value, t);
      persist(); render();
    });
    document.addEventListener("input", function (e) {
      var t = e.target;
      var name = t && t.getAttribute ? t.getAttribute("data-live") : null;
      if (name && liveInputs[name]) liveInputs[name](t);
    });
    document.addEventListener("toggle", function (e) {
      var t = e.target;
      if (t && t.tagName === "DETAILS" && t.getAttribute("data-open-id")) {
        var id = t.getAttribute("data-open-id");
        if (t.open) state.open[id] = true; else delete state.open[id];
        if (t.open && t.getAttribute("data-lazy")) {
          var body = t.querySelector(".details-body"), fill = lazies[id.split("-")[0]];
          if (body && !body.firstChild && fill) body.innerHTML = fill(id);
        }
        persist();
      }
    }, true);
  }

  on("tab", function (t) { setTab(t.getAttribute("data-tab")); });
  on("density", function (t) { setDensity(t.getAttribute("data-density")); });
  function setDensity(d) {
    if (DENSITIES.indexOf(d) === -1 || state.settings.density === d) return;
    state.settings.density = d;
    persist(); render();
  }
  /** Once, after the first synced run: point at Compact, since a synced save means the reader is at the table. */
  function hintCompact() {
    if (state.settings.hintedCompact || state.settings.density !== "explain") return;
    state.settings.hintedCompact = true;
    persist();
    toast("Know the build already? Compact, in the top bar, hides the explanations.");
  }
  on("step", function (t) {
    var path = t.getAttribute("data-bind");
    var cur = Number(getPath(path)) || 0;
    var next = util.clamp(cur + Number(t.getAttribute("data-d")), Number(t.getAttribute("data-min")), Number(t.getAttribute("data-max")));
    setPath(path, next); persist(); render();
  });

  return {
    get state() { return state; }, get game() { return game; },
    views: views, load: load, persist: persist, context: context, render: render, wire: wire, on: on, bind: bind, live: live, lazy: lazy,
    setTab: setTab, setDensity: setDensity, hintCompact: hintCompact, compact: compact, toast: toast, getPath: getPath, setPath: setPath,
    html: { typeChips: typeChips, ab: ab, pill: pill, moveChip: moveChip, monChip: monChip, mark: mark, segbar: segbar,
      details: details, panel: panel, callout: callout, stepper: stepper, monHead: monHead, teach: teach },
    visibleEvents: visibleEvents, eventLine: eventLine, dayLabel: dayLabel,
    resetGame: function () { game.session = null; game.system = null; game.at = 0; game.via = ""; game.sample = false; },
    resetState: function () { state = defaultState(); }
  };
})();
