# Monta a configuração de uma cadeia de crateras para tools/stageopt.ts.
# Uso: python3 tools/chain.py zona aimX aimY "cx,cy,tilt,peça;..." [alvo]
import json, sys
sys.path.insert(0, 'tools')
from levels import crater_spot
z = int(sys.argv[1]); ax, ay = float(sys.argv[2]), float(sys.argv[3])
devs = []
for part in sys.argv[4].split(';'):
    cx, cy, tilt, kind = part.split(',')
    cx, cy, tilt = float(cx), float(cy), float(tilt)
    h = 11 if kind == 'launcher' else 4
    sx, sy = crater_spot(cx, cy, tilt, h + 1.5)
    devs.append(dict(type=kind, x=[sx - 4, sx + 4], y=[sy - 5, sy + 1], angle=[tilt - 0.12, tilt + 0.12], params=dict(power=[8, 13] if kind == 'launcher' else [7, 10])))
print(json.dumps(dict(zone=z, aim=dict(x=ax, y=ay), drop=[0, 0], target=sys.argv[5] if len(sys.argv) > 5 else 'hole', devices=devs)))
