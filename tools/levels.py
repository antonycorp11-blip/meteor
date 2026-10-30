# Gera a geometria dos 5 planetas (terreno flutuante, ancoragens, obstáculos,
# campos). Mantém metas, dicas e textos do JSON; só sobrescreve o que é desenhado aqui.
# Uso: python3 tools/levels.py [zona...]
import json, math, sys

def rect(x, y, w, h):
    return [[x, y], [x + w, y], [x + w, y + h], [x, y + h]]

def slab(cx, cy, w, h, ang=0.0):
    """retângulo girado (convexo), centro cx,cy"""
    c, s = math.cos(ang), math.sin(ang)
    pts = [(-w / 2, -h / 2), (w / 2, -h / 2), (w / 2, h / 2), (-w / 2, h / 2)]
    return [[round(cx + x * c - y * s, 1), round(cy + x * s + y * c, 1)] for x, y in pts]

def rock(cx, cy, r, n=7, seed=1, squash=1.0):
    """bloco poligonal convexo irregular"""
    pts = []
    for i in range(n):
        a = i / n * math.tau + (seed * 0.37 % 0.5)
        rr = r * (0.82 + 0.18 * math.sin(seed * 12.9898 + i * 78.233) ** 2)
        pts.append([round(cx + math.cos(a) * rr, 1), round(cy + math.sin(a) * rr * squash, 1)])
    return hull(pts)

def hull(pts):
    pts = sorted(map(tuple, pts))
    def cross(o, a, b):
        return (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0])
    lo, up = [], []
    for p in pts:
        while len(lo) >= 2 and cross(lo[-2], lo[-1], p) <= 0: lo.pop()
        lo.append(p)
    for p in reversed(pts):
        while len(up) >= 2 and cross(up[-2], up[-1], p) <= 0: up.pop()
        up.append(p)
    return [list(p) for p in lo[:-1] + up[:-1]]

def local_rock(r, n=7, seed=1, squash=1.0):
    return rock(0, 0, r, n, seed, squash)

def bowl(cx, cy, w=130, depth=46, t=16, tilt=0.0):
    """cratera flutuante: duas lajes em V no fundo + bordas. Devolve polígonos convexos."""
    half = w / 2
    polys = []
    # fundo em V (desce até o centro)
    polys.append(slab(cx - half / 2, cy + 4, half + 8, t, 0.16 + tilt))
    polys.append(slab(cx + half / 2, cy + 4, half + 8, t, -0.16 + tilt))
    # bordas
    polys.append(slab(cx - half - 4, cy - depth / 2 + 6, t, depth + 10, -0.12))
    polys.append(slab(cx + half + 4, cy - depth / 2 + 6, t, depth + 10, 0.12))
    return polys

def bowl_anchor(cx, cy, w=130):
    return dict(x=cx, y=cy - 14, r=w / 2 - 6)

def crater(cx, cy, tilt=0.4, top=150, floor=50, depth=56, t=14):
    """cratera em funil: paredes simétricas levam tudo para um fundo do tamanho de
    uma peça; só o fundo inclina `tilt` rad (convenção das peças: positivo = a
    normal aponta para cima e para a direita)."""
    d = (math.cos(tilt), math.sin(tilt))
    down = (-math.sin(tilt), math.cos(tilt))
    e1 = (cx - d[0] * floor / 2, cy - d[1] * floor / 2)
    e2 = (cx + d[0] * floor / 2, cy + d[1] * floor / 2)
    r = lambda p: [round(p[0], 1), round(p[1], 1)]
    fl = [e1, e2, (e2[0] + down[0] * t, e2[1] + down[1] * t), (e1[0] + down[0] * t, e1[1] + down[1] * t)]
    polys = [hull([r(p) for p in fl])]
    for side, e in ((-1, e1), (1, e2)):
        rim = (cx + side * top / 2, cy - depth)
        quad = [e, rim, (rim[0] + side * t, rim[1]), (e[0] + side * t * 0.7, e[1] + t * 0.7)]
        polys.append(hull([r(p) for p in quad]))
    return polys

def crater_anchor(cx, cy, tilt=0.4):
    return dict(x=round(cx + math.sin(tilt) * 12, 1), y=round(cy - math.cos(tilt) * 12, 1), r=34)

