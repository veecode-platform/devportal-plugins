import { dataCurta, dolar, duracao, listaComE, tempoAtras } from './formato';

describe('duracao', () => {
  it('writes less than a minute in seconds', () => {
    expect(duracao(12)).toBe('12 s');
    expect(duracao(0)).toBe('0 s');
  });

  it('writes minutes and seconds', () => {
    expect(duracao(252)).toBe('4 min 12 s');
    expect(duracao(125.4)).toBe('2 min 5 s');
  });

  it('drops the seconds when they are zero', () => {
    expect(duracao(240)).toBe('4 min');
  });

  it('rounds to whole seconds before it splits the units', () => {
    expect(duracao(59.6)).toBe('1 min');
  });
});

describe('tempoAtras', () => {
  it('says less than a minute when the pipeline ran this minute', () => {
    expect(tempoAtras(0)).toBe('menos de 1 min');
  });

  it('writes minutes below an hour', () => {
    expect(tempoAtras(1)).toBe('1 min');
    expect(tempoAtras(14)).toBe('14 min');
    expect(tempoAtras(59)).toBe('59 min');
  });

  it('writes hours and minutes from sixty minutes on', () => {
    expect(tempoAtras(60)).toBe('1 h');
    expect(tempoAtras(75)).toBe('1 h 15 min');
  });
});

describe('listaComE', () => {
  it('joins one item as itself and none as an empty text', () => {
    expect(listaComE(['build'])).toBe('build');
    expect(listaComE([])).toBe('');
  });

  it('joins two items with "e"', () => {
    expect(listaComE(['build', 'test'])).toBe('build e test');
  });

  it('separates all but the last item with commas', () => {
    expect(listaComE(['a', 'b', 'c'])).toBe('a, b e c');
  });
});

describe('dataCurta', () => {
  // Local-time constructors keep the expected hour the same in any time zone.
  const agora = new Date(2026, 9, 21, 9, 0);

  it('writes the day, the month and the time of the current year without the year', () => {
    const iso = new Date(2026, 9, 19, 16, 38).toISOString();
    expect(dataCurta(iso, agora)).toBe('19/10 às 16:38');
  });

  it('pads the day, the month and the hour', () => {
    const iso = new Date(2026, 0, 3, 7, 4).toISOString();
    expect(dataCurta(iso, agora)).toBe('03/01 às 07:04');
  });

  it('adds the year when it is not the current year', () => {
    const iso = new Date(2025, 11, 31, 23, 5).toISOString();
    expect(dataCurta(iso, agora)).toBe('31/12/2025 às 23:05');
  });
});

describe('dolar', () => {
  it('writes dollars with a decimal comma', () => {
    expect(dolar(0.04)).toBe('US$ 0,04');
    expect(dolar(1.5)).toBe('US$ 1,50');
  });
});
