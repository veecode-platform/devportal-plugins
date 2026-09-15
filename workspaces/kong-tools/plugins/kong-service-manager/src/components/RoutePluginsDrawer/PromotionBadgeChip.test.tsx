import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { PromotionBadgeChip } from './PromotionBadgeChip';
import type { PromotionBadge } from './promotionBadge';

const ONE_DAY_MS = 24 * 60 * 60 * 1000;

describe('PromotionBadgeChip', () => {
  it('renders the experimental badge with age', () => {
    const badge: PromotionBadge = { kind: 'experimental', ageMs: 3 * ONE_DAY_MS };
    render(<PromotionBadgeChip badge={badge} />);
    expect(screen.getByText(/Experimental/)).toBeInTheDocument();
    expect(screen.getByText(/3d/)).toBeInTheDocument();
  });

  it('renders the code-owned badge read-only, with a tooltip and no link', async () => {
    const badge: PromotionBadge = { kind: 'code-owned', ageMs: ONE_DAY_MS };
    render(<PromotionBadgeChip badge={badge} />);
    expect(screen.getByText(/Code-owned/)).toBeInTheDocument();
    expect(screen.queryByRole('link')).not.toBeInTheDocument();

    await userEvent.hover(screen.getByText(/Code-owned/));
    expect(
      await screen.findByText("Defined in the service's chart; edit it there"),
    ).toBeInTheDocument();
  });

  it('renders the mr-open badge as a link to the MR', () => {
    const badge: PromotionBadge = {
      kind: 'mr-open',
      ageMs: ONE_DAY_MS,
      record: {
        id: 1,
        instance: 'default',
        serviceName: 'svc',
        routeId: 'route-1',
        pluginType: 'rate-limiting',
        state: 'mr-open',
        mrRef: 'https://gitlab.example.com/team/svc/-/merge_requests/1',
        requesterRef: 'user:default/alice',
        createdAt: '2026-09-13T12:00:00.000Z',
        updatedAt: '2026-09-13T12:00:00.000Z',
      },
    };
    render(<PromotionBadgeChip badge={badge} />);
    const link = screen.getByRole('link', { name: /Promoção aberta/ });
    expect(link).toHaveAttribute('href', badge.record!.mrRef);
  });

  it('renders the pending-deploy badge', () => {
    const badge: PromotionBadge = { kind: 'pending-deploy', ageMs: ONE_DAY_MS };
    render(<PromotionBadgeChip badge={badge} />);
    expect(screen.getByText(/Aplicando/)).toBeInTheDocument();
  });

  it('renders the codified badge as a link to the code when an MR ref is available', () => {
    const badge: PromotionBadge = {
      kind: 'codified',
      ageMs: ONE_DAY_MS,
      record: {
        id: 1,
        instance: 'default',
        serviceName: 'svc',
        routeId: 'route-1',
        pluginType: 'rate-limiting',
        state: 'codified',
        mrRef: 'https://gitlab.example.com/team/svc/-/merge_requests/1',
        requesterRef: 'user:default/alice',
        createdAt: '2026-09-13T12:00:00.000Z',
        updatedAt: '2026-09-13T12:00:00.000Z',
      },
    };
    render(<PromotionBadgeChip badge={badge} />);
    const link = screen.getByRole('link', { name: /Codificado/ });
    expect(link).toHaveAttribute('href', badge.record!.mrRef);
  });

  it('renders the failed-restored badge with a retry action', () => {
    const onRetry = jest.fn();
    const badge: PromotionBadge = { kind: 'failed-restored', ageMs: ONE_DAY_MS };
    render(<PromotionBadgeChip badge={badge} onRetry={onRetry} />);
    expect(screen.getByText(/Aplicação falhou/)).toBeInTheDocument();
    screen.getByRole('button', { name: 'Retry' }).click();
    expect(onRetry).toHaveBeenCalled();
  });

  it('does not offer a details toggle for a failure badge when no detail is present', () => {
    const badge: PromotionBadge = { kind: 'failed-restored', ageMs: ONE_DAY_MS };
    render(<PromotionBadgeChip badge={badge} />);
    expect(screen.queryByRole('button', { name: /Show details/i })).not.toBeInTheDocument();
  });

  it('surfaces the finalizer message of a `failed` record on hover and in the details toggle', async () => {
    const detail =
      "code-owned 'rate-limiting' plugin did not converge on route 'route-1' within 10 min; the experiment was removed at merge and is intentionally not restored.";
    const badge: PromotionBadge = {
      kind: 'failed-restored',
      ageMs: ONE_DAY_MS,
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
        detail,
      },
    };
    render(<PromotionBadgeChip badge={badge} />);

    await userEvent.hover(screen.getByText(/Aplicação falhou/));
    expect(await screen.findByText(detail)).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: /Show details/i }));
    expect(screen.getAllByText(detail).length).toBeGreaterThan(1);
  });

  it('shows a details toggle for failed-restored with detail, revealing the diff text on click', async () => {
    const badge: PromotionBadge = {
      kind: 'failed-restored',
      ageMs: ONE_DAY_MS,
      record: {
        id: 1,
        instance: 'default',
        serviceName: 'svc',
        routeId: 'route-1',
        pluginType: 'rate-limiting',
        state: 'failed-restored',
        mrRef: 'https://gitlab.example.com/team/svc/-/merge_requests/1',
        requesterRef: 'user:default/alice',
        createdAt: '2026-09-13T12:00:00.000Z',
        updatedAt: '2026-09-13T12:00:00.000Z',
        detail: '- minute: 60\n+ minute: 100\n',
      },
    };
    render(<PromotionBadgeChip badge={badge} />);

    expect(screen.queryByText(/minute: 100/)).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: /Show details/i }));
    expect(screen.getByText(/minute: 100/)).toBeInTheDocument();
  });
});