def crater_spot(cx, cy, tilt=0.4, h=4):
    """posição de uma peça de meia-altura h assentada no fundo"""
    return round(cx + math.sin(tilt) * (h + 0.5), 1), round(cy - math.cos(tilt) * (h + 0.5), 1)

LEVELS = {}

# ---------------------------------------------------------------------------
# I · Cinza — aprender: as pedras caem do planeta; uma cratera no meio do caminho
# e o buraco negro flutuando acima. Placa de pulso até a cratera, outra até o buraco.
LEVELS[1] = dict(
    width=1200, height=680,
    asteroid=dict(x=60, y=230, r=170),
    blackHole=dict(x=1010, y=300, attractRadius=90, absorbRadius=14, strength=1000),
    terrain=[*crater(330, 560, 0.55), *crater(660, 450, 0.8), rock(830, 170, 46, 6, 5, 0.6), rock(1080, 500, 60, 8, 3, 0.45), rock(520, 300, 34, 6, 8, 0.7)],
    anchors=[], movers=[], fields=[], noBuild=[],
)

# II · Órion-b — ANCORAGENS: só se constrói no fundo das crateras e em duas balizas.
# O buraco negro está no alto, atrás de uma coluna e sob uma laje: subir em etapas.
LEVELS[2] = dict(
    width=1280, height=720,
    asteroid=dict(x=110, y=600, r=182),
    blackHole=dict(x=1150, y=190, attractRadius=90, absorbRadius=14, strength=1000),
    terrain=[
        *crater(392, 690, 0.5),
        *crater(650, 560, 0.35),
        *crater(880, 360, 0.5),
        slab(1010, 450, 56, 360, 0.04),
        slab(780, 90, 420, 40, -0.05),
        rock(1140, 580, 55, 7, 4, 0.6),
        rock(560, 300, 40, 6, 6, 0.7),
    ],
    anchors=[crater_anchor(392, 690, 0.5), crater_anchor(650, 560, 0.35), crater_anchor(880, 360, 0.5), dict(x=760, y=250, r=38), dict(x=1140, y=490, r=40)],
    movers=[], fields=[], noBuild=[],
)

# III · Basalto — OBSTÁCULOS EM MOVIMENTO: uma lâmina de basalto gira no meio do
# caminho e dois blocos orbitam o buraco negro.
LEVELS[3] = dict(
    width=1360, height=760,
    asteroid=dict(x=70, y=210, r=180),
    blackHole=dict(x=1180, y=470, attractRadius=92, absorbRadius=14, strength=1000),
    terrain=[*crater(340, 520, 0.5), *crater(560, 470, 0.6), *crater(880, 690, 0.65), rock(1250, 690, 60, 8, 6, 0.5), rock(700, 160, 50, 7, 7, 0.6)],
    anchors=[crater_anchor(340, 520, 0.5), crater_anchor(560, 470, 0.6), crater_anchor(880, 690, 0.65), dict(x=1040, y=640, r=42), dict(x=650, y=290, r=40)],
    movers=[
        dict(id='lamina', kind='rock', poly=[[-150, -11], [150, -11], [150, 11], [-150, 11]], cx=860, cy=390, orbit=0, speed=0, phase=0, spin=0.75),
        dict(id='orb1', kind='rock', poly=local_rock(20, 7, 11, 0.8), cx=1180, cy=470, orbit=120, speed=0.55, phase=0),
        dict(id='orb2', kind='rock', poly=local_rock(18, 6, 12, 0.8), cx=1180, cy=470, orbit=120, speed=0.55, phase=3.14159),
    ],
    fields=[], noBuild=[],
)

