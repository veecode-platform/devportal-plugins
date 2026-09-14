import { Box, Button, Chip, Link } from '@mui/material';
import type { PromotionBadge } from './promotionBadge';

/** Formats an age in milliseconds as a short, human-scale duration (design 02: every badge shows age). */
function formatAge(ageMs: number): string {
  const minutes = Math.floor(ageMs / 60_000);
  if (minutes < 60) return `${Math.max(minutes, 0)}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h`;
  const days = Math.floor(hours / 24);
  return `${days}d`;
}

const KIND_META: Record<
  PromotionBadge['kind'],
  { emoji: string; label: string; color: 'default' | 'primary' | 'warning' | 'success' | 'info' }
> = {
  experimental: { emoji: '🧪', label: 'Experimental', color: 'default' },
  'mr-open': { emoji: '🔀', label: 'Promoção aberta', color: 'info' },
  'pending-deploy': { emoji: '⏳', label: 'Aplicando', color: 'primary' },
  codified: { emoji: '✅', label: 'Codificado', color: 'success' },
  'failed-restored': { emoji: '⚠️', label: 'Aplicação falhou', color: 'warning' },
};

type PromotionBadgeChipProps = {
  badge: PromotionBadge;
  /** Only used for the ⚠️ failed-restored badge — retries the promotion from scratch. */
  onRetry?: () => void;
};

export function PromotionBadgeChip({ badge, onRetry }: PromotionBadgeChipProps) {
  const meta = KIND_META[badge.kind];
  const label = `${meta.emoji} ${meta.label} · ${formatAge(badge.ageMs)}`;

  // 🔀 links to the MR; ✅ links to the code — same field (mrRef) is the
  // only pointer the DTO carries into the merged repo today.
  const href =
    (badge.kind === 'mr-open' || badge.kind === 'codified') && badge.record?.mrRef
      ? badge.record.mrRef
      : undefined;

  return (
    <Box display="flex" alignItems="center" gap={1}>
      {href ? (
        <Link href={href} target="_blank" rel="noopener noreferrer" underline="hover">
          <Chip label={label} size="small" color={meta.color} clickable component="span" />
        </Link>
      ) : (
        <Chip label={label} size="small" color={meta.color} />
      )}
      {badge.kind === 'failed-restored' && onRetry && (
        <Button size="small" variant="outlined" color="warning" onClick={onRetry}>
          Retry
        </Button>
      )}
    </Box>
  );
}
