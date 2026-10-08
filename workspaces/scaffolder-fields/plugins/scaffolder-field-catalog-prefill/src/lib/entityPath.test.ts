import { getEntityValue, parseEntityPath, toFieldValue } from './entityPath';

const entity = {
  metadata: {
    description: 'A description',
    annotations: { 'example.com/client': 'client-a', plain: 'x' },
  },
  spec: { tags: ['a', 'b'], count: 3, items: [{ name: 'first' }] },
};

describe('entity paths', () => {
  it('parses dots, bracket keys and indexes', () => {
    expect(
      parseEntityPath("metadata.annotations['example.com/client']"),
    ).toEqual(['metadata', 'annotations', 'example.com/client']);
    expect(parseEntityPath('spec.items[0].name')).toEqual([
      'spec',
      'items',
      '0',
      'name',
    ]);
    expect(parseEntityPath('a["b.c"]')).toEqual(['a', 'b.c']);
  });

  it('reads nested values and returns undefined for missing paths', () => {
    expect(getEntityValue(entity, 'metadata.description')).toBe(
      'A description',
    );
    expect(
      getEntityValue(entity, "metadata.annotations['example.com/client']"),
    ).toBe('client-a');
    expect(getEntityValue(entity, 'spec.items[0].name')).toBe('first');
    expect(getEntityValue(entity, 'spec.nothing.here')).toBeUndefined();
  });

  it('turns every value into the string a flat form property holds', () => {
    expect(toFieldValue(undefined)).toBe('');
    expect(toFieldValue(null)).toBe('');
    expect(toFieldValue('text')).toBe('text');
    expect(toFieldValue(3)).toBe('3');
    expect(toFieldValue(false)).toBe('false');
    expect(toFieldValue(['a', 'b'])).toBe('[\n  "a",\n  "b"\n]');
  });
});
