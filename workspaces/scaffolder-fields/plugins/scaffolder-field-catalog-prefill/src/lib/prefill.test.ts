import { readOptions, CatalogEntityPrefillOptions } from './options';
import { applyChange, fillValues } from './prefill';

const options: CatalogEntityPrefillOptions = {
  entityRefField: 'skill',
  fill: {
    description: 'metadata.description',
    client: 'metadata.annotations.client',
  },
  when: { operation: ['update', 'remove'] },
};

describe('applyChange', () => {
  it('clears the targets and asks to load when the ref changes', () => {
    const result = applyChange(
      { operation: 'update', description: 'old' },
      { operation: 'update', skill: 'resource:default/a', description: 'old' },
      options,
    );
    expect(result).toEqual({
      next: {
        operation: 'update',
        skill: 'resource:default/a',
        description: '',
        client: '',
      },
      load: 'resource:default/a',
      reset: true,
    });
  });

  it('does not touch anything when the when condition does not match', () => {
    const incoming = {
      operation: 'add',
      skill: 'resource:default/a',
      description: 'typed',
    };
    expect(applyChange({ operation: 'add' }, incoming, options)).toEqual({
      next: incoming,
      reset: false,
    });
  });

  it('clears the ref with an explicit undefined when a when property changes', () => {
    const result = applyChange(
      { operation: 'update', skill: 'resource:default/a', description: 'A' },
      { operation: 'add', skill: 'resource:default/a', description: 'A' },
      options,
    );
    expect(result.next).toEqual({
      operation: 'add',
      skill: undefined,
      description: '',
      client: '',
    });
    expect(Object.keys(result.next)).toContain('skill');
    expect(result.load).toBeUndefined();
    expect(result.reset).toBe(true);
  });

  it('leaves unrelated edits alone', () => {
    const incoming = {
      operation: 'update',
      skill: 'resource:default/a',
      description: 'edited',
    };
    expect(
      applyChange({ ...incoming, description: 'A' }, incoming, options),
    ).toEqual({
      next: incoming,
      reset: false,
    });
  });
});

describe('fillValues', () => {
  it('sets a missing path to an empty string', () => {
    const entity = {
      apiVersion: 'v1',
      kind: 'Resource',
      metadata: { name: 'a', description: 'D' },
    };
    expect(fillValues(entity, options)).toEqual({
      description: 'D',
      client: '',
    });
  });
});

describe('readOptions', () => {
  it('rejects a configuration the field cannot work with', () => {
    expect(() => readOptions(undefined)).toThrow('ui:options is required');
    expect(() => readOptions({ fill: { a: 'b' } })).toThrow('entityRefField');
    expect(() => readOptions({ entityRefField: 'x', fill: {} })).toThrow(
      'fill',
    );
    expect(() =>
      readOptions({ entityRefField: 'x', fill: { a: 'b' }, when: { op: 1 } }),
    ).toThrow('ui:options.when.op');
  });
});
