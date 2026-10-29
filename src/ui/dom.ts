type Attrs = Record<string, string | number | boolean | ((e: Event) => void) | undefined>;
type Child = Node | string | number | null | undefined | false;

/** Criação de DOM enxuta. */
export function h<K extends keyof HTMLElementTagNameMap>(tag: K, attrs: Attrs = {}, ...children: Child[]): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v === undefined || v === false) continue;
    if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2).toLowerCase(), v as EventListener);
    else if (k === 'class') el.className = String(v);
    else if (k === 'html') el.innerHTML = String(v);
    else if (v === true) el.setAttribute(k, '');
    else el.setAttribute(k, String(v));
  }
  for (const c of children) {
    if (c === null || c === undefined || c === false) continue;
    el.append(c instanceof Node ? c : document.createTextNode(String(c)));
  }
  return el;
}

export function clear(el: HTMLElement) {
  while (el.firstChild) el.removeChild(el.firstChild);
}

// Ícones em pixel art (grade 9×9), desenhados como SVG.
const ICONS: Record<string, string[]> = {
  pause: ['.........', '..XX.XX..', '..XX.XX..', '..XX.XX..', '..XX.XX..', '..XX.XX..', '..XX.XX..', '..XX.XX..', '.........'],
  play: ['.........', '..X......', '..XX.....', '..XXX....', '..XXXX...', '..XXX....', '..XX.....', '..X......', '.........'],
  overview: ['.........', '.XX...XX.', '.X.....X.', '.........', '...XXX...', '.........', '.X.....X.', '.XX...XX.', '.........'],
  home: ['....X....', '...XXX...', '..XX.XX..', '.XX...XX.', 'XX.....XX', '.X.....X.', '.X..X..X.', '.X..X..X.', '.XXXXXXX.'],
  star: ['....X....', '....X....', '...XXX...', 'XXXXXXXXX', '..XXXXX..', '...XXX...', '..XX.XX..', '.XX...XX.', '.........'],
  menu: ['.........', '.XXXXXXX.', '.........', '.........', '.XXXXXXX.', '.........', '.........', '.XXXXXXX.', '.........'],
  undo: ['.........', '..X......', '.XX......', 'XXXXXXX..', '.XX....X.', '..X....X.', '.......X.', '...XXXX..', '.........'],
  build: ['.........', '.XXXX....', '.XXXXX...', '..XXXX...', '....XXX..', '.....XXX.', '......XXX', '.......XX', '.........'],
  close: ['.........', '.X.....X.', '..X...X..', '...X.X...', '....X....', '...X.X...', '..X...X..', '.X.....X.', '.........'],
  rotl: ['.........', '...XXX...', '..X...X..', '.X.....X.', '.X.......', 'XXX......', '.X.......', '.........', '.........'],
  rotr: ['.........', '...XXX...', '..X...X..', '.X.....X.', '.......X.', '......XXX', '.......X.', '.........', '.........'],
  copy: ['.........', '.XXXXX...', '.X...X...', '.X.XXXXX.', '.X.X...X.', '.XXX...X.', '...X...X.', '...XXXXX.', '.........'],
  trash: ['...XXX...', 'XXXXXXXXX', '.X.....X.', '.X.X.X.X.', '.X.X.X.X.', '.X.X.X.X.', '.X.X.X.X.', '.XXXXXXX.', '.........'],
  power: ['....X....', '..X.X.X..', '.X..X..X.', 'X...X...X', 'X.......X', 'X.......X', '.X.....X.', '..XXXXX..', '.........'],
  check: ['.........', '.........', '.......XX', '......XX.', 'XX...XX..', '.XX.XX...', '..XXX....', '...X.....', '.........'],
  stats: ['.........', '.......X.', '.......X.', '....X..X.', '....X..X.', '.X..X..X.', '.X..X..X.', '.X..X..X.', 'XXXXXXXXX'],
  eye: ['.........', '.........', '..XXXXX..', '.X.....X.', 'X..XXX..X', '.X.....X.', '..XXXXX..', '.........', '.........'],
  gate: ['.........', 'X.......X', 'X.XXXXX.X', 'X.......X', 'X.......X', 'X.......X', 'X.......X', 'X.......X', '.........'],
};

export function icon(name: keyof typeof ICONS | string, size = 18): SVGSVGElement {
  const rows = ICONS[name] ?? ICONS.close;
  const ns = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(ns, 'svg');
  svg.setAttribute('viewBox', '0 0 9 9');
  svg.setAttribute('width', String(size));
  svg.setAttribute('height', String(size));
  svg.setAttribute('shape-rendering', 'crispEdges');
  svg.setAttribute('aria-hidden', 'true');
  rows.forEach((row, y) => {
    for (let x = 0; x < row.length; x++) {
      if (row[x] !== 'X') continue;
      const r = document.createElementNS(ns, 'rect');
      r.setAttribute('x', String(x));
      r.setAttribute('y', String(y));
      r.setAttribute('width', '1');
      r.setAttribute('height', '1');
      r.setAttribute('fill', 'currentColor');
      svg.appendChild(r);
    }
  });
  return svg;
}

export function fmt(n: number): string {
  if (n >= 10000) return `${(n / 1000).toFixed(1)}k`;
  return String(Math.floor(n));
}
