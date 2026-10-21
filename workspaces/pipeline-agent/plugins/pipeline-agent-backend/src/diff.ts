import { createTwoFilesPatch } from 'diff';

// One file of a commit as GitLab reports it: the hunks only, without the header.
export type ArquivoCommit = {
  antes: string;
  depois: string;
  novo: boolean;
  removido: boolean;
  hunks: string;
};

// Git-style unified diff of a whole commit, one header per file.
export function renderizarDiffCommit(arquivos: ArquivoCommit[]): string {
  return arquivos
    .map(a => {
      const cabecalho = [
        `diff --git a/${a.antes} b/${a.depois}`,
        `--- ${a.novo ? '/dev/null' : `a/${a.antes}`}`,
        `+++ ${a.removido ? '/dev/null' : `b/${a.depois}`}`,
      ].join('\n');
      if (a.hunks === '') return `${cabecalho}\n`;
      return `${cabecalho}\n${
        a.hunks.endsWith('\n') ? a.hunks : `${a.hunks}\n`
      }`;
    })
    .join('');
}

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
