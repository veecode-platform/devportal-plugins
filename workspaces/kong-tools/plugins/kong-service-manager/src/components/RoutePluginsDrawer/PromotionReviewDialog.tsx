import { useEffect, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Typography,
} from '@mui/material';
import { useKongServiceManager } from '../../context/KongServiceManagerContext';
import type { PromotionPreview } from '@veecode-platform/backstage-plugin-kong-service-manager-common';

type PromotionReviewDialogProps = {
  open: boolean;
  pluginName: string;
  /** The plugin's live config, as read from Kong — shown immediately, before the preview resolves. */
  liveConfig: Record<string, unknown>;
  /** Needed to call the preview endpoint — null while there's nothing to preview yet (dialog closed). */
  routeId: string | null;
  pluginId: string | null;
  entityRef: string;
  onClose: () => void;
  onConfirm: () => void;
  submitting?: boolean;
  /** Error from a failed promote attempt (post-confirm) — distinct from a preview failure. */
  error?: string | null;
};

function PreviewFiles({ files }: { files: PromotionPreview['files'] }) {
  return (
    <>
      {files.map(file => (
        <Box key={file.path} sx={{ mb: 1.5 }}>
          <Typography variant="caption" color="text.secondary" sx={{ fontFamily: 'monospace' }}>
            {file.path}
          </Typography>
          <Box
            component="pre"
            sx={{
              bgcolor: 'background.default',
              p: 1.5,
              borderRadius: 1,
              overflow: 'auto',
              fontSize: '0.8rem',
              m: 0,
            }}
          >
            {file.content}
          </Box>
        </Box>
      ))}
    </>
  );
}

/**
 * Review step shown before promote does anything (design 02): the live
 * config, a dry-run preview of the generated chart files, and a one-line
 * explanation of the mechanics. The preview is a real dry-run against the
 * backend (POST .../promote/preview, no side effects) — not a client-side
 * reconstruction, so it never drifts from what `renderCheck` actually
 * verifies at promote time.
 */
export function PromotionReviewDialog({
  open,
  pluginName,
  liveConfig,
  routeId,
  pluginId,
  entityRef,
  onClose,
  onConfirm,
  submitting = false,
  error,
}: PromotionReviewDialogProps) {
  const { previewPromotion } = useKongServiceManager();
  const [preview, setPreview] = useState<PromotionPreview | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewError, setPreviewError] = useState<string | null>(null);

  useEffect(() => {
    if (!open || !routeId || !pluginId) {
      setPreview(null);
      setPreviewError(null);
      return;
    }
    let cancelled = false;
    setPreview(null);
    setPreviewError(null);
    setPreviewLoading(true);
    previewPromotion(routeId, pluginId, entityRef)
      .then(result => {
        if (!cancelled) setPreview(result);
      })
      .catch((e: unknown) => {
        if (!cancelled) setPreviewError(e instanceof Error ? e.message : String(e));
      })
      .finally(() => {
        if (!cancelled) setPreviewLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [open, routeId, pluginId, entityRef, previewPromotion]);

  const confirmDisabled = submitting || previewLoading || !!previewError;

  return (
    <Dialog open={open} onClose={submitting ? undefined : onClose} maxWidth="sm" fullWidth>
      <DialogTitle>Promote {pluginName} to code</DialogTitle>
      <DialogContent>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
          This opens a merge request in the service&apos;s repository with the
          equivalent chart configuration. Once it merges and deploys, the
          portal verifies the code-owned plugin and removes this experiment.
        </Typography>

        <Typography variant="subtitle2" sx={{ mb: 1 }}>
          Live config
        </Typography>
        <Box
          component="pre"
          sx={{
            bgcolor: 'background.default',
            p: 1.5,
            borderRadius: 1,
            overflow: 'auto',
            fontSize: '0.8rem',
            m: 0,
            mb: 2,
          }}
        >
          {JSON.stringify(liveConfig, null, 2)}
        </Box>

        <Typography variant="subtitle2" sx={{ mb: 1 }}>
          Generated chart
        </Typography>
        {previewLoading && (
          <Box display="flex" alignItems="center" gap={1} py={1}>
            <CircularProgress size={18} />
            <Typography variant="body2" color="text.secondary">
              Generating preview...
            </Typography>
          </Box>
        )}
        {previewError && (
          <Alert severity="error" sx={{ mb: 2 }}>
            {previewError}
          </Alert>
        )}
        {preview && <PreviewFiles files={preview.files} />}

        {error && (
          <Alert severity="error" sx={{ mt: 2 }}>
            {error}
          </Alert>
        )}
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} disabled={submitting}>
          Cancel
        </Button>
        <Button
          variant="contained"
          onClick={onConfirm}
          disabled={confirmDisabled}
          aria-label="Promote to code"
        >
          {submitting ? <CircularProgress size={18} /> : 'Promote to code'}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
