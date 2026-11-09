// Server-sent events parsed from text chunks. EventSource cannot send the user's
// token, so the client reads the body itself and feeds each chunk here.

export type QuadroSse = { id?: string; data: string };

export type ResultadoSse = { quadros: QuadroSse[]; resto: string };

// `resto` is the unfinished frame carried into the next chunk. A frame ends at a
// blank line. Comment lines (heartbeats) and fields other than id and data are
// ignored, and multi-line data is joined with a newline.
export function analisarSse(resto: string, pedaco: string): ResultadoSse {
  const texto = (resto + pedaco).replace(/\r\n/g, '\n');
  const fim = texto.lastIndexOf('\n\n');
  if (fim === -1) return { quadros: [], resto: texto };

  const quadros: QuadroSse[] = [];
  for (const bloco of texto.slice(0, fim).split('\n\n')) {
    let id: string | undefined;
    const dados: string[] = [];
    for (const linha of bloco.split('\n')) {
      if (linha.startsWith(':')) continue;
      const dois = linha.indexOf(':');
      const campo = dois === -1 ? linha : linha.slice(0, dois);
      const valor = dois === -1 ? '' : linha.slice(dois + 1).replace(/^ /, '');
      if (campo === 'id') id = valor;
      if (campo === 'data') dados.push(valor);
    }
    if (dados.length > 0) quadros.push({ id, data: dados.join('\n') });
  }
  return { quadros, resto: texto.slice(fim + 2) };
}
