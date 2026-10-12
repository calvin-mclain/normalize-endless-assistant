/* Reading PokéRogue save data. Read-only by construction: this file only decodes text it is handed.
 * Format (src/utils/data.ts, src/system/game-data.ts): JSON encrypted with CryptoJS AES under a fixed passphrase,
 * i.e. the OpenSSL "Salted__" container, an MD5 key derivation, AES-256-CBC and PKCS#7 padding. */
NZ.save = (function () {
  "use strict";
  var data = NZ.data;
  var SAVE_KEY = "x0i2O7WRiANTqPmZ";

  // ---- bytes -------------------------------------------------------------------------------------------------
  function utf8Bytes(str) { return new TextEncoder().encode(str); }
  function utf8Text(bytes) { return new TextDecoder("utf-8", { fatal: false }).decode(bytes); }

  function base64Bytes(b64) {
    var clean = String(b64).replace(/[\s﻿]+/g, "");
    var bin = atob(clean);
    var out = new Uint8Array(bin.length);
    for (var i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
  }

  function concat(a, b) {
    var out = new Uint8Array(a.length + b.length);
    out.set(a, 0); out.set(b, a.length);
    return out;
  }

  // ---- MD5 (RFC 1321) ------------------------------------------------------------------------------------------
  var MD5_S = [7, 12, 17, 22, 7, 12, 17, 22, 7, 12, 17, 22, 7, 12, 17, 22, 5, 9, 14, 20, 5, 9, 14, 20, 5, 9, 14, 20, 5, 9, 14, 20,
    4, 11, 16, 23, 4, 11, 16, 23, 4, 11, 16, 23, 4, 11, 16, 23, 6, 10, 15, 21, 6, 10, 15, 21, 6, 10, 15, 21, 6, 10, 15, 21];
  var MD5_K = (function () {
    var k = new Uint32Array(64);
    for (var i = 0; i < 64; i++) k[i] = Math.floor(Math.abs(Math.sin(i + 1)) * 4294967296) >>> 0;
    return k;
  })();

  function md5(bytes) {
    var len = bytes.length;
    var total = (((len + 8) >>> 6) + 1) << 6;
    var buf = new Uint8Array(total);
    buf.set(bytes);
    buf[len] = 0x80;
    var bitsLo = (len << 3) >>> 0, bitsHi = Math.floor(len / 536870912) >>> 0;
    for (var b = 0; b < 4; b++) {
      buf[total - 8 + b] = (bitsLo >>> (8 * b)) & 255;
      buf[total - 4 + b] = (bitsHi >>> (8 * b)) & 255;
    }
    var a0 = 0x67452301, b0 = 0xefcdab89, c0 = 0x98badcfe, d0 = 0x10325476;
    var m = new Uint32Array(16);
    for (var off = 0; off < total; off += 64) {
      for (var j = 0; j < 16; j++) {
        var p = off + j * 4;
        m[j] = (buf[p] | (buf[p + 1] << 8) | (buf[p + 2] << 16) | (buf[p + 3] << 24)) >>> 0;
      }
      var A = a0, B = b0, C = c0, Dd = d0;
      for (var i = 0; i < 64; i++) {
        var F, g;
        if (i < 16) { F = (B & C) | (~B & Dd); g = i; }
        else if (i < 32) { F = (Dd & B) | (~Dd & C); g = (5 * i + 1) % 16; }
        else if (i < 48) { F = B ^ C ^ Dd; g = (3 * i + 5) % 16; }
        else { F = C ^ (B | ~Dd); g = (7 * i) % 16; }
        F = (F + A + MD5_K[i] + m[g]) >>> 0;
        A = Dd; Dd = C; C = B;
        B = (B + ((F << MD5_S[i]) | (F >>> (32 - MD5_S[i])))) >>> 0;
      }
      a0 = (a0 + A) >>> 0; b0 = (b0 + B) >>> 0; c0 = (c0 + C) >>> 0; d0 = (d0 + Dd) >>> 0;
    }
    var out = new Uint8Array(16), words = [a0, b0, c0, d0];
    for (var w = 0; w < 4; w++) for (var x = 0; x < 4; x++) out[w * 4 + x] = (words[w] >>> (8 * x)) & 255;
    return out;
  }

  /** OpenSSL EVP_BytesToKey with MD5 and one iteration: 32 key bytes then 16 IV bytes. */
  function deriveKey(passphrase, salt) {
    var pass = utf8Bytes(passphrase);
    var material = new Uint8Array(0), prev = new Uint8Array(0);
    while (material.length < 48) {
      prev = md5(concat(concat(prev, pass), salt));
      material = concat(material, prev);
    }
    return { key: material.slice(0, 32), iv: material.slice(32, 48) };
  }

  // ---- AES-256-CBC decryption in plain JS (used where WebCrypto is unavailable) -------------------------------
  var SBOX = null, INV_SBOX = null, MUL = null;
  function initAes() {
    if (SBOX) return;
    SBOX = new Uint8Array(256); INV_SBOX = new Uint8Array(256);
    var p = 1, q = 1;
    do {
      p = p ^ ((p << 1) & 255) ^ ((p & 0x80) ? 0x1b : 0);
      q ^= q << 1; q ^= q << 2; q ^= q << 4; q &= 255;
      if (q & 0x80) q ^= 0x09;
      var x = q ^ ((q << 1) | (q >> 7)) ^ ((q << 2) | (q >> 6)) ^ ((q << 3) | (q >> 5)) ^ ((q << 4) | (q >> 4));
      x = (x & 255) ^ 0x63;
      SBOX[p] = x; INV_SBOX[x] = p;
    } while (p !== 1);
    SBOX[0] = 0x63; INV_SBOX[0x63] = 0;
    function mul(a, b) {
      var r = 0;
      for (var i = 0; i < 8; i++) {
        if (b & 1) r ^= a;
        var hi = a & 0x80;
        a = (a << 1) & 255;
        if (hi) a ^= 0x1b;
        b >>= 1;
      }
      return r;
    }
    MUL = { 9: new Uint8Array(256), 11: new Uint8Array(256), 13: new Uint8Array(256), 14: new Uint8Array(256) };
    for (var i = 0; i < 256; i++) { MUL[9][i] = mul(i, 9); MUL[11][i] = mul(i, 11); MUL[13][i] = mul(i, 13); MUL[14][i] = mul(i, 14); }
  }

  function expandKey(key) {
    initAes();
    var nk = key.length / 4, nr = nk + 6, total = 16 * (nr + 1);
    var w = new Uint8Array(total);
    w.set(key);
    var rcon = 1;
    for (var i = key.length; i < total; i += 4) {
      var t0 = w[i - 4], t1 = w[i - 3], t2 = w[i - 2], t3 = w[i - 1];
      var word = i / 4;
      if (word % nk === 0) {
        var tmp = t0;
        t0 = SBOX[t1] ^ rcon; t1 = SBOX[t2]; t2 = SBOX[t3]; t3 = SBOX[tmp];
        rcon = ((rcon << 1) ^ ((rcon & 0x80) ? 0x1b : 0)) & 255;
      } else if (nk > 6 && word % nk === 4) {
        t0 = SBOX[t0]; t1 = SBOX[t1]; t2 = SBOX[t2]; t3 = SBOX[t3];
      }
      w[i] = w[i - key.length] ^ t0; w[i + 1] = w[i - key.length + 1] ^ t1;
      w[i + 2] = w[i - key.length + 2] ^ t2; w[i + 3] = w[i - key.length + 3] ^ t3;
    }
    return { w: w, nr: nr };
  }

  function decryptBlock(ks, input, inOff, out, outOff) {
    var w = ks.w, nr = ks.nr, s = new Uint8Array(16), t = new Uint8Array(16), i, c;
    for (i = 0; i < 16; i++) s[i] = input[inOff + i] ^ w[nr * 16 + i];
    for (var round = nr - 1; round >= 0; round--) {
      // inverse ShiftRows + inverse SubBytes
      t[0] = INV_SBOX[s[0]]; t[4] = INV_SBOX[s[4]]; t[8] = INV_SBOX[s[8]]; t[12] = INV_SBOX[s[12]];
      t[1] = INV_SBOX[s[13]]; t[5] = INV_SBOX[s[1]]; t[9] = INV_SBOX[s[5]]; t[13] = INV_SBOX[s[9]];
      t[2] = INV_SBOX[s[10]]; t[6] = INV_SBOX[s[14]]; t[10] = INV_SBOX[s[2]]; t[14] = INV_SBOX[s[6]];
      t[3] = INV_SBOX[s[7]]; t[7] = INV_SBOX[s[11]]; t[11] = INV_SBOX[s[15]]; t[15] = INV_SBOX[s[3]];
      for (i = 0; i < 16; i++) t[i] ^= w[round * 16 + i];
      if (round === 0) { s.set(t); break; }
      for (c = 0; c < 16; c += 4) {
        var a0 = t[c], a1 = t[c + 1], a2 = t[c + 2], a3 = t[c + 3];
        s[c] = MUL[14][a0] ^ MUL[11][a1] ^ MUL[13][a2] ^ MUL[9][a3];
        s[c + 1] = MUL[9][a0] ^ MUL[14][a1] ^ MUL[11][a2] ^ MUL[13][a3];
        s[c + 2] = MUL[13][a0] ^ MUL[9][a1] ^ MUL[14][a2] ^ MUL[11][a3];
        s[c + 3] = MUL[11][a0] ^ MUL[13][a1] ^ MUL[9][a2] ^ MUL[14][a3];
      }
    }
    for (i = 0; i < 16; i++) out[outOff + i] = s[i];
  }

  function aesCbcDecryptJs(key, iv, cipher) {
    if (cipher.length === 0 || cipher.length % 16 !== 0) throw new Error("Encrypted data has the wrong length.");
    var ks = expandKey(key), out = new Uint8Array(cipher.length), prev = iv;
    for (var off = 0; off < cipher.length; off += 16) {
      decryptBlock(ks, cipher, off, out, off);
      for (var i = 0; i < 16; i++) out[off + i] ^= (prev === iv ? iv[i] : cipher[off - 16 + i]);
      prev = null;
    }
    var pad = out[out.length - 1];
    if (pad < 1 || pad > 16) throw new Error("Could not decrypt: wrong key or damaged data.");
    for (var p = 1; p <= pad; p++) if (out[out.length - p] !== pad) throw new Error("Could not decrypt: wrong key or damaged data.");
    return out.subarray(0, out.length - pad);
  }

  /** Decrypt one `.prsv` / localStorage value. Resolves to the JSON text inside. */
  function decryptText(b64, options) {
    var raw;
    try { raw = base64Bytes(b64); } catch (e) { return Promise.reject(new Error("That text is not a PokéRogue save (not base64).")); }
    if (raw.length < 32 || utf8Text(raw.subarray(0, 8)) !== "Salted__") {
      return Promise.reject(new Error("That text is not a PokéRogue save (missing the encryption header)."));
    }
    var kd = deriveKey(SAVE_KEY, raw.subarray(8, 16));
    var cipher = raw.subarray(16);
    var subtle = !(options && options.forceJs) && typeof crypto !== "undefined" && crypto.subtle;
    if (subtle) {
      return subtle.importKey("raw", kd.key, { name: "AES-CBC" }, false, ["decrypt"])
        .then(function (k) { return subtle.decrypt({ name: "AES-CBC", iv: kd.iv }, k, cipher); })
        .then(function (buf) { return utf8Text(new Uint8Array(buf)); })
        .catch(function () { return utf8Text(aesCbcDecryptJs(kd.key, kd.iv, cipher)); });
    }
    try { return Promise.resolve(utf8Text(aesCbcDecryptJs(kd.key, kd.iv, cipher))); }
    catch (e) { return Promise.reject(e); }
  }

  // ---- telling what a piece of text is --------------------------------------------------------------------------
  var SHORT_KEYS = { "$sa": "seenAttr", "$ca": "caughtAttr", "$na": "natureAttr", "$s": "seenCount", "$c": "caughtCount",
    "$hc": "hatchedCount", "$i": "ivs", "$m": "moveset", "$em": "eggMoves", "$x": "candyCount", "$f": "friendship",
    "$a": "abilityAttr", "$pa": "passiveAttr", "$pAttr": "passiveAttr", "$vr": "valueReduction", "$wc": "classicWinCount" };

  function kindOf(obj) {
    if (!obj || typeof obj !== "object") return null;
    if (Array.isArray(obj.party) && (Array.isArray(obj.enemyParty) || typeof obj.waveIndex === "number")) return "session";
    if (obj.dexData && obj.starterData) return "system";
    return null;
  }

  function tryJson(text) {
    try { return JSON.parse(text); } catch (e) { return undefined; }
  }

  /**
   * Turn any supported input into raw save objects.
   * Accepts: the bridge envelope, an exported .prsv, a raw localStorage value, already-decrypted JSON,
   * or the base64(URI-encoded JSON) form that offline builds of the game use.
   * Resolves to [{ kind: "session" | "system", raw, key }].
   */
  function decodeAny(text, keyHint) {
    var t = String(text == null ? "" : text).trim();
    if (!t) return Promise.reject(new Error("Nothing to read."));
    if (t.charAt(0) === "{" || t.charAt(0) === "[") {
      var obj = tryJson(t);
      if (obj === undefined) return Promise.reject(new Error("That looks like JSON but does not parse."));
      if (obj && obj.source === "nz-bridge" && obj.entries && typeof obj.entries === "object") return decodeEntries(obj.entries);
      var kind = kindOf(obj);
      if (kind) return Promise.resolve([{ kind: kind, raw: obj, key: keyHint || "" }]);
      return Promise.reject(new Error("That JSON is not a PokéRogue session or system save."));
    }
    if (t.indexOf("U2FsdGVkX1") === 0) {
      return decryptText(t).then(function (json) {
        var obj2 = tryJson(json);
        var kind2 = kindOf(obj2);
        if (!kind2) throw new Error("The save decrypted, but it is not a session or system save.");
        return [{ kind: kind2, raw: obj2, key: keyHint || "" }];
      });
    }
    try {
      var plain = decodeURIComponent(atob(t.replace(/\s+/g, "")));
      var obj3 = tryJson(plain);
      var kind3 = kindOf(obj3);
      if (kind3) return Promise.resolve([{ kind: kind3, raw: obj3, key: keyHint || "" }]);
    } catch (e) { /* fall through */ }
    return Promise.reject(new Error("Could not recognise that as PokéRogue save data."));
  }

  /** Decode a map of localStorage key -> value as sent by the bridge. Unreadable entries are skipped. */
  function decodeEntries(entries) {
    var keys = Object.keys(entries).filter(function (k) { return /^(sessionData\d*|data)_/.test(k) && typeof entries[k] === "string" && entries[k]; });
    return Promise.all(keys.map(function (k) {
      return decodeAny(entries[k], k).then(function (r) { return r; }, function () { return []; });
    })).then(function (lists) {
      var out = [];
      lists.forEach(function (l) { out = out.concat(l); });
      if (!out.length) throw new Error("No readable save entries were found.");
      return out;
    });
  }

  // ---- normalising ------------------------------------------------------------------------------------------------
  function decodeNickname(nick) {
    if (!nick) return "";
    try { return decodeURIComponent(escape(atob(nick))); } catch (e) { return ""; }
  }

  var STAT_ITEMS = ["HP_UP", "PROTEIN", "IRON", "CALCIUM", "ZINC", "CARBOS"];

  /** Item key for a held or bag modifier; vitamins are named after their stat. */
  function itemKey(mod) {
    var id = mod.typeId || "";
    if (id === "BASE_STAT_BOOSTER") {
      var stat = mod.typePregenArgs && mod.typePregenArgs.length ? mod.typePregenArgs[0] : (mod.args ? mod.args[1] : null);
      return STAT_ITEMS[stat] || "VITAMIN";
    }
    return id;
  }

  function normalizePokemon(p, isPlayer, waveIndex, modeEndless) {
    var fusion = p.fusionSpecies ? { id: p.fusionSpecies, form: p.fusionFormIndex || 0, slot: p.fusionAbilityIndex || 0 } : null;
    var custom = p.customPokemonData || {};
    var fCustom = p.fusionCustomPokemonData || {};
    var baseForm = data.form(p.species, p.formIndex || 0);
    var known = !!baseForm;
    var types = known ? data.fusedTypes(
      [custom.types && custom.types[0] != null ? custom.types[0] : baseForm.types[0], custom.types && custom.types[1] != null ? custom.types[1] : baseForm.types[1]],
      fusion && data.form(fusion.id, fusion.form) ? data.form(fusion.id, fusion.form).types : null) : [];
    var ability = 0;
    if (known) {
      if (fusion && data.sp(fusion.id)) ability = (fCustom.ability != null && fCustom.ability !== -1) ? fCustom.ability : data.abilityAt(fusion.id, fusion.form, fusion.slot);
      else ability = (custom.ability != null && custom.ability !== -1) ? custom.ability : data.abilityAt(p.species, p.formIndex || 0, p.abilityIndex || 0);
    }
    var passiveId = known ? ((custom.passive != null && custom.passive !== -1) ? custom.passive : data.passive(p.species, p.formIndex || 0)) : 0;
    var boss = !!p.boss || (p.bossSegments || 0) > 0;
    // Pokemon.hasPassive: unlocked starters and bosses, except the Eternatus waves of Endless
    var passiveOn = isPlayer ? !!p.passive : (!!p.passive || boss) && !(modeEndless && waveIndex % 250 === 0);
    var nature = (custom.nature != null && custom.nature !== -1) ? custom.nature : (p.nature || 0);
    var moves = (p.moveset || []).map(function (m) { return m && (m.moveId != null ? m.moveId : m); }).filter(function (m) { return typeof m === "number" && m > 0; });
    var stats = Array.isArray(p.stats) ? p.stats.slice(0, 6) : [];
    return {
      id: p.id, species: p.species, form: p.formIndex || 0, fusion: fusion, known: known,
      name: known ? data.pokemonName(p.species, p.formIndex || 0, fusion ? fusion.id : 0, fusion ? fusion.form : 0) : "Species #" + p.species,
      nickname: decodeNickname(p.nickname),
      level: p.level || 0, hp: p.hp || 0, maxHp: stats[0] || 0, stats: stats, ivs: Array.isArray(p.ivs) ? p.ivs.slice(0, 6) : [],
      nature: nature, moves: moves, ability: ability, passive: passiveId, passiveOn: passiveOn, types: types,
      tera: p.teraType != null ? p.teraType : -1, terastallized: !!p.isTerastallized,
      shiny: !!p.shiny || !!p.fusionShiny, variant: p.shiny ? (p.variant || 0) : (p.fusionShiny ? (p.fusionVariant || 0) : 0),
      boss: boss, segments: p.bossSegments || 0, status: p.status && p.status.effect ? p.status.effect : 0,
      starter: p.metBiome === -1, items: {},
      // what a catch would add to the dex (Pokemon.getDexAttr and abilityIndex): the base species only, never the fusion
      dexKey: { shiny: !!p.shiny, variant: p.variant || 0, gender: p.gender == null ? -1 : p.gender, slot: p.abilityIndex || 0 }
    };
  }

  /** Session save -> the compact picture the assistant works from. */
  function normalizeSession(raw) {
    var mode = raw.gameMode;
    var endless = mode === 1 || mode === 2;
    var wave = raw.waveIndex || 0;
    var byId = {};
    var party = (raw.party || []).map(function (p) { var n = normalizePokemon(p, true, wave, endless); byId[n.id] = n; return n; });
    var enemies = (raw.enemyParty || []).map(function (p) { var n = normalizePokemon(p, false, wave, endless); byId[n.id] = n; return n; });
    var bag = {}, lures = [], tokens = {};
    (raw.modifiers || []).forEach(function (m) {
      if (!m || !m.typeId) return;
      var key = itemKey(m), count = m.stackCount || 1;
      if (m.className === "DoubleBattleChanceBoosterModifier" || /(^|_)LURE$/.test(m.typeId)) {
        lures.push({ tier: m.typeId, max: m.args ? m.args[0] : 0, left: m.args ? m.args[1] : 0 });
        return;
      }
      var holder = m.args && typeof m.args[0] === "number" ? byId[m.args[0]] : null;
      if (holder && holder.id === m.args[0] && party.indexOf(holder) !== -1) holder.items[key] = (holder.items[key] || 0) + count;
      else bag[key] = (bag[key] || 0) + count;
    });
    (raw.enemyModifiers || []).forEach(function (m) {
      if (!m || !m.typeId) return;
      var key = itemKey(m), count = m.stackCount || 1;
      var holder = m.args && typeof m.args[0] === "number" ? byId[m.args[0]] : null;
      if (holder && enemies.indexOf(holder) !== -1) holder.items[key] = (holder.items[key] || 0) + count;
      else tokens[key] = (tokens[key] || 0) + count;
    });
    var balls = [0, 0, 0, 0, 0];
    if (raw.pokeballCounts) for (var b = 0; b < 5; b++) balls[b] = raw.pokeballCounts[b] || 0;
    var arena = raw.arena || {};
    return {
      kind: "session", timestamp: raw.timestamp || 0, version: raw.gameVersion || "", mode: mode, endless: endless,
      wave: wave, money: raw.money || 0, battleType: raw.battleType || 0,
      double: enemies.length > 1, party: party, enemies: enemies, bag: bag, lures: lures, tokens: tokens, balls: balls,
      biome: arena.biome != null ? arena.biome : -1,
      weather: arena.weather && arena.weather.weatherType ? arena.weather.weatherType : 0,
      terrain: arena.terrain && arena.terrain.terrainType ? arena.terrain.terrainType : 0,
      playTime: raw.playTime || 0, name: raw.name || ""
    };
  }

  function longKeys(entry) {
    if (!entry || typeof entry !== "object") return {};
    var out = {};
    for (var k in entry) out[SHORT_KEYS[k] || k] = entry[k];
    return out;
  }

  function isCaught(attr) {
    if (attr == null) return false;
    if (typeof attr === "number") return attr !== 0;
    var s = String(attr);
    return s !== "" && s !== "0";
  }
  function hasBit(attr, bit) {
    try { return (BigInt(attr || 0) & BigInt(bit)) !== BigInt(0); } catch (e) { return false; }
  }

  /** System save -> unlocks per starter plus the caught and shiny dex sets. Trainer ids are not kept. */
  function normalizeSystem(raw) {
    var starters = {}, caught = [], shiny = [], dexAttrs = {}, abilities = {};
    var dex = raw.dexData || {}, sd = raw.starterData || {};
    for (var id in dex) {
      var e = longKeys(dex[id]);
      if (isCaught(e.caughtAttr)) {
        caught.push(+id);
        dexAttrs[+id] = String(e.caughtAttr);
        if (hasBit(e.caughtAttr, 2)) shiny.push(+id);
      }
    }
    for (var sid in sd) {
      var st = longKeys(sd[sid]);
      var de = longKeys(dex[sid]);
      if (st.abilityAttr) abilities[+sid] = st.abilityAttr;
      if (!data.sp(+sid) || !data.sp(+sid).c) continue;
      starters[+sid] = {
        caught: isCaught(de.caughtAttr),
        abilityAttr: st.abilityAttr || 0, passiveAttr: st.passiveAttr || 0, eggMoves: st.eggMoves || 0,
        candy: st.candyCount || 0, reductions: st.valueReduction || 0,
        natureAttr: Number(de.natureAttr || 0), ivs: Array.isArray(de.ivs) ? de.ivs.slice(0, 6) : []
      };
    }
    var stats = raw.gameStats || {};
    return {
      kind: "system", timestamp: raw.timestamp || 0, version: raw.gameVersion || "",
      starters: starters, caught: caught, shiny: shiny, dexAttrs: dexAttrs, abilities: abilities,
      highestEndlessWave: stats.highestEndlessWave || 0
    };
  }

  function normalize(decoded) {
    return decoded.kind === "session" ? normalizeSession(decoded.raw) : normalizeSystem(decoded.raw);
  }

  return {
    md5: md5, deriveKey: deriveKey, decryptText: decryptText, decodeAny: decodeAny, decodeEntries: decodeEntries,
    kindOf: kindOf, normalizeSession: normalizeSession, normalizeSystem: normalizeSystem, normalize: normalize,
    itemKey: itemKey, _aesCbcDecryptJs: aesCbcDecryptJs
  };
})();
