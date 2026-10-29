# Meteor Mill

Quebre um asteroide gigante, solte fragmentos com física própria e invente caminhos ao redor de rochas indestrutíveis até alimentar o buraco negro.

Jogo 2D de física/engenharia em pixel art procedural, com trilha original gerada por Web Audio. Implementado a partir da *Bíblia de Design / Prompt Mestre v1.0*.

## Rodar

```bash
npm install
npm run dev      # servidor de desenvolvimento (http://localhost:5173)
npm run build    # typecheck + build estático em dist/ (funciona offline depois de carregado)
npm test         # testes de aceitação (vitest)
```

Stack: TypeScript + Vite + Canvas 2D + Matter.js. Sem servidor, sem assets externos: toda a arte e o áudio são gerados por código.

## O que está implementado

- **Loop físico**: asteroide clicável que solta fragmentos reais (corpos rígidos poligonais), gravidade de jogo, passo fixo de 1/60 s com 2 subpassos e limite de catch-up, interpolação no render.
- **Feixe manual**: mola de força limitada (com alcance), respeitando colisões — não teleporta nem atravessa parede.
- **Buraco negro**: atração curta com oclusão por rocha (raycast), absorção com entrega idempotente.
- **Terreno indestrutível** em polígonos convexos, validado: nenhuma linha reta livre entre fonte e destino.
- **16 peças** com física real: placa, rampa curva, defletor, bumper, propulsor, lançador aberto, ventilador, portinhola, esteira aberta, amortecedor, campo atrator/repulsor, braço basculante, elevador de campo, autoextrator e sensor+acionador (pós-campanha). Posicionamento livre com prévia verde/vermelha e motivo, giro (Q/E, roda, alça, ajuste fino), mover, copiar, desligar, revender, desfazer.
- **7 tipos de fragmento**: comum, poroso, denso, metálico, vítreo (parte-se em lascas), instável (pulso local) e raro.
- **5 zonas completas** (Limiar de Cinzas, Fenda de Órion, Labirinto de Basalto, Maré de Íons, Catedral do Horizonte), cada uma com objetivo básico, de engenharia e extras, carteira e instalação próprias salvas.
- **Economia** (créditos locais, combo com teto, bônus de entrega automática), **eficiência** em janela móvel com pendentes, **pesquisa estelar** global com 5 ramos / 41 níveis e redistribuição gratuita.
- **Música original** procedural a 74 BPM (64 compassos ≈ 3 min 28 s por volta, pad, subgrave, piano elétrico FM, plucks, sinos, variações determinísticas) e **efeitos sintetizados** com limite de vozes; volumes Master/Música/Efeitos/Mudo.
- **Controles PC e toque em paisagem**: toque extrai, pressão longa segura, um dedo move a câmera, dois dedos fazem pan/zoom; aviso para girar em retrato.
- **HUD minimalista** recolhível, loja recolhível, painel da peça, estatísticas com metodologia, ajustes de acessibilidade (escala da UI, menos partículas, sem tremor, contraste reforçado, encaixe opcional).
- **Salvamento** automático com debounce, versão de esquema, migração e cópia de segurança.

## Soluções de referência e testes

Cada zona documenta em `src/world/zones/zoneN.json` ao menos duas estratégias automatizadas (mais uma manual), e `tests/zones.test.ts` as simula de verdade no motor físico, além de verificar que sem peças nada chega ao buraco negro. As taxas medidas (entregues/gerados, com ritmo de cliques sustentável):

| Zona | Estratégia A | Estratégia B |
| --- | --- | --- |
| 1 | placas sobre o fosso (~95%) | rampa curva + bumper + placa (~80%) |
| 2 | catapulta com anteparo (~35–50%) | ponte + propulsor + lançador + defletor (~20–30%) |
| 3 | placas sobre o poço + lançador (~75–95%) | esteiras + lançador (~60–85%) |
| 4 | rota inferior + atrator (~95%) | rota superior via lançador + rampa (~40–55%) |
| 5 | lançador no desfiladeiro (~40%) | elevador + ventilador (~25–55%) |

Ferramentas de desenvolvimento em `tools/`: `simzone.ts` (simula e gera SVG de trajetórias), `optimize.ts` + `templates.ts` (busca de posições), `validate.ts`, e scripts Playwright de captura/interação.

## Limitações conhecidas

- Os preços, metas e durações são hipóteses de balanceamento; precisam de playtest humano (Marco G). As metas de eficiência das zonas 4–5 exigem combinar estratégias além das soluções de referência.
- O orçamento de corpos ativos é fixo (110 em toque, 200 no PC), não calibrado por benchmark em aparelho real.
- Testado em Chromium (desktop e emulação de iPhone em paisagem); não testado em Safari/Firefox nem em aparelho físico.
- Sem traduções além do português (textos centralizados nos módulos de UI).
