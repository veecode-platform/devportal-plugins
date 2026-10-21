// Text that leaves the backend for the Managed Agents session. The sandbox never
// learns the GitLab hostname, so every text passes through ocultarHost.

export const HOST_SUBSTITUTO = 'gitlab.local';

// The ESC byte is exactly what these patterns must match.
/* eslint-disable no-control-regex */
const SEQUENCIA_ANSI = /\x1b\[[0-9;?]*[ -/]*[@-~]/g;
const MARCADOR_SECAO =
  /section_(?:start|end):\d+:[^\s\r\x1b[]+(?:\[[^\]\r\x1b]*\])?/;
/* eslint-enable no-control-regex */

// The hostname of the configured GitLab. The port is left out on purpose: a
// host:port occurrence loses its name too.
export function hostDe(baseUrl: string): string {
  return new URL(baseUrl).hostname;
}

export function ocultarHost(texto: string, host: string): string {
  if (host === '') return texto;
  const escapado = host.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return texto.replace(new RegExp(escapado, 'gi'), HOST_SUBSTITUTO);
}

// Drops the runner preamble (everything before the first "$ " script echo), the
// ANSI escapes and the GitLab section markers, then hides the host. The section
// titles stay; a line that held only a marker goes.
export function sanitizarTrace(trace: string, host: string): string {
  const linhas: string[] = [];
  for (const bruta of trace.split('\n')) {
    const temMarcador = MARCADOR_SECAO.test(bruta);
    const semMarcador = bruta.replace(new RegExp(MARCADOR_SECAO, 'g'), '');
    const limpa = semMarcador.replace(SEQUENCIA_ANSI, '').replace(/\r/g, '');
    if (temMarcador && limpa.trim() === '') continue;
    linhas.push(limpa);
  }
  const inicio = linhas.findIndex(linha => linha.startsWith('$ '));
  const corpo = inicio > 0 ? linhas.slice(inicio) : linhas;
  return ocultarHost(corpo.join('\n'), host);
}
