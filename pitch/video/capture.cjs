// Records the five demo scenes from the running app (dev server on :4317, or BASE=...) as WebM clips,
// and writes cut points to raw/cuts.json. Then build.sh turns them into the 30 s video.
const { chromium } = require('/Users/manishtula/.npm/_npx/e41f203b7505f1fb/node_modules/playwright');
const fs = require('fs');
const path = require('path');
const BASE = process.env.BASE || 'https://127.0.0.1:4317/';
const RAW = path.join(__dirname, 'raw');
fs.mkdirSync(RAW, { recursive: true });
const SIZE = { width: 1920, height: 1080 };
const cuts = {};

async function scene(browser, name, url, run) {
  const ctx = await browser.newContext({ viewport: SIZE, ignoreHTTPSErrors: true, recordVideo: { dir: RAW, size: SIZE } });
  const page = await ctx.newPage();
  const t0 = Date.now();
  await page.goto(BASE + url);
  const info = await run(page, () => (Date.now() - t0) / 1000);
  const video = page.video();
  await ctx.close();
  const file = path.join(RAW, name + '.webm');
  fs.renameSync(await video.path(), file);
  cuts[name] = info;
  console.log(name, JSON.stringify(info));
}

(async () => {
  const b = await chromium.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' });

  // 1. Mission Story: the light-time spiral, "Your doctor is 11.0 minutes away."
  await scene(b, 's1_story', '?video=story', async (p, t) => {
    await p.waitForSelector('.story-spiral'); const start = t() + 0.6; await p.waitForTimeout(7200); return { start };
  });

  // 2. Daily check typed by the scripted video mode, then the body map.
  await scene(b, 's2_check', '?video=check', async (p, t) => {
    await p.waitForSelector('.tiles'); const start = t() + 0.2; await p.waitForTimeout(8500); return { start };
  });

  // 3. Red alert with the Earth Reply Clock.
  await scene(b, 's3_alert', '?video=alert#/body', async (p, t) => {
    await p.waitForSelector('.alert-full', { timeout: 20000 }); const start = t() + 0.3;
    await p.waitForTimeout(2200);
    await p.evaluate(() => document.querySelector('.alert-full .rc')?.scrollIntoView({ behavior: 'smooth', block: 'center' }));
    await p.waitForTimeout(5000); return { start };
  });

  // 4. Ground Station: the sealed alert arrives after the (x60) light time and is opened.
  {
    const ctx = await b.newContext({ viewport: SIZE, ignoreHTTPSErrors: true, recordVideo: { dir: RAW, size: SIZE } });
    const ground = await ctx.newPage();
    const t0 = Date.now(); const t = () => (Date.now() - t0) / 1000;
    ground.on('dialog', (d) => d.accept());
    await ground.goto(BASE + 'ground.html'); await ground.waitForTimeout(2000);
    const wipe = ground.getByRole('button', { name: /Clear console messages/i });
    if (await wipe.count()) { await wipe.first().click(); await ground.waitForTimeout(600); }
    await ground.getByRole('button', { name: /×60/ }).click();
    const crew = await ctx.newPage();
    await crew.goto(BASE + '?video=alert#/body'); await crew.waitForTimeout(5000);
    await crew.evaluate(() => (location.hash = '#/outbox')); await crew.waitForTimeout(1500);
    await ground.bringToFront();
    let arrived = 0;
    for (let i = 0; i < 40 && !arrived; i++) { if (/Signature valid/i.test(await ground.evaluate(() => document.body.innerText))) arrived = t(); else await ground.waitForTimeout(250); }
    await ground.waitForTimeout(1200);
    const open = ground.getByRole('button', { name: /^Open snapshot$/ });
    if (await open.count()) await open.first().click();
    await ground.waitForTimeout(800);
    await ground.evaluate(() => document.querySelector('.gs-item.open')?.scrollIntoView({ behavior: 'smooth', block: 'start' }));
    await ground.waitForTimeout(3500);
    const gv = ground.video(); const cv = crew.video();
    await ctx.close();
    fs.renameSync(await gv.path(), path.join(RAW, 's4_ground.webm'));
    try { fs.unlinkSync(await cv.path()); } catch { /* crew clip not needed */ }
    cuts.s4_ground = { start: Math.max(0, arrived - 2.2) };
    console.log('s4_ground', JSON.stringify(cuts.s4_ground));
  }

  // 5. Proof on NASA Inspiration4 data.
  await scene(b, 's5_proof', '?video=proof', async (p, t) => {
    await p.waitForSelector('.stats, .proof-stats', { timeout: 20000 }); const start = t() + 0.5; await p.waitForTimeout(5500); return { start };
  });

  fs.writeFileSync(path.join(RAW, 'cuts.json'), JSON.stringify(cuts, null, 2));
  await b.close();
})();
