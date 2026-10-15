import { fileURLToPath } from "node:url";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { loadNZ } from "./load.mjs";
import { decryptPrsv, encryptPrsv } from "./prsv.mjs";
const NZ = loadNZ(["00-util.js", "10-data.js", "30-save.js"]);
const save = NZ.save, d = NZ.data;
const dir = fileURLToPath(new URL("./fixtures/saves/", import.meta.url));

// MD5 against node's implementation, across block boundaries
for (const n of [0, 1, 55, 56, 57, 63, 64, 65, 119, 120, 1000]) {
  const bytes = new Uint8Array(n).map((_, i) => (i * 31 + 7) & 255);
  assert.equal(Buffer.from(save.md5(bytes)).toString("hex"), createHash("md5").update(bytes).digest("hex"), `md5 len ${n}`);
}

// the game's own encrypted fixtures, through WebCrypto and through the plain-JS AES
for (const f of ["everything.prsv", "data_new.prsv", "full_unlocks_sanitized.prsv", "data_pokedex_tests_v2.prsv"]) {
  const text = readFileSync(dir + f, "utf8");
  const expected = decryptPrsv(text);
  assert.equal(await save.decryptText(text), expected, `${f} via WebCrypto`);
  assert.equal(await save.decryptText(text, { forceJs: true }), expected, `${f} via JS AES`);
}

// decodeAny on a real system export
const sys = await save.decodeAny(readFileSync(dir + "full_unlocks_sanitized.prsv", "utf8"));
assert.equal(sys.length, 1);
assert.equal(sys[0].kind, "system");
const nsys = save.normalize(sys[0]);
assert.equal(nsys.version, "1.10.7");
const teddi = nsys.starters[d.S.TEDDIURSA];
assert.ok(teddi && teddi.caught, "Teddiursa caught in the full-unlock save");
assert.equal(teddi.passiveAttr & 1, 1);
assert.equal(teddi.abilityAttr, 7);
assert.equal(nsys.starters[d.S.REGIGIGAS].abilityAttr & 4, 4, "Regigigas hidden ability unlocked");
assert.equal(nsys.starters[d.S.REGIGIGAS].ivs[5], 31);
assert.ok(nsys.caught.length > 900);
assert.equal(Object.keys(nsys.dexAttrs).length, nsys.caught.length, "dex bits kept for every caught species");
assert.equal(nsys.abilities[d.S.TEDDIURSA], 7);
assert.ok(!("trainerId" in nsys) && !("secretId" in nsys));

const fresh = save.normalize((await save.decodeAny(readFileSync(dir + "data_new.prsv", "utf8")))[0]);
assert.equal(fresh.starters[d.S.TEDDIURSA].caught, false);
assert.equal(fresh.caught.length, 27, "a new save has only the 27 default starters");
assert.equal(fresh.starters[d.S.BULBASAUR].caught, true);

// rejects junk with a readable message
await assert.rejects(save.decodeAny("hello world"), /not|recognise/i);
await assert.rejects(save.decodeAny(""), /Nothing/);
await assert.rejects(save.decodeAny(encryptPrsv(JSON.stringify({ foo: 1 }))), /not a session or system/);
await assert.rejects(save.decodeAny("{\"a\":1}"), /not a PokéRogue/);
console.log("save decrypt tests passed");
