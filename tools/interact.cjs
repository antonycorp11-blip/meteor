// Testa fluxos de interação reais com mouse e toque.
const { chromium, devices } = require('playwright');
(async () => {
  const [url, out] = process.argv.slice(2);
  const browser = await chromium.launch();
  const logs = [];
  // --- PC
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  page.on('pageerror', (e) => logs.push(`[pageerror] ${e.message}`));
  page.on('console', (m) => m.type() === 'error' && logs.push(`[error] ${m.text()}`));
  await page.goto(url);
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await page.waitForTimeout(500);
  await page.getByRole('button', { name: /^(Jogar|Continuar)$/ }).click();
  await page.waitForTimeout(300);
  const toCss = (wx, wy) => page.evaluate(([wx, wy]) => {
    const m = window.meteorMill;
    const b = m.renderer.camera.toBuffer(wx, wy);
    const k = m.renderer.pixelScale / m.renderer.dpr;
    return { x: b.x * k, y: b.y * k };
  }, [wx, wy]);
  const a = await page.evaluate(() => window.meteorMill.zone.asteroid);
  const ap = await toCss(a.x + 15, a.y - 15);
  for (let i = 0; i < 3; i++) { await page.mouse.click(ap.x, ap.y); await page.waitForTimeout(400); }
  // arrasta o fragmento mais recente
  await page.waitForTimeout(600);
  const fpos = await page.evaluate(() => { const fs = [...window.meteorMill.sim.fragments.values()]; const f = fs[fs.length - 1]; return { x: f.body.position.x, y: f.body.position.y }; });
  const fp = await toCss(fpos.x, fpos.y);
  await page.mouse.move(fp.x, fp.y);
  await page.mouse.down();
  const tgt = await toCss(fpos.x + 60, fpos.y - 40);
  for (let i = 1; i <= 15; i++) { await page.mouse.move(fp.x + (tgt.x - fp.x) * i / 15, fp.y + (tgt.y - fp.y) * i / 15); await page.waitForTimeout(40); }
  const grabbing = await page.evaluate(() => !!window.meteorMill.sim.grab);
  await page.mouse.up();
  // compra placa
  await page.evaluate(() => { window.meteorMill.wallet.credits = 50; });
  await page.locator('.shop-card').first().click();
  const pp = await toCss(470, 420);
  await page.mouse.move(pp.x, pp.y);
  await page.waitForTimeout(100);
  await page.keyboard.press('e');
  await page.mouse.click(pp.x, pp.y);
  await page.waitForTimeout(200);
  const after = await page.evaluate(() => ({ devices: window.meteorMill.sim.devices.size, credits: window.meteorMill.wallet.credits }));
  await page.screenshot({ path: `${out}-pc-placed.png` });
  // seleciona e vende
  await page.mouse.click(pp.x, pp.y);
  await page.waitForTimeout(300);
  const panelShown = await page.locator('.device-panel.show').count();
  await page.screenshot({ path: `${out}-pc-selected.png` });
  await page.keyboard.press('Delete');
  await page.waitForTimeout(200);
  const sold = await page.evaluate(() => ({ devices: window.meteorMill.sim.devices.size, credits: window.meteorMill.wallet.credits }));
  await page.keyboard.press('Control+z');
  const undone = await page.evaluate(() => window.meteorMill.sim.devices.size);
  // reload persiste
  await page.evaluate(() => window.meteorMill['persist'](true));
  await page.reload();
  await page.waitForTimeout(500);
  const persisted = await page.evaluate(() => window.meteorMill.sim.devices.size);
  console.log(JSON.stringify({ grabbing, after, panelShown, sold, undone, persisted }));
  // --- celular paisagem
  const ctx = await browser.newContext({ ...devices['iPhone 13 landscape'] });
  const mp = await ctx.newPage();
  mp.on('pageerror', (e) => logs.push(`[m-pageerror] ${e.message}`));
  await mp.goto(url);
  await mp.waitForTimeout(500);
  await mp.screenshot({ path: `${out}-m-title.png` });
  await mp.getByRole('button', { name: /^(Jogar|Continuar)$/ }).tap();
  await mp.waitForTimeout(400);
  const ma = await mp.evaluate(() => { const m = window.meteorMill; const a = m.zone.asteroid; const b = m.renderer.camera.toBuffer(a.x + 10, a.y - 10); const k = m.renderer.pixelScale / m.renderer.dpr; return { x: b.x * k, y: b.y * k }; });
  for (let i = 0; i < 4; i++) { await mp.touchscreen.tap(ma.x, ma.y); await mp.waitForTimeout(450); }
  await mp.waitForTimeout(800);
  const mfrags = await mp.evaluate(() => window.meteorMill.sim.fragments.size);
  await mp.locator('.shop-toggle').tap();
  await mp.waitForTimeout(200);
  await mp.locator('.shop-card').first().tap();
  await mp.waitForTimeout(300);
  await mp.screenshot({ path: `${out}-m-ghost.png` });
  console.log(JSON.stringify({ mobileFrags: mfrags }));
  // retrato
  const pc = await browser.newContext({ ...devices['iPhone 13'] });
  const pp2 = await pc.newPage();
  await pp2.goto(url);
  await pp2.waitForTimeout(400);
  await pp2.screenshot({ path: `${out}-m-portrait.png` });
  console.log(logs.join('\n') || 'no errors');
  await browser.close();
})();
