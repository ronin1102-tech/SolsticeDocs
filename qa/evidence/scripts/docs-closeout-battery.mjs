// DOCS-03-RENDER close-out battery — runs against the dev server on :1420.
// One pass, fresh browser context per subtest, JSON evidence out.
// Subtests:
//   T0 deep-link ?page=600 — indicator vs actual viewport position
//   T1 annotation → localStorage → reload → restored (shallow page 3, drift-free)
//   T2 zoom round-trip ?zoom=1.5 → +0.25 → reload, overlay pixel survives rescale
//   T3 deep wheel scroll 1,200 pages — indicator drift + long-task profile
import { chromium } from "playwright";
import { writeFileSync } from "node:fs";

const BASE = "http://localhost:1420";
const OUT = "/Users/solstice-agent/.scratch/docs-qa-results.json";
const results = { startedAt: new Date().toISOString(), base: BASE, subtests: {}, consoleErrors: [] };
const PITCH = 792 + 16; // PAGE_H * zoom + mb-4 margin (zoom 1)

function assert(R, name, cond, detail) {
  R.checks.push({ name, pass: !!cond, detail });
  console.log(`${cond ? "PASS" : "FAIL"}  ${name}${detail !== undefined ? "  — " + JSON.stringify(detail) : ""}`);
}

async function fresh(url) {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const page = await ctx.newPage();
  page.on("pageerror", (e) => results.consoleErrors.push("pageerror: " + e));
  page.on("console", (m) => { if (m.type() === "error") results.consoleErrors.push("console: " + m.text()); });
  await page.goto(BASE + url, { waitUntil: "domcontentloaded" });
  return { ctx, page };
}

const readout = (p) =>
  p.evaluate(() => ({
    st: document.querySelector('[data-qa="scroller"]')?.scrollTop ?? -1,
    ind: document.querySelector('[data-qa="page"]')?.textContent ?? "?",
    zoom: document.querySelector('[data-qa="zoom"]')?.textContent ?? "?",
    status: document.querySelector('[data-qa="status"]')?.textContent ?? "?",
    lt: (window.__lt || []).length,
    ltTotal: Math.round((window.__lt || []).reduce((a, b) => a + b, 0)),
  }));

// pixel probe of a canvas at fractional coords → [r,g,b,a]
const probe = (p, sel, fx, fy) =>
  p.evaluate(([sel, fx, fy]) => {
    const c = document.querySelector(sel);
    if (!c) return null;
    const ctx = c.getContext("2d");
    const d = ctx.getImageData(Math.floor(c.width * fx), Math.floor(c.height * fy), 1, 1).data;
    return [d[0], d[1], d[2], d[3]];
  }, [sel, fx, fy]);

const browser = await chromium.launch();

