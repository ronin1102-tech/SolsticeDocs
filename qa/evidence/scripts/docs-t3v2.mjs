// T3 v2: settled sampling. Truth = DOM: truePage = 1 + #{children with offsetTop <= viewportCenter}.
import { chromium } from "playwright";
import { writeFileSync } from "node:fs";
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
await page.goto("http://localhost:1420/?qa=1", { waitUntil: "domcontentloaded" });
await page.waitForFunction(() => /1200 pages/.test(document.querySelector('[data-qa="status"]')?.textContent || ""), null, { timeout: 30000 });
await page.evaluate(() => {
  window.__lt = [];
  new PerformanceObserver((l) => { for (const e of l.getEntries()) window.__lt.push(e.duration); }).observe({ entryTypes: ["longtask"] });
});
const readTruth = () =>
  page.evaluate(() => {
    const sc = document.querySelector('[data-qa="scroller"]');
    const kids = sc.firstElementChild.children;
    const center = sc.scrollTop + sc.clientHeight / 2;
    // binary search: kids' offsetTop is ascending
    let lo = 0, hi = kids.length - 1;
    while (lo < hi) { const mid = (lo + hi + 1) >> 1; if (kids[mid].offsetTop <= center) lo = mid; else hi = mid - 1; }
    return { st: sc.scrollTop, truePage: lo + 1, ind: parseInt(document.querySelector('[data-qa="page"]').textContent, 10) };
  });
const settled = async () => {
  let prev = -1;
  for (let i = 0; i < 20; i++) {
    const st = await page.evaluate(() => document.querySelector('[data-qa="scroller"]').scrollTop);
    if (st === prev) return st;
    prev = st;
    await page.waitForTimeout(150);
  }
  return prev;
};
const samples = [];
for (let i = 0; i < 30; i++) {
  await page.mouse.move(640, 400);
  await page.mouse.wheel(0, 33000);
  await settled();
  const r = await readTruth();
  r.drift = r.ind - r.truePage;
  samples.push(r);
  if (r.st > 949000) break;
}
const lt = await page.evaluate(() => ({ count: window.__lt.length, max: Math.max(0, ...window.__lt), total: Math.round(window.__lt.reduce((a, b) => a + b, 0)) }));
const maxDrift = Math.max(...samples.map((s) => Math.abs(s.drift)));
const out = { samples, maxDrift, longTasks: lt };
writeFileSync("/Users/solstice-agent/.scratch/docs-t3v2-results.json", JSON.stringify(out, null, 2));
console.log(JSON.stringify(out));
await browser.close();
