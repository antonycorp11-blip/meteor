# Gera configurações de estágio (cratera -> alvo) para tools/stageopt.ts.
# Uso: python3 tools/stages.py <zona> <cx> <cy> <tilt> <peça> <alvo> [aimX aimY | dropX dropY]
import json, math, sys
sys.path.insert(0, 'tools')
from levels import crater_spot
z, cx, cy, tilt, kind, target = int(sys.argv[1]), float(sys.argv[2]), float(sys.argv[3]), float(sys.argv[4]), sys.argv[5], sys.argv[6]
mode, px, py = sys.argv[7], float(sys.argv[8]), float(sys.argv[9])
h = 11 if kind == 'launcher' else 4
sx, sy = crater_spot(cx, cy, tilt, h + 1.5)
dev = dict(type=kind, x=[sx - 4, sx + 4], y=[sy - 5, sy + 1], angle=[tilt - 0.08, tilt + 0.08], params=dict(power=[5, 13] if kind == 'launcher' else [4, 10]))
cfg = dict(zone=z, drop=[px, py], target=target, devices=[dev])
if mode == 'aim':
    cfg['aim'] = dict(x=px, y=py)
print(json.dumps(cfg))
