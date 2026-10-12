/* Boot. */
(function () {
  "use strict";
  function start() {
    NZ.data.init(window.NZ_DATA);
    NZ.ui.load();
    NZ.ui.wire();
    NZ.bridge.wire();
    var hash = "";
    try { hash = (location.hash || "").replace("#", ""); } catch (e) { hash = ""; }
    if (["party", "carry", "run", "sync"].indexOf(hash) !== -1) NZ.ui.state.tab = hash;
    NZ.ui.render();
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start);
  else start();
})();
