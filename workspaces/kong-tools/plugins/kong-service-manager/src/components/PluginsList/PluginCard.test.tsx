import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { mockUseTranslation } from '../../test-utils/mockTranslations';
import { PluginCard } from './PluginCard';
import type { PluginCard as PluginCardType } from '@veecode-platform/backstage-plugin-kong-service-manager-common';
import type { PromotionBadge } from '../RoutePluginsDrawer/promotionBadge';

jest.mock('../../hooks/useTranslation', () => ({
  useTranslation: mockUseTranslation,
}));

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
      <PluginCard plugin={basePlugin} onEnable={noop} onEdit={noop} />,
    );

    expect(screen.getByText('rate-limiting')).toBeInTheDocument();
    expect(
      screen.getByText('Rate limit how many HTTP requests can be made'),
    ).toBeInTheDocument();
  });

  it('shows Enable button (and no toggle or removal action) when not associated', () => {
    render(
      <PluginCard
        plugin={basePlugin}
        onEnable={noop}
        onEdit={noop}
        onToggleEnabled={noop}
      />,
    );

    expect(screen.getByRole('button', { name: 'Enable' })).toBeInTheDocument();
    expect(screen.queryByRole('checkbox')).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Delete plugin' }),
    ).not.toBeInTheDocument();
  });

  // --- Enable / disable toggle (#2) ---

  it('shows the enabled toggle when associated, not Enable', () => {
    render(
      <PluginCard
        plugin={basePlugin}
        associatedId="plugin-id-123"
        enabled
        onEnable={noop}
        onEdit={noop}
        onToggleEnabled={noop}
      />,
    );

    expect(screen.getByRole('checkbox')).toBeChecked();
    expect(screen.getByText('Enabled')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Enable' })).not.toBeInTheDocument();
  });

  it('reflects a disabled plugin: toggle off, label "Disabled"', () => {
    render(
      <PluginCard
        plugin={basePlugin}
        associatedId="plugin-id-123"
        enabled={false}
        onEnable={noop}
        onEdit={noop}
        onToggleEnabled={noop}
      />,
    );

    expect(screen.getByRole('checkbox')).not.toBeChecked();
    expect(screen.getByText('Disabled')).toBeInTheDocument();
  });

  it('calls onEnable with plugin slug when Enable is clicked', async () => {
    const onEnable = jest.fn();
    render(<PluginCard plugin={basePlugin} onEnable={onEnable} onEdit={noop} />);

    await userEvent.click(screen.getByRole('button', { name: 'Enable' }));
    expect(onEnable).toHaveBeenCalledWith('rate-limiting');
  });

  it('calls onToggleEnabled with the next value when the toggle is flipped off', async () => {
    const onToggleEnabled = jest.fn();
    render(
      <PluginCard
        plugin={basePlugin}
        associatedId="plugin-id-123"
        enabled
        onEnable={noop}
        onEdit={noop}
        onToggleEnabled={onToggleEnabled}
      />,
    );

    await userEvent.click(screen.getByRole('checkbox'));
    expect(onToggleEnabled).toHaveBeenCalledWith('plugin-id-123', 'rate-limiting', false);
  });

  it('shows edit button when associated', () => {
    render(
      <PluginCard
        plugin={basePlugin}
        associatedId="plugin-id-123"
        onEnable={noop}
        onEdit={noop}
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
      />,
    );

    expect(screen.getByRole('button', { name: /Promote to code/i })).toBeDisabled();
    expect(screen.getByText(/No owning repo/)).toBeInTheDocument();
  });

  it('shows Discard promotion instead of the toggle while a promotion is open, and calls onDiscardPromotion', async () => {
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
        onToggleEnabled={noop}
        onDiscardPromotion={onDiscardPromotion}
      />,
    );

    expect(screen.queryByRole('checkbox')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Delete plugin' })).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Discard promotion' }));
    expect(onDiscardPromotion).toHaveBeenCalledWith('plugin-id-123', 'rate-limiting');
  });

  it('hides toggle, Edit, and Promote actions once codified (read-only)', () => {
    const badge: PromotionBadge = { kind: 'codified', ageMs: 60_000 };
    render(
      <PluginCard
        plugin={basePlugin}
        associatedId="plugin-id-123"
        promotionBadge={badge}
        canPromote
        onEnable={noop}
        onEdit={noop}
        onToggleEnabled={noop}
      />,
    );

    expect(screen.queryByRole('checkbox')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Delete plugin' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Edit plugin configuration' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Promote to code/i })).not.toBeInTheDocument();
    expect(screen.getByText(/Managed from the repository/)).toBeInTheDocument();
  });

  it('hides Promote after a failed handover (ADR-020: nothing left to promote)', () => {
    const badge: PromotionBadge = {
      kind: 'failed-restored',
      ageMs: 60_000,
      record: {
        id: 1,
        instance: 'default',
        serviceName: 'svc',
        routeId: 'route-1',
        pluginType: 'rate-limiting',
        state: 'failed',
        mrRef: 'https://gitlab.example.com/team/svc/-/merge_requests/1',
        requesterRef: 'user:default/alice',
        createdAt: '2026-09-13T12:00:00.000Z',
        updatedAt: '2026-09-13T12:00:00.000Z',
        detail: 'did not converge; not restored',
      },
    };
    render(
      <PluginCard
        plugin={basePlugin}
        associatedId="plugin-id-123"
        promotionBadge={badge}
        canPromote
        onEnable={noop}
        onEdit={noop}
        onPromote={noop}
      />,
    );
    expect(screen.queryByRole('button', { name: /Promote to code/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Retry' })).not.toBeInTheDocument();
  });

  it('renders a code-owned plugin read-only: no Promote, Discard, toggle, or Edit (ADR-017, #136)', () => {
    const badge: PromotionBadge = { kind: 'code-owned', ageMs: 60_000 };
    render(
      <PluginCard
        plugin={basePlugin}
        associatedId="plugin-id-123"
        promotionBadge={badge}
        canPromote
        onEnable={noop}
        onEdit={noop}
        onToggleEnabled={noop}
        onDiscardPromotion={noop}
      />,
    );

    expect(screen.queryByRole('button', { name: /Promote to code/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Discard promotion' })).not.toBeInTheDocument();
    expect(screen.queryByRole('checkbox')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Delete plugin' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /edit plugin configuration/i })).not.toBeInTheDocument();
    expect(screen.getByText(/Managed from the repository/)).toBeInTheDocument();
  });

  it('disables Promote with the no-adapter reason coming from the capabilities (#136)', () => {
    const badge: PromotionBadge = { kind: 'experimental', ageMs: 60_000 };
    render(
      <PluginCard
        plugin={basePlugin}
        associatedId="plugin-id-123"
        promotionBadge={badge}
        canPromote
        promoteDisabledReason="'request-size-limiting' has no promotion adapter; only correlation-id, rate-limiting can be promoted to code"
        onEnable={noop}
        onEdit={noop}
        onPromote={noop}
      />,
    );

    expect(screen.getByRole('button', { name: /Promote to code/i })).toBeDisabled();
    expect(screen.getByText(/has no promotion adapter/)).toBeInTheDocument();
  });

  it('shows Edit in code for a code-owned plugin only when the capability is on (issue #135)', () => {
    const badge: PromotionBadge = { kind: 'code-owned', ageMs: 60_000, editableInCode: true };
    const onEditInCode = jest.fn();
    render(
      <PluginCard
        plugin={basePlugin}
        associatedId="plugin-id-123"
        promotionBadge={badge}
        canPromote
        editInCodeEnabled
        onEnable={noop}
        onEdit={noop}
        onDiscardPromotion={noop}
        onEditInCode={onEditInCode}
      />,
    );

    expect(screen.getByRole('button', { name: 'Edit in code' })).toBeInTheDocument();
  });

  it('hides Edit in code for a code-owned plugin when the capability is off', () => {
    const badge: PromotionBadge = { kind: 'code-owned', ageMs: 60_000 };
    render(
      <PluginCard
        plugin={basePlugin}
        associatedId="plugin-id-123"
        promotionBadge={badge}
        canPromote
        onEnable={noop}
        onEdit={noop}
        onDiscardPromotion={noop}
        onEditInCode={noop}
      />,
    );

    expect(screen.queryByRole('button', { name: 'Edit in code' })).not.toBeInTheDocument();
  });

  it('hides Edit in code for a code-owned plugin the ingress controller does not manage (would 400)', () => {
    const badge: PromotionBadge = { kind: 'code-owned', ageMs: 60_000, editableInCode: false };
    render(
      <PluginCard
        plugin={basePlugin}
        associatedId="plugin-id-123"
        promotionBadge={badge}
        canPromote
        editInCodeEnabled
        onEnable={noop}
        onEdit={noop}
        onDiscardPromotion={noop}
        onEditInCode={noop}
      />,
    );

    expect(screen.queryByRole('button', { name: 'Edit in code' })).not.toBeInTheDocument();
  });

  it('calls onEditInCode with plugin id and name when Edit in code is clicked', async () => {
    const badge: PromotionBadge = { kind: 'code-owned', ageMs: 60_000, editableInCode: true };
    const onEditInCode = jest.fn();
    render(
      <PluginCard
        plugin={basePlugin}
        associatedId="plugin-id-123"
        promotionBadge={badge}
        canPromote
        editInCodeEnabled
        onEnable={noop}
        onEdit={noop}
        onDiscardPromotion={noop}
        onEditInCode={onEditInCode}
      />,
    );

    await userEvent.click(screen.getByRole('button', { name: 'Edit in code' }));
    expect(onEditInCode).toHaveBeenCalledWith('plugin-id-123', basePlugin.slug);
  });

  // --- Remove from code (issue #3) ---

  it('shows Remove from code for a code-owned KIC plugin when the capability is on', () => {
    const badge: PromotionBadge = { kind: 'code-owned', ageMs: 60_000, editableInCode: true };
    render(
      <PluginCard
        plugin={basePlugin}
        associatedId="plugin-id-123"
        promotionBadge={badge}
        canPromote
        editInCodeEnabled
        onEnable={noop}
        onEdit={noop}
        onEditInCode={noop}
        onDeleteInCode={noop}
      />,
    );

    expect(screen.getByRole('button', { name: 'Remove from code' })).toBeInTheDocument();
  });

  it('hides Remove from code for a code-owned plugin the ingress controller does not manage', () => {
    const badge: PromotionBadge = { kind: 'code-owned', ageMs: 60_000, editableInCode: false };
    render(
      <PluginCard
        plugin={basePlugin}
        associatedId="plugin-id-123"
        promotionBadge={badge}
        canPromote
        editInCodeEnabled
        onEnable={noop}
        onEdit={noop}
        onDeleteInCode={noop}
      />,
    );

    expect(screen.queryByRole('button', { name: 'Remove from code' })).not.toBeInTheDocument();
  });

  it('calls onDeleteInCode with plugin id and name when Remove from code is clicked', async () => {
    const badge: PromotionBadge = { kind: 'code-owned', ageMs: 60_000, editableInCode: true };
    const onDeleteInCode = jest.fn();
    render(
      <PluginCard
        plugin={basePlugin}
        associatedId="plugin-id-123"
        promotionBadge={badge}
        canPromote
        editInCodeEnabled
        onEnable={noop}
        onEdit={noop}
        onDeleteInCode={onDeleteInCode}
      />,
    );

    await userEvent.click(screen.getByRole('button', { name: 'Remove from code' }));
    expect(onDeleteInCode).toHaveBeenCalledWith('plugin-id-123', basePlugin.slug);
  });

  it('hides Edit in code once a code-only promotion is active (badge no longer code-owned)', () => {
    const badge: PromotionBadge = { kind: 'mr-open', ageMs: 60_000 };
    render(
      <PluginCard
        plugin={basePlugin}
        associatedId="plugin-id-123"
        promotionBadge={badge}
        canPromote
        editInCodeEnabled
        onEnable={noop}
        onEdit={noop}
        onDiscardPromotion={noop}
        onEditInCode={noop}
      />,
    );

    expect(screen.queryByRole('button', { name: 'Edit in code' })).not.toBeInTheDocument();
  });
});
