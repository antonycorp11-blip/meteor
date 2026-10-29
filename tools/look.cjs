// Capturas da UI nova. Uso: node tools/look.cjs url prefixo
const { chromium, devices } = require('playwright');
(async () => {
  const [url, out] = process.argv.slice(2);
  const b = await chromium.launch();
  const logs = [];
  const page = await b.newPage({ viewport: { width: 1366, height: 768 } });
  page.on('pageerror', (e) => logs.push(`[pageerror] ${e.message}`));
  page.on('console', (m) => m.type() === 'error' && logs.push(`[error] ${m.text()}`));
  await page.goto(url);
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await page.waitForTimeout(1500);
  await page.mouse.move(700, 300);
  await page.screenshot({ path: `${out}-title.png` });
  await page.locator('.title-item.primary').click();
  await page.waitForTimeout(400);
  const W = (wx, wy) => page.evaluate(([wx, wy]) => { const m = window.meteorMill; const p = m.renderer.camera.toBuffer(wx, wy); const k = m.renderer.pixelScale / m.renderer.dpr; return { x: p.x * k, y: p.y * k }; }, [wx, wy]);
  const a = await page.evaluate(() => window.meteorMill.zone.asteroid);
  const ap = await W(a.x + 12, a.y - 12);
  for (let i = 0; i < 6; i++) { await page.mouse.click(ap.x, ap.y); await page.waitForTimeout(350); }
  await page.mouse.move(ap.x, ap.y);
  await page.mouse.down();
  await page.waitForTimeout(80);
  await page.screenshot({ path: `${out}-mine.png` });
  await page.mouse.up();
  // dá créditos, compra nós e monta funil + mola
  await page.evaluate(() => {
    const m = window.meteorMill;
    m.wallet.credits = 2000;
    for (const id of ['pick1', 'auto1', 'auto2', 'ramp', 'funnel', 'spring', 'conveyor', 'heat1']) m.buyNode(id);
    m.sim.addDevice({ type: 'funnel', x: 462.8, y: 462, angle: -0.15, params: {}, enabled: true, paid: 0 });
    m.sim.addDevice({ type: 'spring', x: 473.3, y: 478, angle: 0.561, params: { power: 10.37 }, enabled: true, paid: 0 });
  });
  await page.waitForTimeout(9000);
  await page.mouse.move(400, 400);
  await page.screenshot({ path: `${out}-auto.png` });
  // seleciona a mola (mostra prévia de arco)
  const sp = await W(473, 476);
  await page.mouse.click(sp.x, sp.y);
  await page.waitForTimeout(200);
  const dock = page.locator('.dock-card').nth(2);
  await dock.hover();
  await page.waitForTimeout(200);
  await page.screenshot({ path: `${out}-select.png` });
  await page.keyboard.press('Escape');
  await page.keyboard.press('t');
  await page.waitForTimeout(400);
  await page.screenshot({ path: `${out}-tree.png` });
  await page.keyboard.press('Escape');
  // colapso
  await page.evaluate(() => { const m = window.meteorMill; m.progress.stats.energyFed = m.zone.growthTarget; });
  await page.waitForTimeout(3000);
  await page.screenshot({ path: `${out}-collapse.png` });
  await page.waitForTimeout(2500);
  await page.screenshot({ path: `${out}-complete.png` });
  const mctx = await b.newContext({ ...devices['iPhone 13 landscape'] });
  const mp = await mctx.newPage();
  mp.on('pageerror', (e) => logs.push(`[m] ${e.message}`));
  await mp.goto(url);
  await mp.waitForTimeout(1200);
  await mp.screenshot({ path: `${out}-m-title.png` });
  await mp.locator('.title-item.primary').tap();
  await mp.waitForTimeout(600);
  await mp.screenshot({ path: `${out}-m-game.png` });
  console.log(logs.join('\n') || 'no errors');
  await b.close();
})();
