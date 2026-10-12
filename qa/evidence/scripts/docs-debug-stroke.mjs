// One-shot debug: do annotation strokes land at all? Trusted vs synthetic,
// in-viewport coords, plus overlay bitmap size check.
import { chromium } from "playwright";
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
await page.goto("http://localhost:1420/?qa=1&page=3", { waitUntil: "domcontentloaded" });
await page.waitForFunction(() => /1200 pages/.test(document.querySelector('[data-qa="status"]')?.textContent || ""), null, { timeout: 20000 });

const info = await page.evaluate(() => {
  const c = document.querySelector('[data-qa="overlay-3"]');
  const r = c.getBoundingClientRect();
  window.__evts = [];
  for (const t of ["mousedown", "mousemove", "mouseup"])
    c.addEventListener(t, (e) => window.__evts.push(t + "@" + Math.round(e.clientX) + "," + Math.round(e.clientY)), { capture: true });
  return { bitmap: [c.width, c.height], css: [Math.round(r.width), Math.round(r.height)], top: Math.round(r.top), ind: document.querySelector('[data-qa="page"]').textContent };
});
console.log("INFO", JSON.stringify(info));

// scroll page 3 into view (pitch 808 = 792 + 16 margin)
await page.evaluate(() => { document.querySelector('[data-qa="scroller"]').scrollTop = 2 * 808; });
await page.waitForTimeout(400);
const box = await page.locator('[data-qa="overlay-3"]').boundingBox();
console.log("BOX", JSON.stringify(box), "evts:", await page.evaluate(() => window.__evts.length));

// A: trusted Playwright stroke, in-viewport
await page.mouse.move(box.x + 100, box.y + box.height * 0.3);
await page.mouse.down();
await page.mouse.move(box.x + 400, box.y + box.height * 0.3, { steps: 5 });
await page.mouse.up();
await page.waitForTimeout(300);
const afterA = await page.evaluate(() => ({
  evts: window.__evts.length,
  ls: !!localStorage.getItem("solsticedocs.session.v1"),
  px: (() => { const c = document.querySelector('[data-qa="overlay-3"]'); const d = c.getContext("2d").getImageData(150, 45, 1, 1).data; return [d[0], d[1], d[2], d[3]]; })(),
}));
console.log("A(trusted)", JSON.stringify(afterA));

// B: synthetic DOM events (bypasses Playwright hit-testing)
await page.evaluate(() => {
  const c = document.querySelector('[data-qa="overlay-3"]');
  const r = c.getBoundingClientRect();
  const y = r.top + r.height * 0.5;
  const opts = (x) => ({ bubbles: true, cancelable: true, clientX: r.left + x, clientY: y, button: 0 });
  c.dispatchEvent(new MouseEvent("mousedown", opts(100)));
  for (let i = 1; i <= 5; i++) c.dispatchEvent(new MouseEvent("mousemove", opts(100 + i * 60)));
  c.dispatchEvent(new MouseEvent("mouseup", opts(400)));
});
await page.waitForTimeout(300);
const afterB = await page.evaluate(() => ({
  ls: localStorage.getItem("solsticedocs.session.v1")?.slice(0, 220) ?? "EMPTY",
}));
console.log("B(synthetic)", JSON.stringify(afterB));
await browser.close();
