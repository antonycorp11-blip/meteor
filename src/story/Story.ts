// Narrativa do contrato Ônix: a Singularis compra sistemas inteiros e os
// entrega, planeta por planeta, ao buraco negro central. Cada zona é um canteiro
// num planeta; a "semente" (o buraco negro da zona) cresce até engolir o
// canteiro e cair em Ônix.

export const COMPANY = 'Singularis';
export const SYSTEM = 'Ônix';
export const SENDER = 'Diretora Vega · Operações de Campo';

export interface Memo {
  title: string;
  body: string[];
}

export interface PlanetInfo {
  /** numeral do planeta, do mais próximo ao mais distante de Ônix */
  numeral: string;
  /** nome do planeta */
  body: string;
  /** cor principal no mapa do sistema */
  color: string;
  /** cor da sombra no mapa */
  shade: string;
  /** raio do desenho no mapa */
  size: number;
  briefing: Memo;
  debrief: Memo;
}

export const INTRO: Memo = {
  title: 'Contrato Ônix',
  body: [
    `Boas-vindas à ${COMPANY}. O sistema que você vê orbita um buraco negro, ${SYSTEM}, e foi comprado inteiro pela empresa.`,
    'Seu trabalho: em cada planeta, plantamos uma semente de singularidade. Você quebra a rocha com o drone de mineração e leva os fragmentos até a semente. Bem alimentada, ela cresce até engolir o canteiro, e o planeta cai em Ônix.',
    'Começamos pelo planeta mais próximo. Os distantes são mais duros, e há estruturas lá fora que não fomos nós que construímos.',
    'Créditos e patentes (a Árvore estelar) acompanham você de planeta em planeta. Bom turno.',
  ],
};

export const PLANETS: Record<number, PlanetInfo> = {
  1: {
    numeral: 'I',
    body: 'Cinza',
    color: '#e0884a',
    shade: '#6a2e1e',
    size: 7,
    briefing: {
      title: 'Planeta I · Cinza',
      body: ['O mais próximo de Ônix, tostado pela maré de calor do disco. Um paredão em ombro separa o bloco da semente.', 'Vigas, coletores e uma placa de pulso bastam aqui. Aprenda o ritmo: entregas seguidas aquecem a semente.'],
    },
    debrief: {
      title: 'Cinza entregue',
      body: ['Cinza caiu em Ônix. Primeiro planeta do contrato concluído.', 'Os módulos que você instalou foram recuperados e convertidos em crédito.'],
    },
  },
  2: {
    numeral: 'II',
    body: 'Órion-b',
    color: '#7aa8e8',
    shade: '#24346a',
    size: 8,
    briefing: {
      title: 'Planeta II · Órion-b',
      body: ['Rachado ao meio por um abismo antigo. A semente ficou numa câmara elevada do outro lado.', 'Vai ser preciso erguer ou arremessar. O canhão de massa está nas patentes.'],
    },
    debrief: {
      title: 'Órion-b entregue',
      body: ['A diretoria está satisfeita.', 'Os sensores de longo alcance captaram sinais regulares vindos do planeta IV. Provavelmente nada.'],
    },
  },
  3: {
    numeral: 'III',
    body: 'Basalto',
    color: '#9a8a9e',
    shade: '#3a2e44',
    size: 9,
    briefing: {
      title: 'Planeta III · Basalto',
      body: ['Derrames de basalto formaram corredores em zigue-zague e poços fundos.', 'Mantenha o fluxo vivo: pedra parada esfria a semente.'],
    },
    debrief: {
      title: 'Basalto entregue',
      body: ['Basalto entregue. Ônix já se vê a olho nu do planeta IV.', 'A equipe de reconhecimento confirmou: os sinais vêm de ruínas.'],
    },
  },
  4: {
    numeral: 'IV',
    body: 'Íon',
    color: '#55d7e8',
    shade: '#1a4a5e',
    size: 8,
    briefing: {
      title: 'Planeta IV · Íon',
      body: [
        'Encontramos ruínas de uma megaestrutura que não consta em nenhum registro. Internamente, chamamos seus autores de Construtores.',
        'O vento iônico ainda corre pelos dutos deles, soprando na direção da câmara da semente. Ele carrega as pedras leves; as pesadas precisam do canhão.',
      ],
    },
    debrief: {
      title: 'Íon entregue',
      body: ['As ruínas caíram junto com o planeta.', 'Nos registros recuperados, os Construtores faziam o mesmo que nós, até pararem de repente. A diretoria pede que o assunto não seja comentado.'],
    },
  },
  5: {
    numeral: 'V',
    body: 'Horizonte',
    color: '#c8a0ff',
    shade: '#3e2466',
    size: 10,
    briefing: {
      title: 'Planeta V · Horizonte',
      body: ['O mais distante de Ônix. Três barreiras que parecem erguidas de propósito.', 'Os Construtores protegiam alguma coisa aqui. Siga o contrato.'],
    },
    debrief: {
      title: 'Contrato Ônix concluído',
      body: [`${SYSTEM} agora é supermassivo. O sistema inteiro foi entregue.`, `A ${COMPANY} agradece a dedicação. Um novo contrato está em análise.`],
    },
  },
};

export function planet(zoneId: number): PlanetInfo {
  return PLANETS[zoneId] ?? PLANETS[1];
}
