import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { PluginCard } from './PluginCard';
import type { PluginCard as PluginCardType } from '@veecode-platform/backstage-plugin-kong-service-manager-common';

const basePlugin: PluginCardType = {
  name: 'rate-limiting',
  slug: 'rate-limiting',
  associated: false,
  description: 'Rate limit how many HTTP requests can be made',
};

const noop = () => {};

describe('PluginCard', () => {
  it('renders plugin name and description', () => {
    render(
      <PluginCard
        plugin={basePlugin}
        onEnable={noop}
        onEdit={noop}
        onDisable={noop}
      />,
    );

    expect(screen.getByText('rate-limiting')).toBeInTheDocument();
    expect(
      screen.getByText('Rate limit how many HTTP requests can be made'),
    ).toBeInTheDocument();
  });

  it('shows Enable button when not associated', () => {
    render(
      <PluginCard
        plugin={basePlugin}
        onEnable={noop}
        onEdit={noop}
        onDisable={noop}
      />,
    );

    expect(screen.getByRole('button', { name: 'Enable' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Disable' })).not.toBeInTheDocument();
  });

  it('shows Disable button when associated', () => {
    render(
      <PluginCard
        plugin={basePlugin}
        associatedId="plugin-id-123"
        onEnable={noop}
        onEdit={noop}
        onDisable={noop}
      />,
    );

    expect(screen.getByRole('button', { name: 'Disable' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Enable' })).not.toBeInTheDocument();
  });

  it('calls onEnable with plugin slug when Enable is clicked', async () => {
    const onEnable = jest.fn();
    render(
      <PluginCard
        plugin={basePlugin}
        onEnable={onEnable}
        onEdit={noop}
        onDisable={noop}
      />,
    );

    await userEvent.click(screen.getByRole('button', { name: 'Enable' }));
    expect(onEnable).toHaveBeenCalledWith('rate-limiting');
  });

  it('calls onDisable with plugin id and name when Disable is clicked', async () => {
    const onDisable = jest.fn();
    render(
      <PluginCard
        plugin={basePlugin}
        associatedId="plugin-id-123"
        onEnable={noop}
        onEdit={noop}
        onDisable={onDisable}
      />,
    );

    await userEvent.click(screen.getByRole('button', { name: 'Disable' }));
    expect(onDisable).toHaveBeenCalledWith('plugin-id-123', 'rate-limiting');
  });

  it('shows edit button when associated', () => {
    render(
      <PluginCard
        plugin={basePlugin}
        associatedId="plugin-id-123"
        onEnable={noop}
        onEdit={noop}
        onDisable={noop}
      />,
    );

    expect(
      screen.getByRole('button', { name: 'Edit plugin configuration' }),
    ).toBeInTheDocument();
  });
});
