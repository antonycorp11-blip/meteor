import '@fontsource/silkscreen/400.css';
import '@fontsource/silkscreen/700.css';
import '@fontsource/inter/400.css';
import '@fontsource/inter/600.css';
import './ui/styles.css';
import { Game } from './core/Game';
import { validateAllZones } from './world/ZoneLoader';

const canvas = document.getElementById('game') as HTMLCanvasElement;
const ui = document.getElementById('ui') as HTMLElement;

if (import.meta.env.DEV) {
  const errs = validateAllZones();
  if (errs.length) console.warn('[zonas] problemas de validação:', errs);
}

const game = new Game(canvas, ui);
// acesso para depuração no console
(window as unknown as { meteorMill: Game }).meteorMill = game;
