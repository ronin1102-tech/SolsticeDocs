// Battery v2 — post-fix verification for RENDER-SPEC C1/C1a/C2/C3.
// Replaces the T0 bbox check with DOM-truth (T0'), adds T3' pitch + T4 precedence.
// Run against :1420 (vite serving the working tree).
import { chromium } from "playwright";
import { writeFileSync } from "node:fs";

const BASE = "http://localhost:1420";
const OUT = "/Users/solstice-agent/.scratch/docs-battery-v2-results.json";
const results = { startedAt: new Date().toISOString(), subtests: {}, consoleErrors: [] };
const checks = [];
function assert(id, name, cond, detail) {
  checks.push({ id, name, pass: !!cond, detail });
  console.log(`${cond ? "PASS" : "FAIL"}  [${id}] ${name}${detail !== undefined ? "  — " + JSON.stringify(detail) : ""}`);
}
async function fresh(url) {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const page = await ctx.newPage();
  page.on("pageerror", (e) => results.consoleErrors.push("pageerror: " + e));
  await page.goto(BASE + url, { waitUntil: "domcontentloaded" });
  return { ctx, page };
}
const probe = (p, sel, fx, fy) =>
  p.evaluate(([sel, fx, fy]) => {
    const c = document.querySelector(sel);
    if (!c) return null;
    const d = c.getContext("2d").getImageData(Math.floor(c.width * fx), Math.floor(c.height * fy), 1, 1).data;
    return [d[0], d[1], d[2], d[3]];
  }, [sel, fx, fy]);
const geo = (p, n) =>
  p.evaluate((n) => {
    const sc = document.querySelector('[data-qa="scroller"]');
    const col = sc.firstElementChild;
    const kid = (i) => col.children[i - 1];
    const overlay = (i) => document.querySelector(`[data-qa="overlay-${i}"]`);
    const o = overlay(n);
    return {
      st: sc.scrollTop,
      ind: parseInt(document.querySelector('[data-qa="page"]').textContent, 10),
      zoom: document.querySelector('[data-qa="zoom"]').textContent,
      status: document.querySelector('[data-qa="status"]').textContent,
      overlayBitmap: o ? [o.width, o.height] : null,
      overlayCss: o ? [Math.round(o.getBoundingClientRect().width), Math.round(o.getBoundingClientRect().height)] : null,
      pitches: [2, 3, 101, 601, 1200].map((i) => kid(i).offsetTop - kid(i - 1).offsetTop),
    };
  }, n);
const stroke = async (page, num, fy) => {
  const box = await page.locator(`[data-qa="overlay-${num}"]`).boundingBox();
  const y = box.y + box.height * fy;
  await page.mouse.move(box.x + 40, y);
  await page.mouse.down();
  for (let i = 1; i <= 8; i++) await page.mouse.move(box.x + 40 + (i * (box.width - 80)) / 8, y);
  await page.mouse.up();
  await page.waitForTimeout(250);
  return box;
};

