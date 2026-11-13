// Renders deck.html -> ASCLEPIUS_SpaceApps2026_deck.pdf (7 pages, 1920x1080), png/slide-N.png,
// and png/contact.png (all 7 small, for a quick visual check). Also reports any text that
// overflows its slide.
const { chromium } = require('playwright-core');
const CHROME = process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const path = require('path');
require('fs').mkdirSync(path.join(__dirname, 'png'), { recursive: true });
(async () => {
  const b = await chromium.launch({ executablePath: CHROME });
  const p = await b.newPage({ viewport: { width: 1920, height: 1080 } });
  await p.goto('file://' + path.join(__dirname, 'deck.html'));
  await p.waitForTimeout(800);
  const issues = await p.evaluate(() => {
    const out = [];
    document.querySelectorAll('.slide').forEach((s, i) => {
      const sr = s.getBoundingClientRect();
      s.querySelectorAll('.content *, .card, .stamp, .foot, .shot').forEach((el) => {
        const r = el.getBoundingClientRect();
        if (r.width && (r.right > sr.right + 1 || r.bottom > sr.bottom + 1)) out.push(`slide ${i + 1}: ${el.tagName}.${el.className} right=${Math.round(r.right - sr.left)} bottom=${Math.round(r.bottom - sr.top)}`);
      });
      s.querySelectorAll('img').forEach((im) => { if (!im.complete || !im.naturalWidth) out.push(`slide ${i + 1}: missing image ${im.getAttribute('src')}`); });
    });
    return out;
  });
  console.log(issues.length ? issues.slice(0, 12).join('\n') : 'no overflow, all images loaded');
  const slides = await p.$$('.slide');
  for (let i = 0; i < slides.length; i++) await slides[i].screenshot({ path: path.join(__dirname, 'png', `slide-${i + 1}.png`) });
  await p.pdf({ path: path.join(__dirname, '..', 'ASCLEPIUS_SpaceApps2026_deck.pdf'), width: '1920px', height: '1080px', printBackground: true });
  // contact sheet
  const imgs = slides.map((_, i) => `<img src="file://${path.join(__dirname, 'png', `slide-${i + 1}.png`)}">`).join('');
  await p.setViewportSize({ width: 1440, height: 1240 });
  await p.setContent(`<body style="margin:0;background:#222;display:grid;grid-template-columns:repeat(2,720px);gap:0">${imgs}<style>img{width:720px;height:405px}</style></body>`);
  await p.waitForTimeout(500);
  await p.screenshot({ path: path.join(__dirname, 'png', 'contact.png'), fullPage: true });
  console.log('slides:', slides.length);
  // The speech paper (A4).
  await p.goto('file://' + path.join(__dirname, 'speech_simple.html'));
  await p.pdf({ path: path.join(__dirname, '..', 'ASCLEPIUS_Speech.pdf'), format: 'A4', printBackground: true, preferCSSPageSize: true });
  await b.close();
})();
