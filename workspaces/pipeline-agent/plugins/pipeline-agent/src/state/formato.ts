// "12 s", "4 min" or "4 min 12 s", for the time from the click to the green pipeline.
export function duracao(segundos: number): string {
  const total = Math.max(0, Math.round(segundos));
  if (total < 60) return `${total} s`;
  const minutos = Math.floor(total / 60);
  const resto = total % 60;
  return resto === 0 ? `${minutos} min` : `${minutos} min ${resto} s`;
}

// How long ago the failed pipeline ran, from the banner's whole minutes.
export function tempoAtras(minutos: number): string {
  if (minutos === 0) return 'menos de 1 min';
  if (minutos < 60) return `${minutos} min`;
  const horas = Math.floor(minutos / 60);
  const resto = minutos % 60;
  return resto === 0 ? `${horas} h` : `${horas} h ${resto} min`;
}

// "build", "build e test", "a, b e c": the list shown in a sentence.
export function listaComE(itens: string[]): string {
  if (itens.length < 2) return itens[0] ?? '';
  return `${itens.slice(0, -1).join(', ')} e ${itens[itens.length - 1]}`;
}

const doisDigitos = (n: number) => String(n).padStart(2, '0');

// "19/10 às 16:38". The year is added only when it is not the year of `agora`.
// Local getters, not toLocaleString, so the text does not depend on the ICU data.
export function dataCurta(iso: string, agora: Date): string {
  const data = new Date(iso);
  const dia = doisDigitos(data.getDate());
  const mes = doisDigitos(data.getMonth() + 1);
  const hora = doisDigitos(data.getHours());
  const minuto = doisDigitos(data.getMinutes());
  const ano =
    data.getFullYear() === agora.getFullYear() ? '' : `/${data.getFullYear()}`;
  return `${dia}/${mes}${ano} às ${hora}:${minuto}`;
}

export function dolar(valor: number): string {
  return `US$ ${valor.toFixed(2).replace('.', ',')}`;
}

export type TrechoLinha = { tipo: 'texto' | 'codigo'; valor: string };

// Splits a line at each pair of single backticks; an unpaired backtick stays text.
export function partirCodigo(linha: string): TrechoLinha[] {
  return linha
    .split(/`([^`]+)`/)
    .map(
      (valor, i): TrechoLinha => ({
        tipo: i % 2 === 1 ? 'codigo' : 'texto',
        valor,
      }),
    )
    .filter(trecho => trecho.valor !== '');
}