# IV · Íon — VENTO QUE INVERTE: duas correntes alternam de sentido. Leves voam
# com o vento; pesadas quase não sentem. Anel quebrado dos Construtores em volta do buraco.
LEVELS[4] = dict(
    width=1440, height=800,
    asteroid=dict(x=40, y=380, r=190),
    blackHole=dict(x=1220, y=300, attractRadius=92, absorbRadius=14, strength=1000),
    terrain=[
        *crater(330, 700, 0.5),
        *crater(760, 560, 0.5),
        *crater(1060, 680, 0.35),
        slab(1220, 175, 150, 22, 0.0),
        slab(1340, 300, 22, 170, 0.0),
        slab(1300, 420, 120, 22, -0.6),
        slab(1110, 230, 22, 110, 0.5),
    ],
    anchors=[crater_anchor(330, 700, 0.5), crater_anchor(760, 560, 0.5), crater_anchor(1060, 680, 0.35), dict(x=470, y=420, r=42), dict(x=930, y=300, r=42)],
    movers=[],
    fields=[
        dict(id='v1', label='Corrente iônica', x=520, y=60, w=110, h=700, ax=300, ay=0, period=7, phase=0),
        dict(id='v2', label='Corrente iônica', x=880, y=60, w=110, h=700, ax=0, ay=-360, period=5, phase=1.7),
    ],
    noBuild=[],
)

# V · Horizonte — GRAVIDADE POR REGIÃO: uma coluna onde tudo cai para cima, uma
# faixa onde tudo cai para a direita, e o buraco negro guardado por uma lâmina.
LEVELS[5] = dict(
    width=1520, height=860,
    asteroid=dict(x=80, y=720, r=210),
    blackHole=dict(x=1300, y=230, attractRadius=95, absorbRadius=15, strength=1000),
    terrain=[
        *crater(420, 790, 0.45),
        slab(640, 70, 360, 30, 0.0),
        *crater(1000, 600, 0.5),
        slab(1150, 380, 30, 300, 0.0),
        rock(1390, 430, 55, 7, 9, 0.6),
        rock(820, 360, 44, 6, 10, 0.7),
    ],
    anchors=[crater_anchor(420, 790, 0.45), dict(x=640, y=125, r=50), dict(x=820, y=270, r=46), crater_anchor(1000, 600, 0.5), dict(x=1240, y=430, r=46)],
    movers=[
        dict(id='sentinela', kind='ring', poly=[[-60, -10], [60, -10], [60, 10], [-60, 10]], cx=1300, cy=230, orbit=0, speed=0, phase=0, spin=-0.5),
    ],
    fields=[
        dict(id='g1', label='Gravidade invertida', x=560, y=100, w=140, h=640, ax=0, ay=-1120, gravity=True),
        dict(id='g2', label='Gravidade lateral', x=700, y=100, w=340, h=120, ax=760, ay=-560, gravity=True),
    ],
    noBuild=[],
)

