// Mede tempo médio de simulação/render com muitas pedras e peças. Uso: node tools/perf.cjs url [w h dpr]
const { chromium } = require('playwright');
(async () => {
  const [url, w = '1440', hgt = '900', dpr = '2'] = process.argv.slice(2);
  const b = await chromium.launch({ args: ['--disable-gpu-vsync', '--disable-frame-rate-limit'] });
  const ctx = await b.newContext({ viewport: { width: +w, height: +hgt }, deviceScaleFactor: +dpr });
  const page = await ctx.newPage();
  await page.goto(url);
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await page.waitForTimeout(800);
  await page.locator('.title-item.primary').click();
  await page.evaluate(() => {
    const m = window.meteorMill;
    m.wallet.credits = 5000;
    for (const id of ['pick1', 'auto1', 'auto2', 'ramp', 'funnel', 'spring', 'conveyor', 'heat1']) m.buyNode(id);
    m.sim.addDevice({ type: 'funnel', x: 462.8, y: 462, angle: -0.15, params: {}, enabled: true, paid: 0 });
    m.sim.addDevice({ type: 'spring', x: 473.3, y: 478, angle: 0.561, params: { power: 10.37 }, enabled: true, paid: 0 });
    for (let i = 0; i < 150; i++) m.sim.spawnFragment('common', { x: 60 + (i % 15) * 9, y: 60 + Math.floor(i / 15) * 9 }, { x: 0, y: 0 });
  });
  await page.waitForTimeout(2000);
  await page.evaluate(() => window.meteorMill.perfSample());
  await page.mouse.move(600, 400);
  await page.waitForTimeout(5000);
  const r = await page.evaluate(() => window.meteorMill.perfSample());
  const frags = await page.evaluate(() => window.meteorMill.sim.fragments.size);
  console.log(JSON.stringify({ ...r, frags, canvas: await page.evaluate(() => [document.getElementById('game').width, document.getElementById('game').height]) }));
  await b.close();
})();
