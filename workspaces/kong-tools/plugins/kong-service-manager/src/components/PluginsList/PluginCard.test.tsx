import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { PluginCard } from './PluginCard';
import type { PluginCard as PluginCardType } from '@veecode-platform/backstage-plugin-kong-service-manager-common';
import type { PromotionBadge } from '../RoutePluginsDrawer/promotionBadge';

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

  // --- Promotion (design 02 / plan P5) ---

  it('does not render a promotion badge when none is provided (service scope)', () => {
    render(
      <PluginCard
        plugin={basePlugin}
        associatedId="plugin-id-123"
        onEnable={noop}
        onEdit={noop}
        onDisable={noop}
      />,
    );

    expect(screen.queryByText(/Experimental/)).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Promote to code/i })).not.toBeInTheDocument();
  });

  it('shows the experimental badge and a Promote to code button when associated with no active promotion', () => {
    const badge: PromotionBadge = { kind: 'experimental', ageMs: 60_000 };
    render(
      <PluginCard
        plugin={basePlugin}
        associatedId="plugin-id-123"
        promotionBadge={badge}
        canPromote
        onEnable={noop}
        onEdit={noop}
        onDisable={noop}
      />,
    );

    expect(screen.getByText(/Experimental/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Promote to code/i })).toBeEnabled();
  });

  it('calls onPromote when Promote to code is clicked', async () => {
    const onPromote = jest.fn();
    const badge: PromotionBadge = { kind: 'experimental', ageMs: 60_000 };
    render(
      <PluginCard
        plugin={basePlugin}
        associatedId="plugin-id-123"
        promotionBadge={badge}
        canPromote
        onEnable={noop}
        onEdit={noop}
        onDisable={noop}
        onPromote={onPromote}
      />,
    );

    await userEvent.click(screen.getByRole('button', { name: /Promote to code/i }));
    expect(onPromote).toHaveBeenCalledWith('plugin-id-123', 'rate-limiting');
  });

  it('disables Promote to code with the reason when the route has no owning repo', () => {
    const badge: PromotionBadge = { kind: 'experimental', ageMs: 60_000 };
    render(
      <PluginCard
        plugin={basePlugin}
        associatedId="plugin-id-123"
        promotionBadge={badge}
        canPromote
        promoteDisabledReason="No owning repo — exposure of repo-less APIs is a future milestone"
        onEnable={noop}
        onEdit={noop}
        onDisable={noop}
      />,
    );

    expect(screen.getByRole('button', { name: /Promote to code/i })).toBeDisabled();
    expect(screen.getByText(/No owning repo/)).toBeInTheDocument();
  });

  it('shows Descartar promoção instead of Disable while a promotion is open, and calls onDiscardPromotion', async () => {
    const onDiscardPromotion = jest.fn();
    const badge: PromotionBadge = { kind: 'mr-open', ageMs: 60_000 };
    render(
      <PluginCard
        plugin={basePlugin}
        associatedId="plugin-id-123"
        promotionBadge={badge}
        canPromote
        onEnable={noop}
        onEdit={noop}
        onDisable={noop}
        onDiscardPromotion={onDiscardPromotion}
      />,
    );

    expect(screen.queryByRole('button', { name: 'Disable' })).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Descartar promoção' }));
    expect(onDiscardPromotion).toHaveBeenCalledWith('plugin-id-123', 'rate-limiting');
  });

  it('hides Disable, Edit, and Promote actions once codified (read-only)', () => {
    const badge: PromotionBadge = { kind: 'codified', ageMs: 60_000 };
    render(
      <PluginCard
        plugin={basePlugin}
        associatedId="plugin-id-123"
        promotionBadge={badge}
        canPromote
        onEnable={noop}
        onEdit={noop}
        onDisable={noop}
      />,
    );

    expect(screen.queryByRole('button', { name: 'Disable' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Edit plugin configuration' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Promote to code/i })).not.toBeInTheDocument();
  });

  it('hides Promote and Discard for a code-owned plugin, but keeps Disable (ADR-017)', () => {
    const badge: PromotionBadge = { kind: 'code-owned', ageMs: 60_000 };
    render(
      <PluginCard
        plugin={basePlugin}
        associatedId="plugin-id-123"
        promotionBadge={badge}
        canPromote
        onEnable={noop}
        onEdit={noop}
        onDisable={noop}
        onDiscardPromotion={noop}
      />,
    );

    expect(screen.queryByRole('button', { name: /Promote to code/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Descartar promoção' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Disable' })).toBeInTheDocument();
  });
});
