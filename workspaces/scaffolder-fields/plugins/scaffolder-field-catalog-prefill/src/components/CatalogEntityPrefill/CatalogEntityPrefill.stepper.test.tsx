import { Entity } from '@backstage/catalog-model';
import { renderInTestApp, TestApiProvider } from '@backstage/test-utils';
import { catalogApiRef } from '@backstage/plugin-catalog-react';
import { Stepper } from '@backstage/plugin-scaffolder-react/alpha';
import { fireEvent, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { CatalogEntityPrefill } from './CatalogEntityPrefill';

// The real scaffolder stepper, the way a template step reaches the field.
const manifest = {
  title: 'Manage a skill',
  steps: [
    {
      title: 'Skill',
      schema: {
        type: 'object',
        required: ['operation'],
        'ui:field': 'CatalogEntityPrefill',
        'ui:options': {
          entityRefField: 'skill',
          fill: { description: 'metadata.description' },
          when: { operation: ['update', 'remove'] },
          readonlyWhen: { operation: 'remove' },
        },
        properties: {
          operation: {
            type: 'string',
            title: 'Operation',
            enum: ['add', 'update', 'remove'],
            default: 'add',
          },
        },
        dependencies: {
          operation: {
            oneOf: [
              { properties: { operation: { enum: ['add'] } } },
              {
                properties: {
                  operation: { enum: ['update', 'remove'] },
                  skill: { type: 'string', title: 'Skill' },
                  description: {
                    type: 'string',
                    title: 'Description',
                    'ui:widget': 'textarea',
                  },
                },
              },
            ],
          },
        },
      },
    },
  ],
};

const skill: Entity = {
  apiVersion: 'backstage.io/v1alpha1',
  kind: 'Resource',
  metadata: { name: 'skill-a', description: 'Description A' },
  spec: { type: 'skill', owner: 'team-a' },
};

async function renderStepper(validation = jest.fn()) {
  const onCreate = jest.fn();
  await renderInTestApp(
    <TestApiProvider
      apis={[[catalogApiRef, { getEntityByRef: async () => skill }]]}
    >
      <Stepper
        manifest={manifest as never}
        extensions={[
          {
            name: 'CatalogEntityPrefill',
            component: CatalogEntityPrefill as never,
            validation,
          },
        ]}
        onCreate={onCreate}
      />
    </TestApiProvider>,
  );
  return { onCreate, validation };
}

describe('CatalogEntityPrefill on the scaffolder stepper', () => {
  beforeAll(() => {
    // The stepper scrolls to the top on every step; jsdom has no scrollTo.
    window.scrollTo = jest.fn();
  });

  it('works with dependencies.oneOf and keeps the submitted values flat', async () => {
    const { onCreate } = await renderStepper();
    expect(screen.queryByLabelText('Skill')).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: /operation/i }));
    await userEvent.click(
      await screen.findByRole('option', { name: 'update' }),
    );
    fireEvent.change(await screen.findByLabelText('Skill'), {
      target: { value: 'resource:default/skill-a' },
    });
    await waitFor(() =>
      expect(screen.getByLabelText('Description')).toHaveValue('Description A'),
    );

    await userEvent.click(screen.getByRole('button', { name: /review/i }));
    await userEvent.click(
      await screen.findByRole('button', { name: /create/i }),
    );
    expect(onCreate).toHaveBeenCalledWith({
      operation: 'update',
      skill: 'resource:default/skill-a',
      description: 'Description A',
    });
  });

  // createAsyncValidators only visits the properties of a step, never the step
  // itself, so on this Backstage line the validation hook of a field placed on
  // the step's root object is not called.
  it('does not call the validation hook of a root-level field', async () => {
    const { validation } = await renderStepper();
    await userEvent.click(screen.getByRole('button', { name: /review/i }));
    await screen.findByRole('button', { name: /create/i });
    expect(validation).not.toHaveBeenCalled();
  });
});
