import { erroDeRede } from './erros';

// Yields the body of a streamed response as decoded text. The decoder keeps a
// multi-byte character that a chunk ends in until the next chunk completes it.
export async function* pedacosDoCorpo(
  resposta: Response,
): AsyncGenerator<string> {
  if (!resposta.body) throw erroDeRede();
  const leitor = resposta.body.getReader();
  const decodificador = new TextDecoder();
  for (;;) {
    const { done, value } = await leitor.read();
    if (done) break;
    yield decodificador.decode(value, { stream: true });
  }
  yield decodificador.decode();
}
