// Matches `a`, `a.b`, `a['b.c']`, `a["b/c"]` and `a[0]`.
const SEGMENT =
  /\[(?:'((?:[^'\\]|\\.)*)'|"((?:[^"\\]|\\.)*)"|(\d+))\]|([^.[\]]+)/g;

export function parseEntityPath(path: string): string[] {
  const segments: string[] = [];
  for (const match of path.matchAll(SEGMENT)) {
    const quoted = match[1] ?? match[2];
    segments.push(
      quoted !== undefined
        ? quoted.replace(/\\(.)/g, '$1')
        : match[3] ?? match[4],
    );
  }
  return segments;
}

export function getEntityValue(entity: unknown, path: string): unknown {
  let current: unknown = entity;
  for (const segment of parseEntityPath(path)) {
    if (typeof current !== 'object' || current === null) return undefined;
    current = (current as Record<string, unknown>)[segment];
  }
  return current;
}

/** Form properties of a scaffolder step are flat strings. */
export function toFieldValue(value: unknown): string {
  if (value === undefined || value === null) return '';
  if (typeof value === 'string') return value;
  if (typeof value === 'object') return JSON.stringify(value, null, 2);
  return String(value);
}
