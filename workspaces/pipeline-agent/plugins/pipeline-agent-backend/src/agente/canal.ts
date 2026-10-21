// Async queue from one producer to one consumer. The fake runtime uses it to
// emit events and receive user messages without losing any.

export class Canal<T> implements AsyncIterable<T> {
  private readonly fila: T[] = [];
  private readonly espera: Array<(r: IteratorResult<T>) => void> = [];
  private fechado = false;

  enviar(valor: T): void {
    if (this.fechado) return;
    const quem = this.espera.shift();
    if (quem) quem({ value: valor, done: false });
    else this.fila.push(valor);
  }

  fechar(): void {
    this.fechado = true;
    for (const quem of this.espera.splice(0))
      quem({ value: undefined, done: true });
  }

  // Next value, or undefined once the channel is closed.
  async pegar(): Promise<T | undefined> {
    const r = await this.proximo();
    return r.done ? undefined : r.value;
  }

  private proximo(): Promise<IteratorResult<T>> {
    if (this.fila.length > 0)
      return Promise.resolve({ value: this.fila.shift() as T, done: false });
    if (this.fechado) return Promise.resolve({ value: undefined, done: true });
    return new Promise(resolve => this.espera.push(resolve));
  }

  [Symbol.asyncIterator](): AsyncIterator<T> {
    return {
      next: () => this.proximo(),
      return: () => {
        this.fechar();
        return Promise.resolve({ value: undefined, done: true });
      },
    };
  }
}
