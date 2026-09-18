import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { mockUseTranslation } from '../../test-utils/mockTranslations';
import { PluginConfigDrawer } from './PluginConfigDrawer';

// A minimal Kong schema: one string config field, mirroring the real
// introspection shape parseConfigFields expects (top-level `config` record).
const pluginFields = {
  fields: [
    {
      config: {
        type: 'record',
        fields: [{ header_name: { type: 'string' } }],
      },
    },
  ],
};

const stub = jest.fn();

jest.mock('../../hooks/useTranslation', () => ({
  useTranslation: mockUseTranslation,
}));

jest.mock('../../context/KongServiceManagerContext', () => ({
  useKongServiceManager: () => ({
    state: {
      pluginFields,
      pluginFieldsKey: 'default:request-transformer',
      instance: 'default',
      loading: false,
    },
    clearError: stub,
    fetchPluginFields: stub,
    addPluginToService: stub,
    editServicePlugin: stub,
    addPluginToRoute: stub,
    editRoutePlugin: stub,
  }),
}));

describe('PluginConfigDrawer first-open seeding (#1)', () => {
  it('fills the form from the plugin live config on the first open, without a reopen', () => {
    render(
      <PluginConfigDrawer
        open
        pluginName="request-transformer"
        pluginId="plugin-1"
        existingConfig={{ header_name: 'X-Trace' }}
        existingEnabled
        scope="service"
        onClose={stub}
      />,
    );

    // The controlled input reflects the seeded value immediately — the bug was
    // an uncontrolled defaultValue that stayed blank until close/reopen.
    expect(screen.getByLabelText('config.header_name')).toHaveValue('X-Trace');
  });

  it('reflects the plugin real enabled state on edit instead of forcing it on', () => {
    render(
      <PluginConfigDrawer
        open
        pluginName="request-transformer"
        pluginId="plugin-1"
        existingConfig={{ header_name: 'X-Trace' }}
        existingEnabled={false}
        scope="service"
        onClose={stub}
      />,
    );

    expect(screen.getByRole('checkbox', { name: 'Enabled' })).not.toBeChecked();
  });

  it('does not overwrite a user edit when the parent re-renders with a fresh config object', async () => {
    const { rerender } = render(
      <PluginConfigDrawer
        open
        pluginName="request-transformer"
        pluginId="plugin-1"
        existingConfig={{ header_name: 'X-Trace' }}
        existingEnabled
        scope="service"
        onClose={stub}
      />,
    );

    const field = screen.getByLabelText('config.header_name');
    await userEvent.clear(field);
    await userEvent.type(field, 'X-Custom');
    expect(field).toHaveValue('X-Custom');

    // Same values, new object identity — a normal parent re-render. The seed
    // guard must keep the user's edit rather than re-seed over it.
    rerender(
      <PluginConfigDrawer
        open
        pluginName="request-transformer"
        pluginId="plugin-1"
        existingConfig={{ header_name: 'X-Trace' }}
        existingEnabled
        scope="service"
        onClose={stub}
      />,
    );

    expect(screen.getByLabelText('config.header_name')).toHaveValue('X-Custom');
  });
});
