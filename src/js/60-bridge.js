/* Getting save data into the page. Everything here is one-way: the page listens, reads and decodes.
 * It never posts to the game tab, never writes game storage and never synthesises input. */
NZ.bridge = (function () {
  "use strict";
  var ui = NZ.ui, util = NZ.util, save = NZ.save, adv = NZ.advisor;
  var status = { opened: false, blocked: false, isolated: false, messages: 0, lastAt: 0, lastError: "", rejectedOrigin: "", manualCopy: "" };
  var gameWin = null, audio = null;

  /**
   * The bridge the player runs in the PokéRogue tab (as a bookmark or pasted into the console).
   * Opened from this page: it posts the save entries back here whenever they change.
   * Otherwise: it copies them to the clipboard, and leaves a small "Copy save" button in the corner for the next wave.
   * The only thing it ever asks of the game tab's storage is localStorage.getItem on the save keys.
   */
  function snippet(targetOrigin) {
    return [
      "(function(){",
      "var W=window,D=document,ORIGIN=" + JSON.stringify(targetOrigin) + ",KEY=/^(sessionData\\d*|data)_/,TAG='Normalize Assistant: ';",
      "if(W.__nzBridge){W.__nzBridge();return;}",
      "function note(t){var d=D.createElement('div');d.textContent=TAG+t;d.setAttribute('style','position:fixed;z-index:2147483647;left:50%;top:12px;transform:translateX(-50%);max-width:90vw;background:#1f1a2e;color:#fff;font:600 14px system-ui,sans-serif;padding:8px 14px;border-radius:4px;pointer-events:none');D.body.appendChild(d);setTimeout(function(){d.remove();},4000);}",
      "var last={},sysAt=0;",
      "// the saves that changed since the last hand-over; the large unlock save goes at most every 10 minutes",
      "function pack(all,changedOnly){var LS=W.localStorage,out={},n=0,i,k,v,sys;for(i=0;i<LS.length;i++){k=LS.key(i);if(!KEY.test(k)){continue;}sys=k.indexOf('data_')===0;if(sys&&!all&&Date.now()-sysAt<600000){continue;}v=LS.getItem(k);if(!all&&(sys||changedOnly)&&v===last[k]){continue;}out[k]=v;last[k]=v;n++;if(sys){sysAt=Date.now();}}return n?{source:'nz-bridge',v:1,entries:out,t:Date.now()}:null;}",
      "var first;try{first=pack(true,false);}catch(e){note('this tab is not allowed to read its own storage.');return;}",
      "if(!first){note('no PokéRogue save found in this tab. Log in and load your run first.');return;}",
      "if(W.opener&&!W.opener.closed&&/^nz-live/.test(W.name)){",
      "var post=function(m){if(m){try{W.opener.postMessage(m,ORIGIN);}catch(e){}}};",
      "var timer=setInterval(function(){if(!W.opener||W.opener.closed){clearInterval(timer);W.__nzBridge=null;note('the assistant page was closed. Live link off.');return;}post(pack(false,true));},1000);",
      "post(first);",
      "W.__nzBridge=function(){post(pack(true,false));note('live link refreshed.');};",
      "note('live link on. Read-only: nothing is sent to the game.');",
      "}else{",
      "var YES='save copied. Paste it into the assistant (Ctrl+V).',NO='the browser blocked the copy. Click “Copy save” in the corner of this tab.';",
      "var copyText=function(text,clicked){var ok=false,ta;",
      "if(clicked&&navigator.clipboard&&navigator.clipboard.writeText){navigator.clipboard.writeText(text).then(function(){note(YES);},function(){copyText(text,false);});return;}",
      "ta=D.createElement('textarea');ta.value=text;ta.setAttribute('readonly','');ta.setAttribute('style','position:fixed;top:0;left:0;width:1px;height:1px;opacity:0');D.body.appendChild(ta);ta.focus();ta.select();try{ok=D.execCommand('copy');}catch(e){}ta.remove();",
      "if(!ok){try{if(typeof copy==='function'&&/Command Line API|native code/.test(String(copy))){copy(text);ok=true;}}catch(e){}}",
      "note(ok?YES:NO);};",
      "var chip=D.createElement('div'),x=D.createElement('span');",
      "chip.textContent='Copy save';chip.title='Normalize Assistant bridge: copies your save so you can paste it into the assistant. It never touches the game.';",
      "chip.setAttribute('style','position:fixed;z-index:2147483646;right:8px;top:8px;background:#1f1a2e;color:#fff;font:600 12px system-ui,sans-serif;padding:5px 8px;border-radius:4px;cursor:pointer;opacity:.85;user-select:none');",
      "x.textContent=' ×';x.title='Remove this button';chip.appendChild(x);",
      "chip.addEventListener('mousedown',function(e){e.preventDefault();});",
      "chip.addEventListener('click',function(e){e.stopPropagation();if(e.target===x){chip.remove();W.__nzBridge=null;return;}var m=pack(false,false);if(m){copyText(JSON.stringify(m),true);}});",
      "D.body.appendChild(chip);",
      "W.__nzBridge=function(){var m=pack(true,false);if(m){copyText(JSON.stringify(m),false);}};",
      "copyText(JSON.stringify(first),false);",
      "}",
      "})();"
    ].join("\n");
  }

  function pageOrigin() {
    try { return /^https?:$/.test(location.protocol) && location.origin && location.origin !== "null" ? location.origin : "*"; } catch (e) { return "*"; }
  }
  /** The same script as a bookmark address (comment lines dropped, one line). */
  function bookmarklet() {
    var code = snippet(pageOrigin()).split("\n").filter(function (line) { return line.indexOf("//") !== 0; }).join("");
    return "javascript:" + encodeURIComponent(code);
  }

  function gameOrigin() {
    try { return new URL(ui.state.settings.gameUrl).origin; } catch (e) { return "https://pokerogue.net"; }
  }
  function originAllowed(origin) { return origin === gameOrigin() || origin === "https://pokerogue.net"; }

  function beep() {
    try {
      audio = audio || new (window.AudioContext || window.webkitAudioContext)();
      var t = audio.currentTime;
      [880, 1320].forEach(function (f, i) {
        var o = audio.createOscillator(), g = audio.createGain();
        o.type = "square"; o.frequency.value = f;
        g.gain.setValueAtTime(0.0001, t + i * 0.14); g.gain.exponentialRampToValueAtTime(0.12, t + i * 0.14 + 0.01); g.gain.exponentialRampToValueAtTime(0.0001, t + i * 0.14 + 0.12);
        o.connect(g); g.connect(audio.destination); o.start(t + i * 0.14); o.stop(t + i * 0.14 + 0.13);
      });
    } catch (e) { /* no audio available */ }
  }
  function primeAudio() {
    try { audio = audio || new (window.AudioContext || window.webkitAudioContext)(); if (audio.state === "suspended") audio.resume(); } catch (e) { /* ignore */ }
  }

  /** Take decoded saves into the page. Returns a short description of what changed. */
  function apply(decoded, via) {
    var game = ui.game, sessions = [], systems = [];
    decoded.forEach(function (d) { (d.kind === "session" ? sessions : systems).push(d); });
    var changed = [], prevWave = game.session ? game.session.wave : null, prevTs = game.session ? game.session.timestamp : 0;
    if (game.sample) { game.session = null; game.system = null; game.sample = false; prevWave = null; prevTs = 0; }
    if (sessions.length) {
      sessions.sort(function (a, b) { return (b.raw.timestamp || 0) - (a.raw.timestamp || 0); });
      var newest = save.normalizeSession(sessions[0].raw);
      if (via !== "live" || newest.timestamp >= prevTs) {
        game.session = newest;
        changed.push("wave " + util.fmt(newest.wave) + (newest.endless ? "" : " (not an Endless run)") + ", " + newest.party.length + " Pokémon");
      }
    }
    if (systems.length) {
      systems.sort(function (a, b) { return (b.raw.timestamp || 0) - (a.raw.timestamp || 0); });
      game.system = save.normalizeSystem(systems[0].raw);
      changed.push("unlocks for " + Object.keys(game.system.starters).length + " starters");
    }
    if (!changed.length) return "";
    game.at = Date.now(); game.via = via;
    ui.persist();
    var ctx = ui.context();
    if (via === "live" && ui.state.settings.sound && game.session && game.session.wave !== prevWave) {
      var v = adv.verdict(ctx);
      if (v && (v.action === "stay" || (v.action === "steal" && ui.state.settings.soundItems))) beep();
    }
    if (via !== "live" && game.session) {
      var phase = adv.detectPhase(ctx);
      if (phase && (ui.state.tab === "sync" || ui.state.tab === "party")) ui.state.tab = phase;
    }
    ui.render();
    if (game.session) ui.hintCompact();
    return changed.join("; ");
  }

  function ingestText(text, via, keyHint) {
    return save.decodeAny(text, keyHint).then(function (decoded) {
      var summary = apply(decoded, via);
      status.lastError = "";
      if (via !== "live") ui.toast(summary ? "Synced: " + summary + "." : "That save is older than what is already loaded.");
      return summary;
    }, function (err) {
      status.lastError = err && err.message ? err.message : "Could not read that.";
      if (via !== "live") ui.toast(status.lastError, true);
      ui.render();
      return "";
    });
  }

  function ingestEntries(entries, via) {
    return save.decodeEntries(entries).then(function (decoded) {
      status.lastError = "";
      return apply(decoded, via);
    }, function (err) { status.lastError = err && err.message ? err.message : "Could not read the bridge data."; return ""; });
  }

  function onMessage(e) {
    var d = e.data;
    if (!d || typeof d !== "object" || d.source !== "nz-bridge" || !d.entries || typeof d.entries !== "object") return;
    if (!originAllowed(e.origin)) {
      if (status.rejectedOrigin !== e.origin) { status.rejectedOrigin = e.origin; if (ui.state.tab === "sync") ui.render(); }
      return;
    }
    status.rejectedOrigin = "";
    status.messages++; status.lastAt = Date.now(); status.isolated = false;
    if (e.source) gameWin = e.source;
    ingestEntries(d.entries, "live");
  }

  function looksLikeSave(text) {
    var t = String(text || "").trim();
    return t.indexOf("U2FsdGVkX1") === 0 || t.indexOf('{"source":"nz-bridge"') === 0 || (t.charAt(0) === "{" && t.indexOf('"party"') !== -1) || (t.charAt(0) === "{" && t.indexOf('"dexData"') !== -1);
  }

  function onPaste(e) {
    var target = e.target;
    var inField = target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA");
    if (inField && target.id !== "paste-box") return;
    var text = e.clipboardData ? e.clipboardData.getData("text") : "";
    if (!text) return;
    if (!looksLikeSave(text)) { if (target && target.id === "paste-box") { e.preventDefault(); ui.toast("That is not PokéRogue save data.", true); } return; }
    e.preventDefault();
    ingestText(text, "paste");
  }

  function readFiles(files) {
    Array.prototype.slice.call(files || []).forEach(function (file) {
      if (file.size > 30 * 1024 * 1024) { ui.toast(file.name + " is too large to be a save file.", true); return; }
      var reader = new FileReader();
      reader.onload = function () { ingestText(String(reader.result || ""), "file", file.name.replace(/\.prsv$/i, "")); };
      reader.onerror = function () { ui.toast("Could not read " + file.name + ".", true); };
      reader.readAsText(file);
    });
  }

  function wire() {
    window.addEventListener("message", onMessage);
    document.addEventListener("paste", onPaste);
    var depth = 0;
    function zone() { return document.getElementById("drop-zone"); }
    document.addEventListener("dragenter", function (e) { if (e.dataTransfer && Array.prototype.indexOf.call(e.dataTransfer.types || [], "Files") !== -1) { depth++; var z = zone(); if (z) z.classList.add("over"); } });
    document.addEventListener("dragleave", function () { depth = Math.max(0, depth - 1); if (!depth) { var z = zone(); if (z) z.classList.remove("over"); } });
    document.addEventListener("dragover", function (e) { if (e.dataTransfer && Array.prototype.indexOf.call(e.dataTransfer.types || [], "Files") !== -1) e.preventDefault(); });
    document.addEventListener("drop", function (e) {
      if (!e.dataTransfer || !e.dataTransfer.files || !e.dataTransfer.files.length) return;
      e.preventDefault(); depth = 0;
      var z = zone(); if (z) z.classList.remove("over");
      readFiles(e.dataTransfer.files);
    });
    document.addEventListener("change", function (e) {
      if (e.target && e.target.id === "file-pick") { readFiles(e.target.files); e.target.value = ""; }
    });
    setInterval(function () {
      // keep the "x min ago" label honest without re-rendering a view someone is typing in
      var pill = document.querySelector("#tab-sync span:last-child");
      if (pill && (ui.game.session || ui.game.system) && !ui.game.sample) {
        var age = Date.now() - ui.game.at, liveNow = ui.game.via === "live" && age < 120000;
        var bit = ui.game.session ? "Wave " + util.fmt(ui.game.session.wave) : "Unlocks only";
        pill.textContent = (liveNow ? "Live · " : "") + bit + (liveNow ? "" : " · " + util.ago(ui.game.at));
        var dot = document.querySelector("#tab-sync .dot");
        if (dot) dot.className = "dot " + (liveNow ? "live" : "stale");
      }
    }, 15000);
  }

  function openGame() {
    primeAudio();
    if (gameWin && !gameWin.closed) { try { gameWin.focus(); } catch (e) { /* ignore */ } return; }
    var w = null;
    try { w = window.open(ui.state.settings.gameUrl, "nz-live-" + Math.random().toString(36).slice(2, 8)); } catch (e) { w = null; }
    status.opened = !!w; status.blocked = !w; status.isolated = false;
    gameWin = w;
    if (w) setTimeout(function () {
      // a viewer that isolates popups hands back a window that already reads as closed
      try { if (gameWin === w && w.closed && !status.messages) { status.isolated = true; ui.render(); } } catch (e) { /* ignore */ }
    }, 4000);
    ui.render();
  }

  function loadSample(name) {
    var raw = (window.NZ_SAMPLES || {})[name];
    if (!raw) return;
    var game = ui.game;
    game.session = save.normalizeSession(raw);
    game.system = null; game.at = Date.now(); game.via = "sample"; game.sample = true;
    var phase = adv.detectPhase(ui.context());
    ui.state.tab = phase || "carry";
    ui.persist(); ui.render();
    ui.hintCompact();
    try { window.scrollTo(0, 0); } catch (e) { /* ignore */ }
  }

  ui.on("open-game", openGame);
  ui.on("sample", function (t) { loadSample(t.getAttribute("data-sample")); });
  ui.on("clear-sample", function () { ui.resetGame(); ui.render(); });
  ui.on("forget", function () { ui.resetGame(); util.store.del("nz.game.v1"); ui.persist(); ui.render(); ui.toast("Synced data removed from this browser."); });
  ui.on("paste-go", function () {
    var box = document.getElementById("paste-box");
    if (box && box.value.trim()) { ingestText(box.value, "paste"); box.value = ""; }
    else ui.toast("Paste the copied save into the box first.", true);
  });
  /** Copy text for the player: the clipboard API, then the older command, then a selected text box to copy by hand. */
  function copyOut(text, okMessage) {
    var done = function () { status.manualCopy = ""; ui.toast(okMessage); };
    var byHand = function () {
      status.manualCopy = text;
      ui.render();
      var box = document.getElementById("copy-out");
      if (box) { box.focus(); box.select(); }
      ui.toast("Copying is blocked in this viewer. The text is selected below: press Ctrl+C.", true);
    };
    var older = function () {
      var ok = false;
      try {
        var ta = document.createElement("textarea");
        ta.value = text; ta.setAttribute("readonly", ""); ta.style.cssText = "position:fixed;top:0;left:0;width:1px;height:1px;opacity:0";
        document.body.appendChild(ta); ta.focus(); ta.select();
        ok = document.execCommand("copy");
        ta.remove();
      } catch (e) { ok = false; }
      if (ok) done(); else byHand();
    };
    try { navigator.clipboard.writeText(text).then(done, older); } catch (e) { older(); }
  }
  ui.on("copy", function (t) {
    var which = t.getAttribute("data-what");
    copyOut(which === "bookmarklet" ? bookmarklet() : snippet(pageOrigin()),
      which === "bookmarklet" ? "Bookmark address copied. Paste it as the URL of a new bookmark." : "Snippet copied. Paste it into the PokéRogue tab's console.");
  });
  ui.on("copy-hide", function () { status.manualCopy = ""; ui.render(); });
  ui.on("bookmark-click", function (t, e) {
    e.preventDefault();
    ui.toast("Drag this to your bookmarks bar. It only does something in the PokéRogue tab.");
  });
  ui.bind("settings", function (path, value) { if (path === "settings.sound" && value) { primeAudio(); beep(); } });

  return { snippet: snippet, bookmarklet: bookmarklet, pageOrigin: pageOrigin, ingestText: ingestText, ingestEntries: ingestEntries, apply: apply,
    wire: wire, status: status, loadSample: loadSample, originAllowed: originAllowed, looksLikeSave: looksLikeSave };
})();
