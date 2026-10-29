// Screenshot de cada zona com a solução A instalada. Uso: node tools/zoneshot.cjs <url> <prefixo> [w h]
const { chromium } = require('playwright');
(async () => {
  const [url, out, w = '1280', hgt = '720'] = process.argv.slice(2);
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: +w, height: +hgt } });
  const logs = [];
  page.on('pageerror', (e) => logs.push(`[pageerror] ${e.message}`));
  page.on('console', (m) => m.type() === 'error' && logs.push(`[error] ${m.text()}`));
  await page.goto(url);
  await page.waitForTimeout(600);
  await page.getByText(/Jogar|Continuar/).first().click();
  for (const zid of [1, 2, 3, 4, 5]) {
    await page.evaluate((zid) => {
      const m = window.meteorMill;
      m.save.unlockedZone = 5;
      m.openZone(zid);
      const z = m.zone;
      const sol = z.solutions[0];
      for (const d of sol.devices) m.sim.addDevice({ type: d.type, x: d.x, y: d.y, angle: d.angle, params: d.params ?? {}, enabled: true, paid: 0 });
      const aim = sol.aim ?? { x: z.asteroid.x + 100, y: z.asteroid.y - 30 };
      let n = 0;
      const t = setInterval(() => { m.sim.extract(aim, true); if (++n > 14) clearInterval(t); }, (sol.pace ?? 45) * 16);
    }, zid);
    await page.waitForTimeout(7000);
    await page.screenshot({ path: `${out}-z${zid}.png` });
  }
  console.log(logs.join('\n') || 'no errors');
  await browser.close();
})();
