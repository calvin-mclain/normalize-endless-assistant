/* Normalize Endless Assistant — shared helpers.
 * Every module hangs off one namespace so the same files run in the page and in the Node tests. */
var NZ = (typeof globalThis !== "undefined" ? globalThis : this).NZ || {};
(typeof globalThis !== "undefined" ? globalThis : this).NZ = NZ;

NZ.util = (function () {
  "use strict";

  var ESC = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };
  /** Escape text for HTML. Everything read from a save file goes through this. */
  function esc(v) {
    return String(v == null ? "" : v).replace(/[&<>"']/g, function (c) { return ESC[c]; });
  }

  /** Thousands separators; keeps the app readable at level 25,000 and ₽ billions. */
  function fmt(n) {
    if (n == null || !isFinite(n)) return "–";
    return Math.round(n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  }

  /** 42,900 -> 42.9k, 1,250,000 -> 1.25M (for speed, money). */
  function short(n) {
    if (n == null || !isFinite(n)) return "–";
    var a = Math.abs(n), sign = n < 0 ? "−" : "";
    if (a < 1000) return sign + String(Math.round(a));
    var units = ["k", "M", "B", "T", "Q"], i = -1, v = a;
    while (v >= 1000 && i < units.length - 1) { v /= 1000; i++; }
    // three significant digits; Number() drops zeros after the decimal point only (940 stays 940)
    var r = Number(v.toFixed(v >= 100 ? 0 : v >= 10 ? 1 : 2));
    if (r >= 1000 && i < units.length - 1) { r = 1; i++; }
    return sign + String(r) + units[i];
  }

  function ago(ts, now) {
    if (!ts) return "never";
    var s = Math.max(0, Math.round(((now || Date.now()) - ts) / 1000));
    if (s < 5) return "just now";
    if (s < 60) return s + " s ago";
    var m = Math.round(s / 60);
    if (m < 60) return m + " min ago";
    var h = Math.round(m / 60);
    if (h < 48) return h + " h ago";
    return Math.round(h / 24) + " d ago";
  }

  function clamp(n, lo, hi) { return Math.max(lo, Math.min(hi, n)); }

  function uniq(arr) {
    var seen = Object.create(null), out = [];
    for (var i = 0; i < arr.length; i++) {
      if (!seen[arr[i]]) { seen[arr[i]] = 1; out.push(arr[i]); }
    }
    return out;
  }

  /** Storage that never throws: private windows and previews may refuse it. */
  var store = {
    get: function (key, fallback) {
      try {
        var raw = localStorage.getItem(key);
        return raw == null ? fallback : JSON.parse(raw);
      } catch (e) { return fallback; }
    },
    set: function (key, value) {
      try { localStorage.setItem(key, JSON.stringify(value)); return true; } catch (e) { return false; }
    },
    del: function (key) {
      try { localStorage.removeItem(key); } catch (e) { /* nothing to remove */ }
    }
  };

  function plural(n, one, many) { return n + " " + (n === 1 ? one : (many || one + "s")); }

  return { esc: esc, fmt: fmt, short: short, ago: ago, clamp: clamp, uniq: uniq, store: store, plural: plural };
})();
