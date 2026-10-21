export function duracao(segundos: number): string {
  const total = Math.max(0, Math.round(segundos));
  return `${Math.floor(total / 60)}m ${total % 60}s`;
}

export function dolar(valor: number): string {
  return `US$ ${valor.toFixed(2).replace('.', ',')}`;
}
