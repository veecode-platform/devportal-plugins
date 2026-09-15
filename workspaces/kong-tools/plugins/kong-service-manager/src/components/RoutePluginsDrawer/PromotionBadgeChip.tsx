import { useState } from 'react';
import { Box, Button, Chip, Link, Tooltip } from '@mui/material';
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
  { emoji: string; label: string; color: 'default' | 'primary' | 'warning' | 'success' | 'info'; tooltip?: string }
> = {
  experimental: { emoji: '🧪', label: 'Experimental', color: 'default' },
  'code-owned': {
    emoji: '✅',
    label: 'Code-owned',
    color: 'default',
    tooltip: "Defined in the service's chart; edit it there",
  },
  'mr-open': { emoji: '🔀', label: 'Promoção aberta', color: 'info' },
  'pending-deploy': { emoji: '⏳', label: 'Aplicando', color: 'primary' },
  codified: { emoji: '✅', label: 'Codificado', color: 'success' },
  // Both backend failure states land here — `failed` (ADR-020) and the
  // legacy `failed-restored`.
  'failed-restored': { emoji: '⚠️', label: 'Aplicação falhou', color: 'warning' },
};

type PromotionBadgeChipProps = {
  badge: PromotionBadge;
  /** Only used for the ⚠️ failure badge — retries the promotion from scratch. */
  onRetry?: () => void;
};

export function PromotionBadgeChip({ badge, onRetry }: PromotionBadgeChipProps) {
  const [diffOpen, setDiffOpen] = useState(false);
  const meta = KIND_META[badge.kind];
  const label = `${meta.emoji} ${meta.label} · ${formatAge(badge.ageMs)}`;

  // 🔀 links to the MR; ✅ links to the code — same field (mrRef) is the
  // only pointer the DTO carries into the merged repo today.
  const href =
    (badge.kind === 'mr-open' || badge.kind === 'codified') && badge.record?.mrRef
      ? badge.record.mrRef
      : undefined;

  // `detail` only ever arrives on a failure record (backend never sends it
  // for any other state): the finalizer's config diff for the legacy
  // `failed-restored`, or its actionable message for `failed` (ADR-020).
  const diff = badge.kind === 'failed-restored' ? badge.record?.detail : undefined;
  const tooltip = meta.tooltip ?? diff;

  return (
    <Box display="flex" flexDirection="column" gap={0.5}>
      <Box display="flex" alignItems="center" gap={1}>
        {href ? (
          <Link href={href} target="_blank" rel="noopener noreferrer" underline="hover">
            <Chip label={label} size="small" color={meta.color} clickable component="span" />
          </Link>
        ) : tooltip ? (
          <Tooltip title={tooltip}>
            <Chip label={label} size="small" color={meta.color} />
          </Tooltip>
        ) : (
          <Chip label={label} size="small" color={meta.color} />
        )}
        {/* Retry re-runs promote on the live experiment. After a `failed` handover
            (ADR-020) there is no experiment any more — the route already carries the
            code-owned plugin — so retrying would 404, or worse promote the controller's
            plugin on an instance with no ownership gate. Recovery is the human path
            the detail describes: fix the chart or revert the merge request. */}
        {badge.kind === 'failed-restored' && badge.record?.state !== 'failed' && onRetry && (
          <Button size="small" variant="outlined" color="warning" onClick={onRetry}>
            Retry
          </Button>
        )}
        {diff && (
          <Button size="small" onClick={() => setDiffOpen(o => !o)}>
            {diffOpen ? 'Hide details' : 'Show details'}
          </Button>
        )}
      </Box>
      {diff && diffOpen && (
        <Box
          component="pre"
          sx={{
            bgcolor: 'background.default',
            p: 1,
            borderRadius: 1,
            overflow: 'auto',
            fontSize: '0.75rem',
            m: 0,
          }}
        >
          {diff}
        </Box>
      )}
    </Box>
  );
}
