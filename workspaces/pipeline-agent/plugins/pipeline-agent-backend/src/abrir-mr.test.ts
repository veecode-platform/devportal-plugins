import { escolherBranch, parseAbrirMrEntrada } from './abrir-mr';
import type { GitLab } from './gitlab/types';

describe('parseAbrirMrEntrada', () => {
  const valida = {
    titulo: 'fix: cupom e faixa somam sobre o valor bruto',
    causa: 'A faixa era aplicada sobre o valor já descontado.',
    arquivos: [
      { caminho: 'src/main/java/Desconto.java', conteudo: 'class D {}' },
    ],
  };

  it('accepts a well-formed proposal', () => {
    expect(parseAbrirMrEntrada(valida)).toEqual({ ok: true, valor: valida });
  });

  it.each([
    [
      'a path that leaves the repository',
      { ...valida, arquivos: [{ caminho: '../segredo', conteudo: 'x' }] },
    ],
    [
      'an absolute path',
      { ...valida, arquivos: [{ caminho: '/etc/passwd', conteudo: 'x' }] },
    ],
    ['no files', { ...valida, arquivos: [] }],
    ['a missing title', { causa: valida.causa, arquivos: valida.arquivos }],
  ])('rejects %s', (_nome, entrada) => {
    expect(parseAbrirMrEntrada(entrada).ok).toBe(false);
  });
});

describe('escolherBranch', () => {
  it('takes the next free number when the first name is already used', async () => {
    const gitlab = {
      listBranches: async () => ['agente/fix-9001-1'],
    } as unknown as GitLab;
    await expect(escolherBranch(gitlab, 9001, 1)).resolves.toBe(
      'agente/fix-9001-2',
    );
  });
});
