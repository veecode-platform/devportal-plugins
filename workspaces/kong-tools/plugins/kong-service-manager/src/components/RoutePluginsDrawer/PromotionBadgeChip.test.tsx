import { render, screen } from '@testing-library/react';
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
});
