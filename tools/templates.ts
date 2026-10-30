import type { DeviceType } from '../src/machines/types';

export interface Tpl {
  aim?: { x: number; y: number };
  pace?: number;
  devices: { type: DeviceType; x: [number, number] | number; y: [number, number] | number; angle: [number, number] | number; params?: Record<string, [number, number] | number> }[];
}

export const TEMPLATES: Record<string, Tpl> = {
  z1C: {
    devices: [
      { type: 'funnel', x: [410, 520], y: [420, 462], angle: [-0.15, 0.15] },
      { type: 'spring', x: [420, 540], y: [478, 496], angle: [0.2, 0.9], params: { power: [6, 12] } },
    ],
  },
};
TEMPLATES.z2A = {
  aim: { x: 260, y: 340 },
  devices: [
    { type: 'launcher', x: [430, 470], y: [545, 580], angle: [0.2, 0.6], params: { power: [10, 13] } },
    { type: 'plank', x: [470, 510], y: [500, 560], angle: [1.1, 1.7] },
    { type: 'plank', x: [880, 950], y: [360, 420], angle: [-0.5, 0.5] },
  ],
};
TEMPLATES.z2B = {
  aim: { x: 260, y: 340 },
  devices: [
    { type: 'booster', x: [410, 520], y: [500, 600], angle: [-1.4, -0.2], params: { power: [5, 7] } },
    { type: 'booster', x: [500, 650], y: [380, 560], angle: [-1.4, -0.2], params: { power: [5, 7] } },
    { type: 'booster', x: [600, 800], y: [300, 500], angle: [-1.4, 0.2], params: { power: [5, 7] } },
    { type: 'booster', x: [700, 810], y: [250, 450], angle: [-1.4, 0.2], params: { power: [5, 7] } },
    { type: 'plank', x: [870, 960], y: [300, 420], angle: [-0.6, 0.6] },
  ],
};
TEMPLATES.z2C = {
  aim: { x: 260, y: 340 },
  devices: [
    { type: 'plank', x: 433.7, y: 524.0, angle: 0.126 },
    { type: 'plank', x: 499.2, y: 532.3, angle: 0.126 },
    { type: 'plank', x: 564.7, y: 540.6, angle: 0.126 },
    { type: 'booster', x: [612, 640], y: [540, 556], angle: [-0.5, 0.15], params: { power: [3, 7] } },
    { type: 'launcher', x: [690, 790], y: [571, 575], angle: [0, 0.6], params: { power: [9, 13] } },
    { type: 'plank', x: [880, 960], y: [330, 420], angle: [-0.6, 0.6] },
  ],
};
TEMPLATES.z3A = {
  aim: { x: 230, y: 140 },
  pace: 80,
  devices: [
    { type: 'plank', x: 366.4, y: 475.9, angle: 0.186 },
    { type: 'plank', x: 431.3, y: 488.1, angle: 0.186 },
    { type: 'plank', x: 496.2, y: 500.3, angle: 0.186 },
    { type: 'plank', x: 561.0, y: 512.5, angle: 0.186 },
    { type: 'plank', x: 625.9, y: 524.8, angle: 0.186 },
    { type: 'plank', x: 690.8, y: 537.0, angle: 0.186 },
    { type: 'launcher', x: [880, 915], y: [672, 683], angle: [0.0, 0.6], params: { power: [10, 13] } },
    { type: 'plank', x: [1090, 1200], y: [520, 620], angle: [-0.6, 0.6] },
  ],
};
TEMPLATES.z3B = {
  aim: { x: 230, y: 140 },
  pace: 80,
  devices: [
    { type: 'conveyor', x: 385, y: 551, angle: 0, params: { speed: [3, 5] } },
    { type: 'conveyor', x: 472, y: 551, angle: 0, params: { speed: [3, 5] } },
    { type: 'conveyor', x: 559, y: 551, angle: 0, params: { speed: [3, 5] } },
    { type: 'conveyor', x: 646, y: 551, angle: 0, params: { speed: [3, 5] } },
    { type: 'conveyor', x: 735, y: 551, angle: 0, params: { speed: [3, 5] } },
    { type: 'launcher', x: [880, 915], y: [672, 683], angle: [0.0, 0.6], params: { power: [10, 13] } },
    { type: 'plank', x: [1090, 1200], y: [500, 560], angle: [-0.6, 0.6] },
  ],
};
TEMPLATES.z5A = {
  aim: { x: 240, y: 160 },
  pace: 60,
  devices: [
    { type: 'launcher', x: [345, 380], y: [545, 552], angle: [0.0, 0.5], params: { power: [8, 13] } },
    { type: 'ramp', x: [1010, 1080], y: [600, 650], angle: [-0.5, 0.5] },
  ],
};
TEMPLATES.z5B = {
  aim: { x: 240, y: 160 },
  pace: 60,
  devices: [
    { type: 'lift', x: [350, 375], y: [549, 554], angle: [-0.1, 0.1], params: { strength: [0.7, 1] } },
    { type: 'fan', x: [334, 345], y: [280, 330], angle: [-0.3, 0.2], params: { strength: [0.5, 1] } },
    { type: 'ramp', x: [1010, 1080], y: [600, 650], angle: [-0.5, 0.5] },
  ],
};
TEMPLATES.z4easy = {
  aim: { x: 230, y: 140 },
  pace: 60,
  devices: [
    { type: 'spring', x: [330, 500], y: [625, 632], angle: [0.1, 0.8], params: { power: [8, 10] } },
    { type: 'spring', x: [1054, 1058], y: [615, 615], angle: [-0.1, 0.05], params: { power: [10, 10] } },
  ],
};
TEMPLATES.z4A = {
  aim: { x: 230, y: 140 },
  pace: 60,
  devices: [
    { type: 'funnel', x: [320, 400], y: [330, 420], angle: [-0.2, 0.2] },
    { type: 'spring', x: [320, 420], y: [360, 470], angle: [0.2, 0.9], params: { power: [7, 10] } },
    { type: 'spring', x: [1054, 1058], y: [615, 615], angle: [-0.1, 0.05], params: { power: [10, 10] } },
  ],
};
TEMPLATES.z4B = {
  aim: { x: 230, y: 140 },
  pace: 60,
  devices: [
    { type: 'funnel', x: [320, 400], y: [330, 400], angle: [-0.2, 0.2] },
    { type: 'launcher', x: [320, 420], y: [380, 460], angle: [0.2, 0.9], params: { power: [8, 16] } },
    { type: 'launcher', x: [1053, 1059], y: [609, 609], angle: [-0.1, 0.1], params: { power: [11, 14] } },
  ],
};
TEMPLATES.z5A = {
  aim: { x: 250, y: 200 },
  pace: 90,
  devices: [
    { type: 'launcher', x: [345, 415], y: [549, 549], angle: [0.0, 0.2], params: { power: [11, 16] } },
    { type: 'launcher', x: [819, 827], y: [629, 629], angle: [-0.05, 0.2], params: { power: [11, 16] } },
    { type: 'launcher', x: [1199, 1207], y: [689, 689], angle: [0.0, 0.35], params: { power: [9, 16] } },
  ],
};
TEMPLATES.z5B = {
  aim: { x: 250, y: 200 },
  pace: 70,
  devices: [
    { type: 'launcher', x: [345, 415], y: [549, 549], angle: [0.0, 0.2], params: { power: [11, 16] } },
    { type: 'launcher', x: [819, 827], y: [629, 629], angle: [-0.05, 0.2], params: { power: [11, 16] } },
    { type: 'spring', x: [1201, 1205], y: [696, 696], angle: [0.0, 0.4], params: { power: [8, 10] } },
  ],
};
TEMPLATES.n1A = {
  aim: { x: 330, y: 230 },
  pace: 50,
  devices: [
    { type: 'funnel', x: [270, 380], y: [330, 470], angle: [-0.3, 0.3] },
    { type: 'spring', x: [270, 400], y: [380, 540], angle: [0.3, 1.1], params: { power: [6, 10] } },
  ],
};
TEMPLATES.n1B = {
  aim: { x: 330, y: 230 },
  pace: 50,
  devices: [
    { type: 'funnel', x: [270, 380], y: [330, 470], angle: [-0.3, 0.3] },
    { type: 'spring', x: [270, 400], y: [380, 540], angle: [0.3, 1.1], params: { power: [6, 10] } },
    { type: 'funnel', x: [620, 900], y: [380, 560], angle: [-0.3, 0.3] },
    { type: 'spring', x: [620, 900], y: [420, 600], angle: [0.0, 0.9], params: { power: [6, 10] } },
  ],
};
TEMPLATES.n1C = {
  aim: { x: 330, y: 230 },
  pace: 55,
  devices: [
    { type: 'spring', x: [285, 380], y: [400, 540], angle: [0.2, 1.1], params: { power: [5, 10] } },
    { type: 'spring', x: [570, 670], y: [415, 438], angle: [0.2, 1.0], params: { power: [6, 10] } },
  ],
};
TEMPLATES.n3A = {
  aim: { x: 300, y: 200 },
  pace: 60,
  devices: [
    { type: 'spring', x: [355, 380], y: [450, 465], angle: [0.25, 0.4], params: { power: [5.5, 6.5] } },
    { type: 'spring', x: [470, 570], y: [452, 482], angle: [0.2, 1.1], params: { power: [5, 10] } },
    { type: 'launcher', x: [840, 920], y: [628, 652], angle: [0.2, 1.0], params: { power: [7, 13] } },
  ],
};
TEMPLATES.n3B = {
  aim: { x: 300, y: 200 },
  pace: 60,
  devices: [
    { type: 'spring', x: [355, 380], y: [450, 465], angle: [0.25, 0.4], params: { power: [5.5, 6.5] } },
    { type: 'spring', x: [470, 570], y: [452, 482], angle: [0.2, 1.1], params: { power: [5, 10] } },
    { type: 'spring', x: [840, 920], y: [630, 655], angle: [0.1, 1.0], params: { power: [6, 10] } },
    { type: 'spring', x: [1005, 1075], y: [610, 670], angle: [-0.3, 0.6], params: { power: [5, 10] } },
  ],
};
TEMPLATES.n3C = {
  aim: { x: 300, y: 200 },
  pace: 60,
  devices: [
    { type: 'spring', x: [355, 380], y: [450, 465], angle: [0.25, 0.4], params: { power: [5.5, 6.5] } },
    { type: 'funnel', x: [480, 560], y: [400, 445], angle: [-0.2, 0.2] },
    { type: 'launcher', x: [495, 545], y: [452, 480], angle: [0.2, 1.0], params: { power: [5, 11] } },
    { type: 'funnel', x: [840, 920], y: [580, 625], angle: [-0.2, 0.2] },
    { type: 'launcher', x: [850, 910], y: [628, 652], angle: [0.2, 1.0], params: { power: [7, 13] } },
  ],
};
