// Captura telas do jogo rodando. Uso: node tools/shot.cjs <url> <saida-prefixo> [cenario]
const { chromium } = require('playwright');
(async () => {
  const [url, out, scenario = 'basic', w = '1280', hgt = '720'] = process.argv.slice(2);
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: +w, height: +hgt } });
  const logs = [];
  page.on('console', (m) => logs.push(`[${m.type()}] ${m.text()}`));
  page.on('pageerror', (e) => logs.push(`[pageerror] ${e.message}`));
  await page.goto(url);
  await page.waitForTimeout(800);
  await page.screenshot({ path: `${out}-title.png` });
  await page.getByText(/Jogar|Continuar/).first().click();
  await page.waitForTimeout(500);
  const g = () => page.evaluate(() => {
    const m = window.meteorMill;
    return { zoom: m.renderer.camera.zoom, frags: m.sim.fragments.size, credits: m.wallet.credits };
  });
  if (scenario === 'basic' || scenario === 'play') {
    // clica no asteroide algumas vezes
    const pos = await page.evaluate(() => {
      const m = window.meteorMill;
      const a = m.zone.asteroid;
      const b = m.renderer.camera.toBuffer(a.x + 10, a.y - 10);
      const k = m.renderer.pixelScale / m.renderer.dpr;
      return { x: b.x * k, y: b.y * k };
    });
    for (let i = 0; i < 8; i++) {
      await page.mouse.click(pos.x, pos.y);
      await page.waitForTimeout(400);
    }
    await page.waitForTimeout(1500);
  }
  if (scenario === 'build') {
    await page.evaluate(() => {
      const m = window.meteorMill;
      m.wallet.credits = 500;
      const z = m.zone;
      for (const d of z.solutions[0].devices) m.sim.addDevice({ type: d.type, x: d.x, y: d.y, angle: d.angle, params: d.params ?? {}, enabled: true, paid: 0 });
      for (let i = 0; i < 30; i++) setTimeout(() => m.sim.extract({ x: z.asteroid.x + 100, y: z.asteroid.y - 30 }), i * 500);
    });
    await page.waitForTimeout(9000);
  }
  await page.screenshot({ path: `${out}-game.png` });
  console.log(JSON.stringify(await g()));
  console.log(logs.slice(0, 30).join('\n'));
  await browser.close();
})();