SOLUTIONS = {}
SOLUTIONS[1] = [
 {
  "id": "A",
  "label": "Placa de pulso na cratera de baixo e outra na cratera do meio",
  "aim": {
   "x": 330,
   "y": 230
  },
  "pace": 60,
  "expectRate": 0.5,
  "devices": [
   {
    "type": "spring",
    "x": 335.1,
    "y": 550.6,
    "angle": 0.453,
    "params": {
     "power": 9.74
    }
   },
   {
    "type": "spring",
    "x": 665.5,
    "y": 445.6,
    "angle": 0.705,
    "params": {
     "power": 9.77
    }
   }
  ]
 },
 {
  "id": "B",
  "label": "Duas placas de pulso, a segunda mais inclinada",
  "aim": {
   "x": 330,
   "y": 230
  },
  "pace": 60,
  "expectRate": 0.15,
  "devices": [
   {
    "type": "spring",
    "x": 332,
    "y": 554,
    "angle": 0.55,
    "params": {
     "power": 9
    }
   },
   {
    "type": "spring",
    "x": 663,
    "y": 444,
    "angle": 0.8,
    "params": {
     "power": 10
    }
   }
  ]
 }
]
SOLUTIONS[2] = [
 {
  "id": "A",
  "label": "Placa de pulso, canhão de massa e placa de pulso subindo de cratera em cratera",
  "aim": {
   "x": 360,
   "y": 540
  },
  "pace": 60,
  "expectRate": 0.18,
  "devices": [
   {
    "type": "spring",
    "x": 397.5,
    "y": 685.7,
    "angle": 0.429,
    "params": {
     "power": 9.58
    }
   },
   {
    "type": "launcher",
    "x": 655.5,
    "y": 548.8,
    "angle": 0.255,
    "params": {
     "power": 11.99
    }
   },
   {
    "type": "spring",
    "x": 881.8,
    "y": 349.7,
    "angle": 0.533,
    "params": {
     "power": 9.47
    }
   }
  ]
 },
 {
  "id": "B",
  "label": "Três placas de pulso (só as leves sobem até o fim)",
  "aim": {
   "x": 360,
   "y": 540
  },
  "pace": 60,
  "expectRate": 0.02,
  "devices": [
   {
    "type": "spring",
    "x": 395.8,
    "y": 684,
    "angle": 0.51,
    "params": {
     "power": 9.35
    }
   },
   {
    "type": "spring",
    "x": 656,
    "y": 552.1,
    "angle": 0.348,
    "params": {
     "power": 9.54
    }
   },
   {
    "type": "spring",
    "x": 878.9,
    "y": 352.9,
    "angle": 0.51,
    "params": {
     "power": 8.63
    }
   }
  ]
 }
]
SOLUTIONS[3] = [
 {
  "id": "A",
  "label": "Pulso, pulso e canhão: por baixo da lâmina giratória",
  "aim": {
   "x": 300,
   "y": 200
  },
  "pace": 60,
  "expectRate": 0.07,
  "devices": [
   {
    "type": "spring",
    "x": 345.5,
    "y": 512.3,
    "angle": 0.61,
    "params": {
     "power": 9.15
    }
   },
   {
    "type": "spring",
    "x": 559.4,
    "y": 461.6,
    "angle": 0.554,
    "params": {
     "power": 7.73
    }
   },
   {
    "type": "launcher",
    "x": 890.2,
    "y": 679.2,
    "angle": 0.735,
    "params": {
     "power": 12.46
    }
   }
  ]
 },
 {
  "id": "B",
  "label": "Pulso e dois canhões",
  "aim": {
   "x": 300,
   "y": 200
  },
  "pace": 60,
  "expectRate": 0.02,
  "devices": [
   {
    "type": "spring",
    "x": 346.9,
    "y": 515.4,
    "angle": 0.568,
    "params": {
     "power": 9.48
    }
   },
   {
    "type": "launcher",
    "x": 564.3,
    "y": 454.3,
    "angle": 0.643,
    "params": {
     "power": 8.99
    }
   },
   {
    "type": "launcher",
    "x": 883.9,
    "y": 674.7,
    "angle": 0.76,
    "params": {
     "power": 12.44
    }
   }
  ]
 }
]
SOLUTIONS[4] = [
 {
  "id": "A",
  "label": "Três canhões de massa: rápidos o bastante para cruzar o vento",
  "aim": {
   "x": 300,
   "y": 420
  },
  "pace": 60,
  "expectRate": 0.08,
  "devices": [
   {
    "type": "launcher",
    "x": 340.2,
    "y": 683.6,
    "angle": 0.438,
    "params": {
     "power": 13
    }
   },
   {
    "type": "launcher",
    "x": 770.2,
    "y": 549.6,
    "angle": 0.551,
    "params": {
     "power": 12.14
    }
   },
   {
    "type": "launcher",
    "x": 1068.5,
    "y": 664.9,
    "angle": 0.321,
    "params": {
     "power": 12.15
    }
   }
  ]
 },
 {
  "id": "B",
  "label": "Canhão, placa de pulso e canhão",
  "aim": {
   "x": 300,
   "y": 420
  },
  "pace": 60,
  "expectRate": 0.02,
  "devices": [
   {
    "type": "launcher",
    "x": 332.2,
    "y": 684.4,
    "angle": 0.442,
    "params": {
     "power": 11.3
    }
   },
   {
    "type": "spring",
    "x": 764.6,
    "y": 550.9,
    "angle": 0.43,
    "params": {
     "power": 9.58
    }
   },
   {
    "type": "launcher",
    "x": 1065.2,
    "y": 664,
    "angle": 0.283,
    "params": {
     "power": 11.2
    }
   }
  ]
 }
]
SOLUTIONS[5] = [
 {
  "id": "A",
  "label": "Placa de pulso para dentro da coluna de gravidade invertida e canhão na cratera de chegada",
  "aim": {
   "x": 340,
   "y": 640
  },
  "pace": 60,
  "expectRate": 0.06,
  "devices": [
   {
    "type": "spring",
    "x": 426.6,
    "y": 779.6,
    "angle": 0.335,
    "params": {
     "power": 9.41
    }
   },
   {
    "type": "launcher",
    "x": 1004.7,
    "y": 584.7,
    "angle": 0.541,
    "params": {
     "power": 8.7
    }
   }
  ]
 },
 {
  "id": "B",
  "label": "Duas placas de pulso usando as duas regiões de gravidade",
  "aim": {
   "x": 340,
   "y": 640
  },
  "pace": 60,
  "expectRate": 0.02,
  "devices": [
   {
    "type": "spring",
    "x": 418.6,
    "y": 781.9,
    "angle": 0.391,
    "params": {
     "power": 9.22
    }
   },
   {
    "type": "spring",
    "x": 1000.9,
    "y": 594.5,
    "angle": 0.471,
    "params": {
     "power": 7.47
    }
   }
  ]
 }
]

