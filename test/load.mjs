import { fileURLToPath } from "node:url";
// Loads the browser scripts into this Node process the same way the page does (one shared NZ namespace).
import { readFileSync, readdirSync } from "node:fs";
import vm from "node:vm";
const ROOT = fileURLToPath(new URL("..", import.meta.url)).replace(/\/$/, "");
export function loadNZ(files) {
  const dir = `${ROOT}/src/js`;
  // Logic only by default: files numbered 50 and up are the page (they need a DOM).
  const list = files || readdirSync(dir).filter(f => f.endsWith(".js") && Number(f.slice(0, 2)) < 50).sort();
  for (const f of list) vm.runInThisContext(readFileSync(`${dir}/${f}`, "utf8"), { filename: f });
  globalThis.NZ.data.init(JSON.parse(readFileSync(`${ROOT}/data/game-data.json`, "utf8")));
  return globalThis.NZ;
}
