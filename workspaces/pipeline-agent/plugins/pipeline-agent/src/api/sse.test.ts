import { analisarSse } from './sse';

// Feeds chunks one after another, carrying the unfinished text as the caller would.
function ler(chunks: string[]) {
  let resto = '';
  const quadros = [];
  for (const pedaco of chunks) {
    const resultado = analisarSse(resto, pedaco);
    resto = resultado.resto;
    quadros.push(...resultado.quadros);
  }
  return { quadros, resto };
}

describe('analisarSse', () => {
  it('reads the id and the data of a frame', () => {
    const { quadros } = ler(['id: 4\ndata: {"tipo":"passo"}\n\n']);

    expect(quadros).toEqual([{ id: '4', data: '{"tipo":"passo"}' }]);
  });

  it('keeps a frame split across two chunks', () => {
    const { quadros, resto } = ler([
      'id: 7\ndata: {"tipo":"fase",',
      '"fase":"verde"}\n\n',
    ]);

    expect(quadros).toEqual([
      { id: '7', data: '{"tipo":"fase","fase":"verde"}' },
    ]);
    expect(resto).toBe('');
  });

  it('emits nothing until the blank line that ends the frame arrives', () => {
    const { quadros, resto } = ler(['id: 2\ndata: {"tipo":"passo"}\n']);

    expect(quadros).toEqual([]);
    expect(resto).toBe('id: 2\ndata: {"tipo":"passo"}\n');
  });

  it('ignores comment heartbeats', () => {
    const { quadros } = ler([': ping\n\n', 'id: 9\ndata: {}\n\n']);

    expect(quadros).toEqual([{ id: '9', data: '{}' }]);
  });

  it('joins multi-line data with a newline', () => {
    const { quadros } = ler(['id: 1\ndata: linha um\ndata: linha dois\n\n']);

    expect(quadros).toEqual([{ id: '1', data: 'linha um\nlinha dois' }]);
  });

  it('accepts CRLF line endings, including a CR split from its LF', () => {
    const { quadros } = ler(['id: 5\r\ndata: {"a":1}\r', '\n\r\n']);

    expect(quadros).toEqual([{ id: '5', data: '{"a":1}' }]);
  });

  it('gives a frame without an id no id', () => {
    const { quadros } = ler(['data: {"tipo":"verde"}\n\n']);

    expect(quadros).toEqual([{ id: undefined, data: '{"tipo":"verde"}' }]);
  });
});