TEXTS = {
    1: dict(subtitle='Crateras flutuantes e um buraco negro no alto', intro='O buraco negro flutua acima de você. Use as crateras como degraus.', growthTarget=600,
            hints=['Toda pedra que cai numa cratera escorrega até o fundo: ponha ali uma placa de pulso.', 'A linha pontilhada mostra o arco: gire a placa até ele cair na próxima cratera.', 'Com o drone autônomo, o planeta trabalha sozinho.']),
    2: dict(subtitle='Ancoragens: só se constrói nos pontos marcados', intro='Só dá para construir nas ancoragens. O buraco negro está no alto, atrás da coluna.', growthTarget=1200,
            hints=['Peças só podem ser presas nas ancoragens (círculos verdes).', 'A placa de pulso não ergue pedras pesadas: na subida mais alta, use o canhão de massa.', 'Da cratera alta, mire por cima da coluna.']),
    3: dict(subtitle='Lâmina giratória e rochas em órbita do buraco negro', intro='Algo gira entre você e o buraco negro. Passe por baixo, ou acerte o tempo.', growthTarget=2200,
            hints=['Não dá para construir no caminho da lâmina.', 'A cratera sob a lâmina é o caminho mais seguro.', 'As rochas em órbita rebatem quem chega devagar: chegue rápido.']),
    4: dict(subtitle='Correntes iônicas que invertem e o anel dos Construtores', intro='Duas correntes mudam de sentido. Pedras leves voam com elas.', growthTarget=3500,
            hints=['A barra sob cada corrente mostra quanto falta para ela inverter.', 'O canhão de massa é rápido demais para o vento desviar.', 'O anel dos Construtores só tem uma abertura: por baixo, à esquerda.']),
    5: dict(subtitle='Regiões onde a gravidade aponta para cima e para o lado', intro='Aqui a gravidade muda de direção. Use-a a seu favor.', growthTarget=5000,
            hints=['Na coluna dourada, tudo cai para cima.', 'No alto, a faixa lateral leva as pedras para a direita.', 'Uma lâmina gira na frente do buraco negro: chegue com força.']),
}
GOAL_FIX = {
    'z2-eng': 30, 'z3-eng': 30, 'z4-eng': 25, 'z5-eng': 25,
}

def build(zid):
    p = f'src/world/zones/zone{zid}.json'
    z = json.load(open(p))
    L = LEVELS[zid]
    for k, v in L.items():
        z[k] = v
    if zid in SOLUTIONS:
        z['solutions'] = SOLUTIONS[zid]
    for k, v in TEXTS.get(zid, {}).items():
        z[k] = v
    for g in z['goals']:
        for r in g['reqs']:
            if r['kind'] == 'efficiency' and g['tier'] == 'engineering' and g['id'] in GOAL_FIX:
                r['pct'] = GOAL_FIX[g['id']]
            if r['kind'] == 'maxDevicesEff':
                r['pct'] = 30
        g['title'] = g['title'].replace('55% de eficiência', f"{GOAL_FIX.get(g['id'], 55)}% de eficiência").replace('70% de eficiência', '25% de eficiência' if g['id'] == 'z5-eng' else '30% de eficiência').replace('Eficiência de 40%', 'Eficiência de 30%')
    json.dump(z, open(p, 'w'), indent=1, ensure_ascii=False)
    print('zona', zid, 'ok')

if __name__ == '__main__':
    ids = [int(a) for a in sys.argv[1:]] or sorted(LEVELS)
    for i in ids:
        if i in LEVELS: build(i)
