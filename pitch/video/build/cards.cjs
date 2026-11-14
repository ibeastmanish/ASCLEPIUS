// Renders caption overlays (transparent 1920x1080 PNGs) and the end card for the 30 s video.
const { chromium } = require('/Users/manishtula/.npm/_npx/e41f203b7505f1fb/node_modules/playwright');
const path = require('path');
const fs = require('fs');
const OUT = path.join(__dirname, 'cards');
fs.mkdirSync(OUT, { recursive: true });
const SCRIPT = require('./script.json');

const capHtml = (text, n, pos, sim) => `<!doctype html><html><head><meta charset="utf-8"><style>
html,body{margin:0;width:1920px;height:1080px;background:transparent;font-family:"Helvetica Neue",Helvetica,Arial,sans-serif}
.cap{position:absolute;left:50%;${pos === 'top' ? 'top:56px' : 'bottom:64px'};transform:translateX(-50%);max-width:1500px;background:rgba(0,0,0,.82);color:#fff;
 font-size:46px;font-weight:700;line-height:1.25;padding:20px 34px;border-radius:18px;text-align:center;box-shadow:0 10px 40px rgba(0,0,0,.5)}
.tag{position:absolute;left:48px;top:40px;color:#fff;background:rgba(0,0,0,.7);font:800 22px/1 "Helvetica Neue",Arial;letter-spacing:.24em;padding:12px 16px;border-radius:10px}
.tag b{color:#FC3D21}
.sim{position:absolute;right:48px;top:40px;color:#FC3D21;border:2px solid #FC3D21;background:rgba(0,0,0,.6);font:800 18px/1 "Helvetica Neue",Arial;letter-spacing:.2em;padding:10px 14px;border-radius:8px}
</style></head><body>${sim ? '<div class="sim" style="top:auto;bottom:48px">SIMULATED CREW DATA</div>' : ''}<div class="cap">${text}</div></body></html>`;

const endHtml = `<!doctype html><html><head><meta charset="utf-8"><style>
html,body{margin:0;width:1920px;height:1080px;background:#000;color:#fff;font-family:"Helvetica Neue",Helvetica,Arial,sans-serif;overflow:hidden}
.mars{position:absolute;right:-260px;top:-160px;width:1200px;height:1200px;border-radius:50%;object-fit:cover;opacity:.9}
.shade{position:absolute;inset:0;background:linear-gradient(90deg,#000 0%,#000 40%,rgba(0,0,0,.4) 70%,rgba(0,0,0,.1))}
.c{position:absolute;left:140px;top:300px}
h1{margin:0;font-size:170px;font-weight:900;letter-spacing:.05em;line-height:.9}
.bar{width:520px;height:8px;background:#FC3D21;margin:30px 0}
.t{font-size:60px;font-weight:800}
.u{font-size:34px;color:#cfd8e8;margin-top:30px}
.f{position:absolute;left:140px;bottom:70px;font:600 24px/1.4 "Helvetica Neue",Arial;letter-spacing:.12em;color:#9aa3b5;text-transform:uppercase}
</style></head><body><img class="mars" src="file://${path.join(__dirname, '..', '..', 'source', 'img', 'mars_sq.jpg')}"><div class="shade"></div>
<div class="c"><h1>ASCLEPIUS</h1><div class="bar"></div><div class="t">Medicine for when Earth<br>is too far away.</div><div class="u">ibeastmanish.github.io/ASCLEPIUS</div></div>
<div class="f">Tula Manish · Warangal, India · NASA Space Apps 2026<br>Data: NASA JPL Horizons · NASA OSDR OSD-569 · Images: NASA/JPL/USGS</div></body></html>`;

(async () => {
  const b = await chromium.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' });
  const p = await b.newPage({ viewport: { width: 1920, height: 1080 } });
  for (let i = 0; i < SCRIPT.length; i++) {
    if (SCRIPT[i].end) continue;
    await p.setContent(capHtml(SCRIPT[i].caption, i, SCRIPT[i].pos, SCRIPT[i].sim));
    await p.screenshot({ path: path.join(OUT, `cap${i + 1}.png`), omitBackground: true });
  }
  await p.setContent(endHtml); await p.waitForTimeout(400);
  await p.screenshot({ path: path.join(OUT, 'end.png') });
  await b.close();
  console.log('cards done');
})();
