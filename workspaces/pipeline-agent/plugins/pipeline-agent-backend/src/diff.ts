import { createTwoFilesPatch } from 'diff';

// Diff unificado do arquivo atual (main) contra a proposta do agente.
// Arquivo novo entra com o lado anterior vazio.
export function diffArquivo(
  caminho: string,
  antes: string,
  depois: string,
): string {
  const bruto = createTwoFilesPatch(
    `a/${caminho}`,
    `b/${caminho}`,
    antes,
    depois,
    'main',
    'proposta',
    {
      context: 3,
    },
  );
  return bruto
    .split('\n')
    .filter(linha => !linha.startsWith('Index:') && !/^={3,}$/.test(linha))
    .join('\n');
}
