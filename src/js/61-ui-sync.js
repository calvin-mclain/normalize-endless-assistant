/* The Sync tab: how save data reaches the page, what is read, and the settings. */
(function () {
  "use strict";
  var ui = NZ.ui, util = NZ.util, data = NZ.data, kb = NZ.kb, adv = NZ.advisor, bridge = NZ.bridge, h = util.esc, H = ui.html;

  function statusPanel(ctx) {
    var g = ui.game, body;
    if (!g.session && !g.system) {
      body = H.callout("plain", "Nothing synced", H.teach("The assistant works without it: every checklist can be ticked by hand. Synced, it fills them in from your save and reads each wave for you.", "", "span"));
    } else {
      var rows = "";
      if (g.session) {
        var s = g.session;
        rows += "<dt>Run</dt><dd>" + (s.endless ? "Endless" : "Not an Endless run") + " · wave " + util.fmt(s.wave) + " · " + h(data.biomeName(s.biome)) + "</dd>" +
          "<dt>Party</dt><dd>" + s.party.map(function (m) { return h(m.name); }).join(", ") + "</dd>" +
          "<dt>On the field</dt><dd>" + (s.enemies.map(function (m) { return h(m.name); }).join(", ") || "–") + "</dd>" +
          "<dt>Detected phase</dt><dd>" + ({ carry: "Carry", run: "Running" }[adv.detectPhase(ctx)] || "–") + "</dd>" +
          "<dt>Game version</dt><dd>" + h(s.version || "?") + (s.version && s.version !== data.meta.version ? ' <span class="sub">(this page\'s data is ' + h(data.meta.version) + ")</span>" : "") + "</dd>";
      }
      if (g.system) rows += "<dt>Unlocks</dt><dd>" + Object.keys(g.system.starters).length + " starters, " + g.system.caught.length + " species caught, " + g.system.shiny.length + " shiny</dd>";
      rows += "<dt>Read</dt><dd>" + h(util.ago(g.at)) + " · " + ({ live: "live link", paste: "pasted", file: "from a file", sample: "sample data" }[g.via] || "") + "</dd>";
      body = '<dl class="kv">' + rows + '</dl><div class="row"><button type="button" class="btn small" data-act="forget">Forget synced data</button></div>';
    }
    if (bridge.status.lastError) body += H.callout("danger", "Last attempt failed", h(bridge.status.lastError));
    return H.panel("Status", body, "");
  }

  function bridgePanel() {
    var href = bridge.bookmarklet();
    return H.panel("The bridge bookmark",
      H.teach("A few lines of script you run in the PokéRogue tab. It reads the save the game keeps in that tab and hands it to this page. That is all it does.", "note") +
      '<div class="row"><a class="bookmarklet" id="bridge-link" href="' + h(href) + '" data-act="bookmark-click" draggable="true" title="Drag to your bookmarks bar">NZ bridge</a><span class="sub">Drag this to your bookmarks bar.</span></div>' +
      '<div class="row"><button type="button" class="btn small" data-act="copy" data-what="bookmarklet">Copy as a bookmark address</button><button type="button" class="btn small" data-act="copy" data-what="snippet">Copy as a console snippet</button></div>' +
      (bridge.status.manualCopy ? '<label class="field" for="copy-out">Copy this by hand<textarea id="copy-out" class="paste" readonly spellcheck="false">' + h(bridge.status.manualCopy) + '</textarea></label><div class="row"><button type="button" class="btn small" data-act="copy-hide">Hide</button></div>' : "") +
      H.teach("If dragging does not work: make any bookmark, edit it and paste the copied address as its URL. Or open the PokéRogue tab's developer console (F12) and paste the snippet there.", "sub") +
      H.details("bridge-code", "Read the script (" + bridge.snippet(bridge.pageOrigin()).length + " characters)", '<pre class="code-box" id="code-box">' + h(bridge.snippet(bridge.pageOrigin())) + "</pre>" +
        '<ul class="bullets"><li>It calls <code>localStorage.getItem</code> on the keys that start with <code>sessionData</code> and <code>data_</code>. Nothing else is read.</li><li>It never writes to storage, never touches the game canvas and never sends key or mouse input.</li><li>In a game tab opened from this page it posts the save here when it changes. In any other tab it copies the save to your clipboard and leaves a small Copy save button in the top right corner for the next wave.</li></ul>'),
      "run it once per game load");
  }

  function livePanel() {
    var st = bridge.status, g = ui.game, note = "";
    var liveNow = g.via === "live" && Date.now() - g.at < 120000;
    if (liveNow) note = H.callout("good", "Live", "Following your save: last update " + h(util.ago(g.at)) + ", " + st.messages + " update" + (st.messages === 1 ? "" : "s") + " this session.");
    else if (st.blocked) note = H.callout("warn", "This viewer did not allow opening the game from here", "Use copy and paste below, or open the offline copy of this assistant from your disk: there the live link works.");
    else if (st.isolated) note = H.callout("warn", "The browser isolated the game tab from this page", "A page inside this viewer cannot keep a link to a tab it opens. Use copy and paste below, or the offline copy of this assistant.");
    else if (st.opened) note = H.callout("plain", "Waiting for the bridge", "In the PokéRogue tab that just opened, click your NZ bridge bookmark once the game has loaded. If the notice in that tab says the link is on but nothing arrives here, the bookmark was made on another copy of this page: drag the one from this page instead.");
    if (st.rejectedOrigin) note += H.callout("warn", "Ignored a message from " + h(st.rejectedOrigin), "Live data is only accepted from " + h(ui.state.settings.gameUrl) + ". Change the game address in Settings if you play somewhere else.");
    return H.panel("Live link",
      H.teach("The page follows your run by itself and updates at the start of every wave, when the game writes its save.", "note") +
      '<ol class="numbered"><li><div><strong>Open the game from here.</strong><div class="d teach">The live link only works for a game tab this page opened itself.</div></div></li>' +
      '<li><div><strong>Load your run, then click the NZ bridge bookmark in that tab.</strong><div class="d teach">A small notice confirms the link. Click it again after you reload the game.</div></div></li></ol>' +
      '<div class="row"><button type="button" class="btn primary" data-act="open-game">Open PokéRogue</button><span class="sub">' + h(ui.state.settings.gameUrl) + "</span></div>" + note,
      "automatic, every wave");
  }

  function pastePanel() {
    return H.panel("Copy and paste",
      '<ol class="numbered"><li><div><strong>In the PokéRogue tab, click the NZ bridge bookmark.</strong><div class="d teach">A notice says the save was copied, and a small Copy save button appears in the top right corner of that tab.</div></div></li>' +
      '<li><div><strong>Come back here and press Ctrl+V anywhere on this page.</strong><div class="d teach">Or paste into the box.</div></div></li>' +
      '<li><div><strong>On later waves, click Copy save in the game tab and paste again.</strong><div class="d teach">The button stays until you reload the game or close it with ×.</div></div></li></ol>' +
      '<label class="field" for="paste-box">Pasted save<textarea id="paste-box" class="paste" placeholder="Paste here" spellcheck="false"></textarea></label>' +
      '<div class="row"><button type="button" class="btn" data-act="paste-go">Read the pasted save</button></div>', "works everywhere, one paste per check");
  }

  function filePanel() {
    return H.panel("Export file",
      H.teach("No script at all: in the game open Menu, then Manage Data, then Export Session (your run) or Export Data (your unlocks), and drop the <code>.prsv</code> file here. An exported session is the server copy, which the game updates every five waves, so it can be a few waves behind.", "note") +
      '<div class="drop" id="drop-zone"><strong>Drop .prsv files anywhere on this page</strong><label class="btn" for="file-pick">Choose files</label><input class="sr" type="file" id="file-pick" accept=".prsv,.json,.txt" multiple></div>', "");
  }

  function settingsPanel() {
    var s = ui.state.settings;
    return H.panel("Settings",
      '<label class="switch"><input type="checkbox" id="set-peek" data-bind="settings.peek"' + (s.peek ? " checked" : "") + "><span>Show hidden enemy details</span></label>" +
      H.teach("Off: the assistant only uses what the game shows you (species, level, boss bars, shiny, held items) plus what that species can have. On: it also reads each wild Pokémon's real ability, moves and Speed from the save, which the game does not show. Your call.", "sub") +
      '<label class="switch"><input type="checkbox" id="set-sound" data-bind="settings.sound"' + (s.sound ? " checked" : "") + "><span>Sound when a wave is worth staying for</span></label>" +
      H.teach("Live link only. A short two-note beep for shinies, Pokémon missing from your dex and pieces of the build.", "sub") +
      '<label class="switch"><input type="checkbox" id="set-sound-items" data-bind="settings.soundItems"' + (s.soundItems ? " checked" : "") + (s.sound ? "" : " disabled") + "><span>Also for items worth stealing</span></label>" +
      H.teach("Lucky and Golden Eggs get common on wild Pokémon at high waves, so this one is off by default.", "sub") +
      '<label class="field" for="set-url">Game address<input type="text" id="set-url" data-bind="settings.gameUrl" value="' + h(s.gameUrl) + '" spellcheck="false"></label>', "");
  }

  function samplePanel() {
    return H.panel("Try it with a sample", H.teach("Example saves in the game's real format, to see what a synced page looks like. They are not your run.", "note") + '<div class="chips">' +
      '<button type="button" class="chip" data-act="sample" data-sample="carry">Carry phase, wave 734</button>' +
      '<button type="button" class="chip" data-act="sample" data-sample="shiny">Running, a shiny on wave 1763</button>' +
      '<button type="button" class="chip" data-act="sample" data-sample="plain">Running, nothing on wave 1764</button>' +
      '<button type="button" class="chip" data-act="sample" data-sample="boss">Slither Wing on wave 2350</button></div>', "");
  }

  function aboutPanel() {
    return H.panel("What this page reads and keeps",
      '<ul class="bullets"><li><strong>Read-only.</strong> The assistant does not play. It cannot press a key, click, or change a save.</li>' +
      "<li>From a session save it keeps the wave, your party, held items, balls, money and the wild Pokémon of the current wave. From a system save it keeps starter unlocks and which species you have caught.</li>" +
      "<li>Trainer and secret ids are dropped. Nothing leaves your browser: the decoded summary is stored in this browser only, so a reload keeps it.</li>" +
      "<li>The game writes its save at the start of each wave, so the page is at most one wave behind what you see.</li></ul>" +
      '<h3 class="h">Sources</h3><ul class="bullets">' + kb.sources.map(function (s) { return '<li><a href="' + h(s.url) + '" target="_blank" rel="noopener noreferrer">' + h(s.label) + "</a></li>"; }).join("") + "</ul>", "", "", true);
  }

  ui.views.sync = function (ctx) {
    return '<div class="view-head"><p class="eyebrow">Sync</p><h1>Let the assistant read your run</h1><p class="lede">It reads the save the game keeps in your browser. It never sends anything to the game.</p></div>' +
      '<div class="cols"><div class="col">' + statusPanel(ctx) + bridgePanel() + livePanel() + pastePanel() + filePanel() + '</div><div class="col">' + settingsPanel() + samplePanel() + aboutPanel() + "</div></div>";
  };
})();
