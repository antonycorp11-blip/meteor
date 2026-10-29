import type { DeviceType } from '../src/machines/types';

export interface Tpl {
  aim?: { x: number; y: number };
  pace?: number;
  devices: { type: DeviceType; x: [number, number] | number; y: [number, number] | number; angle: [number, number] | number; params?: Record<string, [number, number] | number> }[];
}

export const TEMPLATES: Record<string, Tpl> = {
  z1C: {
    devices: [
      { type: 'ramp', x: [395, 470], y: [400, 470], angle: [-0.8, 0.8] },
      { type: 'bumper', x: [420, 560], y: [430, 500], angle: 0, params: { power: [3, 6] } },
      { type: 'plank', x: [520, 590], y: [400, 445], angle: [-0.3, 0.3] },
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
    { type: 'deflector', x: [840, 940], y: [215, 265], angle: [-0.8, 0.8] },
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
TEMPLATES.z4A = {
  aim: { x: 230, y: 140 },
  pace: 60,
  devices: [
    { type: 'plank', x: 333.3, y: 572.8, angle: 0.215 },
    { type: 'plank', x: 397.7, y: 586.9, angle: 0.215 },
    { type: 'plank', x: 462.2, y: 601.0, angle: 0.215 },
    { type: 'plank', x: 526.7, y: 615.1, angle: 0.215 },
    { type: 'plank', x: 591.2, y: 629.2, angle: 0.215 },
    { type: 'plank', x: 655.6, y: 643.3, angle: 0.215 },
    { type: 'plank', x: 720.1, y: 657.4, angle: 0.215 },
    { type: 'plank', x: 784.6, y: 671.5, angle: 0.215 },
    { type: 'plank', x: 849.1, y: 685.6, angle: 0.215 },
    { type: 'attractor', x: [1080, 1200], y: [560, 700], angle: 0, params: { strength: [0.3, 1] } },
  ],
};
TEMPLATES.z4B = {
  aim: { x: 230, y: 140 },
  pace: 60,
  devices: [
    { type: 'launcher', x: [355, 380], y: [345, 370], angle: [0.2, 0.4], params: { power: [10, 12] } },
    { type: 'plank', x: [355, 375], y: [275, 300], angle: [1.5, 1.8] },
    { type: 'ramp', x: [930, 990], y: [680, 715], angle: [-0.4, 0.4] },
    { type: 'attractor', x: [1080, 1200], y: [560, 700], angle: 0, params: { strength: [0.3, 1] } },
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
