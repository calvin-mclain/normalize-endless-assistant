// Assembles the single-file page: styles, game data, sample saves and scripts inlined.
//   dist/normalize-endless-assistant.html  -> page content for publishing (the host adds the document skeleton)
//   dist/normalize-assistant-offline.html  -> the same page as a complete document, to open from disk
//   index.html                             -> that complete document again, served by GitHub Pages
import { readFileSync, writeFileSync, readdirSync, mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { samples } from "./make_samples.mjs";
const ROOT = fileURLToPath(new URL("..", import.meta.url)).replace(/\/$/, "");
const read = p => readFileSync(`${ROOT}/${p}`, "utf8");
const LS = String.fromCharCode(0x2028), PS = String.fromCharCode(0x2029);
const safeJson = v => JSON.stringify(v).replace(/</g, "\\u003c").split(LS).join("\\u2028").split(PS).join("\\u2029");

const css = read("src/styles.css");
const data = JSON.parse(read("data/game-data.json"));
const js = readdirSync(`${ROOT}/src/js`).filter(f => f.endsWith(".js")).sort().map(f => `/* ${f} */\n` + read(`src/js/${f}`)).join("\n");
if (/<\/script/i.test(js)) throw new Error("script text contains a closing script tag");
const sampleData = Object.fromEntries(Object.entries(samples).map(([k, fn]) => [k, fn()]));

const content = [
  read("src/head.html").trim(),
  `<style>\n${css}</style>`,
  read("src/body.html").trim(),
  `<script>window.NZ_DATA=${safeJson(data)};window.NZ_SAMPLES=${safeJson(sampleData)};</script>`,
  `<script>\n${js}\n</script>`,
].join("\n");

const reset = ":root{color-scheme:light;padding:env(safe-area-inset-top,0px) 0 env(safe-area-inset-bottom,0px)}body{margin:0;font:14px system-ui,sans-serif}img{max-width:100%}[hidden]{display:none!important}";
const standalone = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><style>${reset}</style></head><body>\n${content}\n</body></html>\n`;

mkdirSync(`${ROOT}/dist`, { recursive: true });
writeFileSync(`${ROOT}/dist/normalize-endless-assistant.html`, content + "\n");
writeFileSync(`${ROOT}/dist/normalize-assistant-offline.html`, standalone);
writeFileSync(`${ROOT}/index.html`, standalone);
console.log("page", (content.length / 1024).toFixed(0) + " KB", "| scripts", (js.length / 1024).toFixed(0) + " KB", "| data", (safeJson(data).length / 1024).toFixed(0) + " KB");
