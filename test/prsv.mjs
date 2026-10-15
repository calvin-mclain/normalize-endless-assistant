// CryptoJS-compatible AES (OpenSSL "Salted__" container, MD5 EVP_BytesToKey, AES-256-CBC) via node:crypto.
import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";
export const SAVE_KEY = "x0i2O7WRiANTqPmZ";
function kdf(pass, salt) {
  let d = Buffer.alloc(0), prev = Buffer.alloc(0);
  while (d.length < 48) {
    prev = createHash("md5").update(Buffer.concat([prev, Buffer.from(pass, "utf8"), salt])).digest();
    d = Buffer.concat([d, prev]);
  }
  return { key: d.subarray(0, 32), iv: d.subarray(32, 48) };
}
export function decryptPrsv(b64, pass = SAVE_KEY) {
  const raw = Buffer.from(b64.trim(), "base64");
  if (raw.subarray(0, 8).toString("latin1") !== "Salted__") throw new Error("not a salted container");
  const { key, iv } = kdf(pass, raw.subarray(8, 16));
  const dec = createDecipheriv("aes-256-cbc", key, iv);
  return Buffer.concat([dec.update(raw.subarray(16)), dec.final()]).toString("utf8");
}
export function encryptPrsv(text, pass = SAVE_KEY) {
  const salt = randomBytes(8);
  const { key, iv } = kdf(pass, salt);
  const enc = createCipheriv("aes-256-cbc", key, iv);
  return Buffer.concat([Buffer.from("Salted__", "latin1"), salt, enc.update(Buffer.from(text, "utf8")), enc.final()]).toString("base64");
}
