import { Entity } from '@backstage/catalog-model';
import { renderInTestApp, TestApiProvider } from '@backstage/test-utils';
import { catalogApiRef } from '@backstage/plugin-catalog-react';
import { Stepper } from '@backstage/plugin-scaffolder-react/alpha';
import { act, fireEvent, screen, waitFor } from '@testing-library/react';
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

async function renderStepper(
  getEntityByRef: () => Promise<Entity> = async () => skill,
) {
  const onCreate = jest.fn();
  await renderInTestApp(
    <TestApiProvider apis={[[catalogApiRef, { getEntityByRef }]]}>
      <Stepper
        manifest={manifest as never}
        extensions={[
          {
            name: 'CatalogEntityPrefill',
            component: CatalogEntityPrefill as never,
          },
        ]}
        onCreate={onCreate}
      />
    </TestApiProvider>,
  );
  return { onCreate };
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

  it('stays on the step until the entity has loaded', async () => {
    let resolve!: (entity: Entity) => void;
    await renderStepper(() => new Promise(res => (resolve = res)));
    await userEvent.click(screen.getByRole('button', { name: /operation/i }));
    await userEvent.click(
      await screen.findByRole('option', { name: 'update' }),
    );
    fireEvent.change(await screen.findByLabelText('Skill'), {
      target: { value: 'resource:default/skill-a' },
    });

    await userEvent.click(screen.getByRole('button', { name: /review/i }));
    // The stepper validates asynchronously; give it time to advance.
    await act(() => new Promise(res => setTimeout(res, 100)));
    expect(
      screen.queryByRole('button', { name: /create/i }),
    ).not.toBeInTheDocument();

    await act(async () => resolve(skill));
    await userEvent.click(screen.getByRole('button', { name: /review/i }));
    expect(
      await screen.findByRole('button', { name: /create/i }),
    ).toBeInTheDocument();
  });
});
