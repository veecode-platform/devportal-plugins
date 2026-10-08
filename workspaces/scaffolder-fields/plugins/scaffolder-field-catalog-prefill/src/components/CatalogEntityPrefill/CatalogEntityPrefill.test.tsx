import { ComponentProps, ReactNode, useState } from 'react';
import Form, { getDefaultRegistry } from '@rjsf/core';
import validator from '@rjsf/validator-ajv8';
import { Entity } from '@backstage/catalog-model';
import { renderInTestApp, TestApiProvider } from '@backstage/test-utils';
import { catalogApiRef } from '@backstage/plugin-catalog-react';
import { act, fireEvent, screen, waitFor } from '@testing-library/react';
import { CatalogEntityPrefill } from './CatalogEntityPrefill';
import { CatalogEntityPrefillOptions, StepData } from '../../lib/options';
import ptBR from '../../translations/pt-BR';
import { catalogEntityPrefillMessages } from '../../translations';

const REF_A = 'resource:default/skill-a';
const REF_B = 'resource:default/skill-b';

const entities: Record<string, Entity> = {
  [REF_A]: entity('skill-a', 'Description A', 'Instructions A', 'client-a'),
  [REF_B]: entity('skill-b', 'Description B', 'Instructions B', 'client-b'),
};

function entity(
  name: string,
  description: string,
  instructions: string,
  client: string,
): Entity {
  return {
    apiVersion: 'backstage.io/v1alpha1',
    kind: 'Resource',
    metadata: {
      name,
      description,
      annotations: { 'example.com/client': client },
    },
    spec: { type: 'skill', owner: 'team-a', instructions },
  };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

const schema = {
  type: 'object',
  properties: {
    operation: {
      type: 'string',
      title: 'Operation',
      enum: ['add', 'update', 'remove'],
    },
    skill: { type: 'string', title: 'Skill' },
    description: { type: 'string', title: 'Description' },
    instructions: { type: 'string', title: 'Instructions' },
    client: { type: 'string', title: 'Client' },
    extra: { type: 'string', title: 'Extra' },
  },
} as const;

type Options = CatalogEntityPrefillOptions;

const baseOptions: Options = {
  entityRefField: 'skill',
  fill: {
    description: 'metadata.description',
    instructions: 'spec.instructions',
    client: "metadata.annotations['example.com/client']",
  },
  when: { operation: ['update', 'remove'] },
  readonlyWhen: { operation: 'remove' },
};

const getEntityByRef = jest.fn();

let lastData: StepData = {};
const objectFieldUiSchemas: Record<string, unknown>[] = [];

const { ObjectField } = getDefaultRegistry().fields;

const ObjectFieldSpy = (props: ComponentProps<typeof ObjectField>) => {
  objectFieldUiSchemas.push(props.uiSchema as Record<string, unknown>);
  return <ObjectField {...props} />;
};

function Harness({
  initial,
  options,
}: {
  initial: StepData;
  options: Options;
}) {
  const [formData, setFormData] = useState<StepData>(initial);
  const uiSchema = {
    'ui:field': 'CatalogEntityPrefill',
    'ui:options': options,
  };
  lastData = formData;
  return (
    <Form
      validator={validator}
      schema={schema as never}
      uiSchema={uiSchema}
      formData={formData}
      fields={{
        CatalogEntityPrefill: CatalogEntityPrefill as never,
        ObjectField: ObjectFieldSpy,
      }}
      // The scaffolder stepper merges each change into its state.
      onChange={event =>
        setFormData(current => ({ ...current, ...event.formData }))
      }
    />
  );
}

async function renderStep(
  initial: StepData = { operation: 'update' },
  options: Options = baseOptions,
  wrap: (children: ReactNode) => ReactNode = children => children,
) {
  await renderInTestApp(
    <TestApiProvider apis={[[catalogApiRef, { getEntityByRef }]]}>
      {wrap(<Harness initial={initial} options={options} />)}
    </TestApiProvider>,
  );
}

const field = (label: string) =>
  screen.getByLabelText(label) as HTMLInputElement;
const type = (label: string, value: string) =>
  fireEvent.change(field(label), { target: { value } });
const select = (ref: string) => type('Skill', ref);

beforeEach(() => {
  getEntityByRef.mockReset();
  getEntityByRef.mockImplementation(async (ref: string) => entities[ref]);
});

describe('CatalogEntityPrefill', () => {
  it('fills every target in one change when an entity is selected', async () => {
    await renderStep();
    select(REF_A);

    await waitFor(() =>
      expect(field('Description')).toHaveValue('Description A'),
    );
    expect(field('Instructions')).toHaveValue('Instructions A');
    expect(field('Client')).toHaveValue('client-a');
    expect(getEntityByRef).toHaveBeenCalledWith(REF_A);
    expect(lastData).toMatchObject({
      skill: REF_A,
      description: 'Description A',
      instructions: 'Instructions A',
      client: 'client-a',
    });
  });

  it('clears the targets right away and keeps them read-only while loading', async () => {
    const pending = deferred<Entity>();
    getEntityByRef.mockReturnValueOnce(pending.promise);
    await renderStep({
      operation: 'update',
      description: 'stale',
      client: 'stale',
    });

    select(REF_A);

    expect(field('Description')).toHaveValue('');
    expect(field('Description')).toHaveAttribute('readonly');
    expect(field('Client')).toHaveValue('');
    expect(screen.getByRole('status')).toHaveTextContent(
      'Loading data from the catalog',
    );

    await act(async () => pending.resolve(entities[REF_A]));
    await waitFor(() =>
      expect(field('Description')).toHaveValue('Description A'),
    );
    expect(field('Description')).not.toHaveAttribute('readonly');
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });

  it('keeps an edit until the selection changes, then reloads', async () => {
    await renderStep();
    select(REF_A);
    await waitFor(() =>
      expect(field('Description')).toHaveValue('Description A'),
    );

    type('Description', 'edited by hand');
    type('Extra', 'unrelated');
    expect(field('Description')).toHaveValue('edited by hand');
    expect(getEntityByRef).toHaveBeenCalledTimes(1);

    select(REF_B);
    await waitFor(() =>
      expect(field('Description')).toHaveValue('Description B'),
    );
    expect(field('Instructions')).toHaveValue('Instructions B');
    expect(field('Extra')).toHaveValue('unrelated');
  });

  it('never lets a late response for A overwrite B', async () => {
    const forA = deferred<Entity>();
    const forB = deferred<Entity>();
    getEntityByRef.mockImplementation((ref: string) =>
      ref === REF_A ? forA.promise : forB.promise,
    );
    await renderStep();

    select(REF_A);
    select(REF_B);
    await act(async () => forB.resolve(entities[REF_B]));
    await waitFor(() =>
      expect(field('Description')).toHaveValue('Description B'),
    );

    await act(async () => forA.resolve(entities[REF_A]));
    expect(field('Description')).toHaveValue('Description B');
    expect(lastData.skill).toBe(REF_B);
    expect(lastData.description).toBe('Description B');
  });

  it('ignores a failure of an outdated request', async () => {
    const forA = deferred<Entity>();
    getEntityByRef.mockImplementation((ref: string) =>
      ref === REF_A ? forA.promise : Promise.resolve(entities[REF_B]),
    );
    await renderStep();

    select(REF_A);
    select(REF_B);
    await waitFor(() =>
      expect(field('Description')).toHaveValue('Description B'),
    );
    await act(async () => forA.reject(new Error('boom')));

    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('sets a target to an empty string when the path is not in the entity', async () => {
    await renderStep(
      { operation: 'update', extra: 'old' },
      {
        ...baseOptions,
        fill: { ...baseOptions.fill, extra: 'spec.missing.deeply' },
      },
    );
    select(REF_A);

    await waitFor(() =>
      expect(field('Description')).toHaveValue('Description A'),
    );
    expect(field('Extra')).toHaveValue('');
    expect(lastData.extra).toBe('');
  });

  it('does not fetch while the when condition does not match', async () => {
    await renderStep({ operation: 'add', description: 'typed' });
    select(REF_A);

    expect(getEntityByRef).not.toHaveBeenCalled();
    expect(field('Description')).toHaveValue('typed');
  });

  it('clears the entity and the targets when a when property changes', async () => {
    await renderStep();
    select(REF_A);
    await waitFor(() =>
      expect(field('Description')).toHaveValue('Description A'),
    );

    fireEvent.change(field('Operation'), { target: { value: 'add' } });

    expect(field('Skill')).toHaveValue('');
    expect(field('Description')).toHaveValue('');
    expect(field('Client')).toHaveValue('');
    expect(lastData.skill).toBeUndefined();
  });

  it('marks the targets read-only only while readonlyWhen matches', async () => {
    await renderStep({ operation: 'remove' });
    select(REF_A);
    await waitFor(() =>
      expect(field('Description')).toHaveValue('Description A'),
    );
    expect(field('Description')).toHaveAttribute('readonly');
    expect(field('Instructions')).toHaveAttribute('readonly');
    expect(field('Extra')).not.toHaveAttribute('readonly');
    expect(field('Skill')).not.toHaveAttribute('readonly');

    fireEvent.change(field('Operation'), { target: { value: 'update' } });
    expect(field('Description')).not.toHaveAttribute('readonly');
  });

  it('hands the step to the default ObjectField without its own ui:field', async () => {
    objectFieldUiSchemas.length = 0;
    await renderStep();

    expect(objectFieldUiSchemas.length).toBeGreaterThan(0);
    for (const uiSchema of objectFieldUiSchemas) {
      expect(uiSchema).not.toHaveProperty('ui:field');
    }
  });
});

describe('holding the step', () => {
  // The stepper's submit button runs the browser's form validation.
  const formIsValid = () => document.querySelector('form')!.checkValidity();

  it('keeps the form invalid while loading and releases it afterwards', async () => {
    const pending = deferred<Entity>();
    getEntityByRef.mockReturnValueOnce(pending.promise);
    await renderStep();
    select(REF_A);

    expect(formIsValid()).toBe(false);

    await act(async () => pending.resolve(entities[REF_A]));
    await waitFor(() =>
      expect(field('Description')).toHaveValue('Description A'),
    );
    expect(formIsValid()).toBe(true);
  });

  it('keeps the form invalid and shows an alert after a load error', async () => {
    getEntityByRef.mockRejectedValueOnce(new Error('catalog is down'));
    await renderStep();
    select(REF_A);

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Could not load',
    );
    expect(formIsValid()).toBe(false);
    expect(field('Description')).toHaveValue('');
  });

  it('treats an entity that does not exist as a load error', async () => {
    await renderStep();
    select('resource:default/unknown');
    expect(await screen.findByRole('alert')).toBeInTheDocument();
  });

  it('recovers from an error when another entity is selected', async () => {
    getEntityByRef.mockRejectedValueOnce(new Error('catalog is down'));
    await renderStep();
    select(REF_A);
    await screen.findByRole('alert');

    select(REF_B);
    await waitFor(() =>
      expect(field('Description')).toHaveValue('Description B'),
    );
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(formIsValid()).toBe(true);
  });
});

describe('texts', () => {
  it('shows English by default and lets ui:options.messages override both texts', async () => {
    const pending = deferred<Entity>();
    getEntityByRef.mockReturnValueOnce(pending.promise);
    await renderStep(
      { operation: 'update' },
      {
        ...baseOptions,
        messages: {
          loading: 'Fetching the skill…',
          error: 'Skill unavailable',
        },
      },
    );
    select(REF_A);
    expect(screen.getByRole('status')).toHaveTextContent('Fetching the skill…');

    await act(async () => pending.reject(new Error('nope')));
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Skill unavailable',
    );
  });

  it('ships a complete pt-BR translation', () => {
    expect(Object.keys(ptBR.messages).sort()).toEqual([
      'status.error',
      'status.loading',
    ]);
    expect(ptBR.messages['status.loading']).not.toBe(
      catalogEntityPrefillMessages.status.loading,
    );
    expect(ptBR.messages['status.loading']).toMatch(/Carregando/);
  });
});
