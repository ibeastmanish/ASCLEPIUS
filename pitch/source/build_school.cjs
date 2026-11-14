// deck_school.html -> ../ASCLEPIUS_SpaceApps2026_deck_school.pdf, png/school-N.png, png/school-contact.png.
// Uses Google Fonts (Permanent Marker, Caveat); needs internet once to render (fonts are embedded in the PDF).
const { chromium } = require('playwright-core');
const path = require('path');
const CHROME = process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
require('fs').mkdirSync(path.join(__dirname, 'png'), { recursive: true });

(async () => {
  const b = await chromium.launch({ executablePath: CHROME });
  const p = await b.newPage({ viewport: { width: 1920, height: 1080 } });
  await p.goto('file://' + path.join(__dirname, 'deck_school.html'), { waitUntil: 'networkidle' });
  await p.evaluate(() => document.fonts.ready);
  await p.waitForTimeout(600);
  const issues = await p.evaluate(() => {
    const out = [];
    if (!(document.fonts.check('40px "Permanent Marker"') && document.fonts.check('700 40px Caveat'))) out.push('fonts not loaded');
    document.querySelectorAll('.slide').forEach((s, i) => {
      const sr = s.getBoundingClientRect();
      s.querySelectorAll('.a, .card, .sticky, .foot, .shot, .polaroid').forEach((el) => {
        const r = el.getBoundingClientRect();
        if (r.width && (r.right > sr.right + 2 || r.bottom > sr.bottom + 2 || r.left < sr.left - 2)) {
          out.push('slide ' + (i + 1) + ': ' + el.className + ' r=' + Math.round(r.right - sr.left) + ' b=' + Math.round(r.bottom - sr.top));
        }
      });
      s.querySelectorAll('img').forEach((im) => { if (!im.naturalWidth) out.push('slide ' + (i + 1) + ': missing ' + im.getAttribute('src')); });
    });
    return out;
  });
  console.log(issues.length ? issues.join('\n') : 'no overflow, fonts + images loaded');
  const slides = await p.$$('.slide');
  for (let i = 0; i < slides.length; i++) await slides[i].screenshot({ path: path.join(__dirname, 'png', 'school-' + (i + 1) + '.png') });
  await p.pdf({ path: path.join(__dirname, '..', 'ASCLEPIUS_SpaceApps2026_deck_school.pdf'), width: '1920px', height: '1080px', printBackground: true });
  const imgs = slides.map((_, i) => '<img src="file://' + path.join(__dirname, 'png', 'school-' + (i + 1) + '.png') + '">').join('');
  await p.setViewportSize({ width: 1440, height: 1240 });
  await p.setContent('<body style="margin:0;background:#222;display:grid;grid-template-columns:repeat(2,720px)">' + imgs + '<style>img{width:720px;height:405px}</style></body>');
  await p.waitForTimeout(500);
  await p.screenshot({ path: path.join(__dirname, 'png', 'school-contact.png'), fullPage: true });
  console.log('slides:', slides.length);
  await b.close();
})();
