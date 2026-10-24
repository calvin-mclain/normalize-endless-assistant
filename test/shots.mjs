import { fileURLToPath } from "node:url";
// Renders the built page in headless Chromium and saves screenshots; prints console errors and layout overflow.
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || "playwright");
import { mkdirSync } from "node:fs";
const OUT = fileURLToPath(new URL("./shots", import.meta.url));
mkdirSync(OUT, { recursive: true });
const url = new URL("../dist/normalize-assistant-offline.html", import.meta.url).href;
const which = process.argv[2] || "all";
const browser = await chromium.launch();
const errors = [];
async function shoot(name, { width, height, scheme, tab, sample, full = true, prep }) {
  const ctx = await browser.newContext({ viewport: { width, height }, colorScheme: scheme, deviceScaleFactor: 1 });
  const page = await ctx.newPage();
  page.on("console", m => { if (m.type() === "error" && !/ERR_TUNNEL_CONNECTION_FAILED|ERR_NAME_NOT_RESOLVED|ERR_INTERNET_DISCONNECTED/.test(m.text())) errors.push(`${name}: ${m.text()}`); });
  page.on("pageerror", e => errors.push(`${name}: PAGEERROR ${e.message}`));
  await page.goto(url + (tab ? "#" + tab : ""));
  await page.waitForSelector(".view-head");
  if (sample) { await page.evaluate(s => NZ.bridge.loadSample(s), sample); if (tab) await page.evaluate(t => NZ.ui.setTab(t), tab); }
  if (prep) await prep(page);
  await page.waitForTimeout(150);
  const overflow = await page.evaluate(() => {
    const de = document.documentElement;
    const wide = [];
    if (de.scrollWidth > de.clientWidth + 1) {
      for (const el of document.querySelectorAll("body *")) {
        const r = el.getBoundingClientRect();
        if (r.right > de.clientWidth + 1 && r.width > 0 && !el.closest(".table-wrap, .code-box")) { wide.push(`${el.tagName}.${el.className} right=${Math.round(r.right)}`); if (wide.length > 6) break; }
      }
    }
    return { scrollWidth: de.scrollWidth, clientWidth: de.clientWidth, wide };
  });
  if (overflow.scrollWidth > overflow.clientWidth + 1) errors.push(`${name}: horizontal overflow ${overflow.scrollWidth} > ${overflow.clientWidth}: ${overflow.wide.join(" | ")}`);
  await page.screenshot({ path: `${OUT}/${name}.png`, fullPage: full });
  await ctx.close();
}
const jobs = {
  "party-light": { width: 1280, height: 900, scheme: "light", tab: "party" },
  "party-dark": { width: 1280, height: 900, scheme: "dark", tab: "party" },
  "carry-sample-light": { width: 1280, height: 900, scheme: "light", tab: "carry", sample: "carry" },
  "carry-sample-dark": { width: 1280, height: 900, scheme: "dark", tab: "carry", sample: "carry" },
  "run-manual-light": { width: 1280, height: 900, scheme: "light", tab: "run" },
  "run-shiny-dark": { width: 1280, height: 900, scheme: "dark", tab: "run", sample: "shiny" },
  "run-boss-light": { width: 1280, height: 900, scheme: "light", tab: "run", sample: "boss" },
  "run-shiny-compact-light": { width: 1280, height: 900, scheme: "light", tab: "run", sample: "shiny", prep: p => p.evaluate(() => NZ.ui.setDensity("compact")) },
  "carry-sample-compact-dark": { width: 1280, height: 900, scheme: "dark", tab: "carry", sample: "carry", prep: p => p.evaluate(() => NZ.ui.setDensity("compact")) },
  "sync-light": { width: 1280, height: 900, scheme: "light", tab: "sync" },
  "party-phone": { width: 400, height: 800, scheme: "light", tab: "party" },
  "carry-phone": { width: 400, height: 800, scheme: "dark", tab: "carry", sample: "carry" },
  "run-phone": { width: 400, height: 800, scheme: "light", tab: "run", sample: "boss" },
  "sync-phone": { width: 400, height: 800, scheme: "dark", tab: "sync" },
};
for (const [name, job] of Object.entries(jobs)) if (which === "all" || name.includes(which)) await shoot(name, job);
await browser.close();
console.log(errors.length ? "ISSUES:\n" + errors.join("\n") : "no console errors, no horizontal overflow");