const browser = await chromium.launch();
try {
  // ---------- T0 + T0' + T3' : deep link, DOM truth, pitch uniformity ----------
  {
    const { ctx, page } = await fresh("/?qa=1&page=600");
    await page.waitForFunction(() => document.querySelector('[data-qa="page"]')?.textContent === "600", null, { timeout: 20000 });
    await page.waitForTimeout(500);
    const g = await geo(page, 600);
    const vis = await page.evaluate(() => {
      const r = document.querySelector('[data-qa="overlay-600"]').getBoundingClientRect();
      return { top: Math.round(r.top), inView: r.top < 800 && r.bottom > 0 };
    });
    const truth = await page.evaluate(() => {
      const sc = document.querySelector('[data-qa="scroller"]');
      const kids = sc.firstElementChild.children;
      const center = sc.scrollTop + sc.clientHeight / 2;
      let lo = 0, hi = kids.length - 1;
      while (lo < hi) { const m = (lo + hi + 1) >> 1; if (kids[m].offsetTop <= center) lo = m; else hi = m - 1; }
      return lo + 1;
    });
    assert("T0", "indicator 600", g.ind === 600, g.ind);
    assert("T0", "overlay-600 in viewport", vis.inView, vis);
    assert("T0'", "indicator vs DOM truth ≤1", Math.abs(g.ind - truth) <= 1, { ind: g.ind, truth });
    assert("T3'", "pitch uniform (slots 1..1200)", new Set(g.pitches).size === 1, g.pitches);
    assert("C1", "overlay bitmap page-sized @100%", g.overlayBitmap[0] === 612 && g.overlayBitmap[1] === 792, g.overlayBitmap);
    assert("C1", "overlay CSS fills page box", Math.abs(g.overlayCss[0] - 612) < 2 && Math.abs(g.overlayCss[1] - 792) < 2, g.overlayCss);
    results.subtests.T0 = { g, vis, truth };
    await ctx.close();
  }

  // ---------- T1 + T4 : stroke → LS → reload → repaint; restore beats deep link ----------
  {
    const { ctx, page } = await fresh("/?qa=1&page=3");
    await page.waitForFunction(() => document.querySelector('[data-qa="page"]')?.textContent === "3", null, { timeout: 20000 });
    const g0 = await geo(page, 3);
    assert("C2", "mount scroll landed on p3 (top −4±6)", Math.abs(g0.st - (await page.evaluate(() => document.querySelector('[data-qa="scroller"]').firstElementChild.children[2].offsetTop)) + 4) < 8, g0.st);
    await stroke(page, 3, 0.25);
    const stored = await page.evaluate(() => JSON.parse(localStorage.getItem("solsticedocs.session.v1") || "null"));
    assert("T1", "1 annotation stored", stored?.annotations?.length === 1, stored?.annotations?.length);
    assert("T1", "annotation on page 3", stored?.annotations?.[0]?.page === 3);
    const r0 = stored?.annotations?.[0]?.rects?.[0];
    assert("C1a", "rect in PDF units, full-width band", r0 && r0[0] < 50 && r0[0] + r0[2] > 550 && Math.abs(r0[3] - 14) < 1, r0);
    const live = await probe(page, '[data-qa="overlay-3"]', 0.5, 0.25);
    assert("T1", "highlight pixel live", live && live[3] > 40 && live[0] > 200, live);
    // T4: reload with ?page=1 — session lastPage 3 must win
    await page.goto(BASE + "/?qa=1&page=1", { waitUntil: "domcontentloaded" });
    await page.waitForFunction(() => document.querySelector('[data-qa="page"]')?.textContent === "3", null, { timeout: 20000 });
    await page.waitForTimeout(400);
    const g1 = await geo(page, 3);
    assert("T4", "restore beats deep link (ind=3 over ?page=1)", g1.ind === 3, g1.ind);
    assert("T4", "badge annos-3 = 1", (await page.locator('[data-qa="annos-3"]').innerText().catch(() => null)) === "1");
    const rel = await probe(page, '[data-qa="overlay-3"]', 0.5, 0.25);
    assert("T1", "highlight pixel after reload", rel && rel[3] > 40 && rel[0] > 200, rel);
    results.subtests.T1_T4 = { g0, g1, live, rel, r0 };
    await ctx.close();
  }

  // ---------- T2 : zoom round-trip, resize repaint, persistence ----------
  {
    const { ctx, page } = await fresh("/?qa=1&page=1&zoom=1.5");
    await page.waitForFunction(() => document.querySelector('[data-qa="zoom"]')?.textContent === "150%", null, { timeout: 20000 });
    await page.waitForTimeout(500);
    const gA = await geo(page, 1);
    assert("C1", "overlay bitmap @150% = 918x1188", gA.overlayBitmap[0] === 918 && gA.overlayBitmap[1] === 1188, gA.overlayBitmap);
    await stroke(page, 1, 0.6);
    const b150 = await probe(page, '[data-qa="overlay-1"]', 0.5, 0.6);
    assert("T2", "highlight pixel @150%", b150 && b150[3] > 40, b150);
    await page.locator('button:has-text("+")').click();
    await page.waitForFunction(() => document.querySelector('[data-qa="zoom"]')?.textContent === "175%", null, { timeout: 10000 });
    await page.waitForTimeout(500);
    const gB = await geo(page, 1);
    assert("C1", "overlay bitmap re-sized @175% = 1071x1386", gB.overlayBitmap[0] === 1071 && gB.overlayBitmap[1] === 1386, gB.overlayBitmap);
    const b175 = await probe(page, '[data-qa="overlay-1"]', 0.5, 0.6);
    assert("T2", "highlight pixel survives 150→175 rescale", b175 && b175[3] > 40, b175);
    await page.reload({ waitUntil: "domcontentloaded" });
    await page.waitForFunction(() => document.querySelector('[data-qa="zoom"]')?.textContent === "175%", null, { timeout: 20000 });
    await page.waitForTimeout(500);
    const stored = await page.evaluate(() => JSON.parse(localStorage.getItem("solsticedocs.session.v1") || "null"));
    assert("T2", "zoom persisted 1.75", stored?.zoom === 1.75, stored?.zoom);
    const bRel = await probe(page, '[data-qa="overlay-1"]', 0.5, 0.6);
    assert("T2", "highlight pixel after zoom reload", bRel && bRel[3] > 40, bRel);
    results.subtests.T2 = { b150, b175, bRel, gA, gB };
    await ctx.close();
  }
} catch (e) {
  results.fatal = String((e && e.stack) || e);
}
results.checks = checks;
results.finishedAt = new Date().toISOString();
writeFileSync(OUT, JSON.stringify(results, null, 2));
console.log(`\n${checks.filter((c) => c.pass).length}/${checks.length} passed → ${OUT}`);
await browser.close();