try {
  // ---------- T0: deep link ----------
  {
    const R = { checks: [] };
    results.subtests.T0_deeplink_p600 = R;
    const { ctx, page } = await fresh("/?qa=1&page=600");
    await page.waitForFunction(() => /p600/.test(document.querySelector('[data-qa="status"]')?.textContent || ""), null, { timeout: 20000 });
    const r = await readout(page);
    const box = await page.locator('[data-qa="overlay-600"]').boundingBox();
    assert(R, "indicator shows 600", r.ind === "600", r.ind);
    assert(R, "p600 canvas rendered (window)", box !== null);
    assert(R, "viewport actually at page 600", box && Math.abs(box.y) < 900, { overlay600ViewportY: box?.y, scrollTop: r.st });
    R.readout = r;
    await ctx.close();
  }

  // ---------- T1: annotation → persist → reload ----------
  {
    const R = { checks: [] };
    results.subtests.T1_anno_persist_reload = R;
    const { ctx, page } = await fresh("/?qa=1&page=3");
    await page.waitForFunction(() => /p3/.test(document.querySelector('[data-qa="status"]')?.textContent || ""), null, { timeout: 20000 });
    const badge = await page.locator("header").innerText();
    assert(R, "STORAGE:BROWSER badge", badge.includes("STORAGE:BROWSER"), badge.replace(/\s+/g, " "));

    const box = await page.locator('[data-qa="overlay-3"]').boundingBox();
    const y = box.y + box.height * 0.25;
    await page.mouse.move(box.x + 40, y);
    await page.mouse.down();
    for (let i = 1; i <= 8; i++) await page.mouse.move(box.x + 40 + (i * (box.width - 80)) / 8, y);
    await page.mouse.up();
    await page.waitForTimeout(200);

    const stored = await page.evaluate(() => JSON.parse(localStorage.getItem("solsticedocs.session.v1") || "null"));
    assert(R, "session saved after stroke", !!stored);
    assert(R, "1 annotation stored", stored?.annotations?.length === 1, stored?.annotations?.length);
    assert(R, "annotation on page 3", stored?.annotations?.[0]?.page === 3);
    assert(R, "rects in PDF units", stored?.annotations?.[0]?.rects?.[0]?.length === 4, stored?.annotations?.[0]?.rects?.[0]);
    const livePixel = await probe(page, '[data-qa="overlay-3"]', 0.5, 0.25);
    assert(R, "highlight pixel visible live", livePixel && livePixel[3] > 40 && livePixel[0] > 200, livePixel);

    // reload with page=1 in URL: if page restores to 3, it came from the session, not the deep link
    await page.goto(BASE + "/?qa=1&page=1", { waitUntil: "domcontentloaded" });
    await page.waitForFunction(() => /p3|restored/.test(document.querySelector('[data-qa="status"]')?.textContent || ""), null, { timeout: 20000 });
    const r2 = await readout(page);
    assert(R, "restored to page 3 (not deep-link 1)", r2.ind === "3", r2.ind);
    const annoSpan = await page.locator('[data-qa="annos-3"]').innerText().catch(() => null);
    assert(R, "annos-3 hook count restored", annoSpan === "1", annoSpan);
    const pixelReload = await probe(page, '[data-qa="overlay-3"]', 0.5, 0.25);
    assert(R, "highlight pixel visible after reload", pixelReload && pixelReload[3] > 40 && pixelReload[0] > 200, pixelReload);
    R.pixels = { livePixel, pixelReload };
    await ctx.close();
  }

  // ---------- T2: zoom round-trip ----------
  {
    const R = { checks: [] };
    results.subtests.T2_zoom_roundtrip = R;
    const { ctx, page } = await fresh("/?qa=1&page=1&zoom=1.5");
    await page.waitForFunction(() => /p1/.test(document.querySelector('[data-qa="status"]')?.textContent || "") && !/rendering/.test(document.querySelector('[data-qa="status"]')?.textContent || ""), null, { timeout: 20000 });
    let r = await readout(page);
    assert(R, "zoom 150% from deep link", r.zoom === "150%", r.zoom);

    const box = await page.locator('[data-qa="overlay-1"]').boundingBox();
    const y = box.y + box.height * 0.6;
    await page.mouse.move(box.x + 40, y);
    await page.mouse.down();
    for (let i = 1; i <= 8; i++) await page.mouse.move(box.x + 40 + (i * (box.width - 80)) / 8, y);
    await page.mouse.up();
    await page.waitForTimeout(200);
    const before = await probe(page, '[data-qa="overlay-1"]', 0.5, 0.6);
    assert(R, "highlight pixel at 150%", before && before[3] > 40, before);

    await page.locator('button:has-text("+")').click();
    await page.waitForFunction(() => document.querySelector('[data-qa="zoom"]')?.textContent === "175%", null, { timeout: 10000 });
    await page.waitForTimeout(400); // allow re-render + overlay redraw
    const after = await probe(page, '[data-qa="overlay-1"]', 0.5, 0.6);
    assert(R, "highlight pixel survives 150→175 rescale", after && after[3] > 40, after);
    r = await readout(page);

    await page.reload({ waitUntil: "domcontentloaded" });
    await page.waitForFunction(() => document.querySelector('[data-qa="zoom"]')?.textContent === "175%", null, { timeout: 20000 });
    const stored = await page.evaluate(() => JSON.parse(localStorage.getItem("solsticedocs.session.v1") || "null"));
    assert(R, "zoom persisted 1.75", stored?.zoom === 1.75, stored?.zoom);
    assert(R, "indicator restored 175% (over deep-link 150%)", (await readout(page)).zoom === "175%");
    const afterReload = await probe(page, '[data-qa="overlay-1"]', 0.5, 0.6);
    assert(R, "highlight pixel after zoom-reload", afterReload && afterReload[3] > 40, afterReload);
    R.pixels = { before, after, afterReload };
    await ctx.close();
  }

  // ---------- T3: deep scroll drift + long tasks ----------
  {
    const R = { checks: [] };
    results.subtests.T3_deep_scroll = R;
    const { ctx, page } = await fresh("/?qa=1");
    await page.waitForFunction(() => /1200 pages/.test(document.querySelector('[data-qa="status"]')?.textContent || ""), null, { timeout: 30000 });
    await page.evaluate(() => {
      window.__lt = [];
      new PerformanceObserver((l) => { for (const e of l.getEntries()) window.__lt.push(e.duration); }).observe({ entryTypes: ["longtask"] });
    });
    const samples = [];
    for (let i = 0; i < 46; i++) {
      await page.mouse.move(640, 400);
      await page.mouse.wheel(0, 25000);
      await page.waitForTimeout(120);
      const r = await readout(page);
      r.truePage = Math.floor(r.st / PITCH) + 1;
      r.drift = parseInt(r.ind, 10) - r.truePage;
      samples.push(r);
      if (r.st >= (1200 - 6) * PITCH) break;
    }
    await page.evaluate(() => { const el = document.querySelector('[data-qa="scroller"]'); el.scrollTop = el.scrollHeight; });
    await page.waitForTimeout(500);
    const bottom = await readout(page);
    bottom.truePage = 1200; bottom.drift = parseInt(bottom.ind, 10) - 1200;
    samples.push(bottom);
    const maxDrift = Math.max(...samples.map((s) => Math.abs(s.drift)));
    const ltCount = bottom.lt, ltTotal = bottom.ltTotal;
    assert(R, "reached bottom (true p1200)", bottom.st > (1200 - 6) * PITCH, { scrollTop: bottom.st });
    assert(R, "indicator tracks within ±1 whole way", maxDrift <= 1, { maxDrift });
    const ltMax = await page.evaluate(() => Math.max(0, ...(window.__lt || [])));
    assert(R, "no long task > 300ms", ltMax <= 300, { ltCount, ltTotalMs: ltTotal, ltMaxMs: ltMax });
    R.samples = samples; R.longTasks = { count: ltCount, totalMs: ltTotal };
    await ctx.close();
  }
} catch (e) {
  results.fatal = String(e && e.stack || e);
}

results.finishedAt = new Date().toISOString();
writeFileSync(OUT, JSON.stringify(results, null, 2));
console.log("\nresults → " + OUT);
await browser.close();
