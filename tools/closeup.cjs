// Close de um ponto do mundo. Uso: node tools/closeup.cjs url out zona x y zoom
const { chromium } = require('playwright');
(async () => {
  const [url, out, zid, x, y, zoom] = process.argv.slice(2);
  const b = await chromium.launch();
  const p = await b.newPage({ viewport: { width: 1280, height: 720 } });
  await p.goto(url);
  await p.waitForTimeout(500);
  await p.getByRole('button', { name: /^(Jogar|Continuar)$/ }).click();
  await p.evaluate(([zid, x, y, zoom]) => {
    const m = window.meteorMill;
    m.save.unlockedZone = 5;
    m.openZone(+zid);
    m.renderer.camera.snap(+x, +y, +zoom);
    for (let i = 0; i < 8; i++) setTimeout(() => m.sim.extract(null, true), i * 300);
  }, [zid, x, y, zoom]);
  await p.waitForTimeout(3500);
  await p.screenshot({ path: out });
  await b.close();
})();
