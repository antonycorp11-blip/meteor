// Molduras em pixel art geradas por código e aplicadas via CSS border-image
// (9-slice). Cada moldura tem 12×12 px: contorno escuro com cantos chanfrados,
// bisel claro em cima/esquerda, escuro em baixo/direita e rebites nos cantos.

interface FrameSpec {
  fill: string;
  light: string;
  dark: string;
  outline: string;
  rivet?: string;
}

function frameUrl(f: FrameSpec): string {
  const c = document.createElement('canvas');
  c.width = 12;
  c.height = 12;
  const g = c.getContext('2d')!;
  const px = (x: number, y: number, col: string) => {
    g.fillStyle = col;
    g.fillRect(x, y, 1, 1);
  };
  for (let y = 0; y < 12; y++) {
    for (let x = 0; x < 12; x++) {
      const edge = x === 0 || y === 0 || x === 11 || y === 11;
      const corner = (x === 0 || x === 11) && (y === 0 || y === 11);
      const nearCorner = (x <= 1 || x >= 10) && (y <= 1 || y >= 10) && !((x === 1 || x === 10) && (y === 1 || y === 10));
      if (corner) continue;
      if (edge || nearCorner) px(x, y, f.outline);
      else if (y === 1 || x === 1) px(x, y, f.light);
      else if (y === 10 || x === 10) px(x, y, f.dark);
      else px(x, y, f.fill);
    }
  }
  if (f.rivet) for (const [x, y] of [[2, 2], [9, 2], [2, 9], [9, 9]]) px(x, y, f.rivet);
  return `url(${c.toDataURL()})`;
}

export function installFrames() {
  const root = document.documentElement.style;
  root.setProperty('--frame-panel', frameUrl({ fill: '#140c2c', light: '#4e3a8e', dark: '#0a0618', outline: '#05030c', rivet: '#6a52b0' }));
  root.setProperty('--frame-inset', frameUrl({ fill: '#0c0720', light: '#06040f', dark: '#2a1f52', outline: '#05030c' }));
  root.setProperty('--frame-btn', frameUrl({ fill: '#2a1d58', light: '#6a52b8', dark: '#140c30', outline: '#05030c' }));
  root.setProperty('--frame-btn-hover', frameUrl({ fill: '#3a2878', light: '#9a80f0', dark: '#1c1240', outline: '#05030c' }));
  root.setProperty('--frame-amber', frameUrl({ fill: '#e07a20', light: '#ffe08a', dark: '#8a3a0e', outline: '#2a1006' }));
  root.setProperty('--frame-amber-hover', frameUrl({ fill: '#ff9a3a', light: '#fff2c0', dark: '#a8480e', outline: '#2a1006' }));
  root.setProperty('--frame-cyan', frameUrl({ fill: '#0e3a48', light: '#55d7e8', dark: '#06202a', outline: '#02090c', rivet: '#9ff0fa' }));
  root.setProperty('--frame-green', frameUrl({ fill: '#1a8a5a', light: '#8affc8', dark: '#0a4a2a', outline: '#021a0e' }));
  root.setProperty('--frame-red', frameUrl({ fill: '#5a1428', light: '#ff7a9a', dark: '#2a0610', outline: '#0e0206' }));
  root.setProperty('--frame-locked', frameUrl({ fill: '#100a20', light: '#241a40', dark: '#08050f', outline: '#05030c' }));
}
