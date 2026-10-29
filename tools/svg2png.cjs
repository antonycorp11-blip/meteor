// Converte SVG em PNG usando o Chromium pré-instalado. Uso: node tools/svg2png.cjs in.svg out.png
const { chromium } = require('playwright');
const fs = require('fs');
(async () => {
  const [inp, out] = process.argv.slice(2);
  const svg = fs.readFileSync(inp, 'utf8');
  const m = svg.match(/width="(\d+)" height="(\d+)"/);
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: +m[1], height: +m[2] } });
  await page.setContent(`<html><body style="margin:0">${svg}</body></html>`);
  await page.screenshot({ path: out });
  await browser.close();
})();
