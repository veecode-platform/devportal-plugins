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
import { useTranslation } from '../../hooks/useTranslation';
import type { PromotionPreview } from '@veecode-platform/backstage-plugin-kong-service-manager-common';

type CodeRemovalDialogProps = {
  open: boolean;
  pluginName: string;
  routeId: string | null;
  pluginId: string | null;
  entityRef: string;
  onClose: () => void;
  onConfirm: () => void;
  submitting?: boolean;
  /** Error from a failed demote attempt (post-confirm) — distinct from a preview failure. */
  error?: string | null;
};

/**
 * Review step for delete-in-code (issue #3), the negative of
 * {@link PromotionReviewDialog}: a real dry-run (POST .../demote/preview, no
 * side effects) shows the chart file(s) the merge request would remove, and a
 * hand-modified template surfaces here as a preview error so the removal is
 * refused before opening an MR.
 */
export function CodeRemovalDialog({
  open,
  pluginName,
  routeId,
  pluginId,
  entityRef,
  onClose,
  onConfirm,
  submitting = false,
  error,
}: CodeRemovalDialogProps) {
  const { t } = useTranslation();
  const { previewDemotion } = useKongServiceManager();
  const [preview, setPreview] = useState<PromotionPreview | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewError, setPreviewError] = useState<string | null>(null);

  useEffect(() => {
    if (!open || !routeId || !pluginId) {
      setPreview(null);
      setPreviewError(null);
      return undefined;
    }
    let cancelled = false;
    setPreview(null);
    setPreviewError(null);
    setPreviewLoading(true);
    previewDemotion(routeId, pluginId, entityRef)
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
  }, [open, routeId, pluginId, entityRef, previewDemotion]);

  const confirmDisabled = submitting || previewLoading || !!previewError;

  return (
    <Dialog open={open} onClose={submitting ? undefined : onClose} maxWidth="sm" fullWidth>
      <DialogTitle>{t('codeRemovalDialog.title', { pluginName })}</DialogTitle>
      <DialogContent>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
          {t('codeRemovalDialog.description')}
        </Typography>

        <Typography variant="subtitle2" sx={{ mb: 1 }}>
          {t('codeRemovalDialog.filesRemoved')}
        </Typography>
        {previewLoading && (
          <Box display="flex" alignItems="center" gap={1} py={1}>
            <CircularProgress size={18} />
            <Typography variant="body2" color="text.secondary">
              {t('codeRemovalDialog.generatingPreview')}
            </Typography>
          </Box>
        )}
        {previewError && (
          <Alert severity="error" sx={{ mb: 2 }}>
            {previewError}
          </Alert>
        )}
        {preview &&
          preview.files.map(file => (
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

        {error && (
          <Alert severity="error" sx={{ mt: 2 }}>
            {error}
          </Alert>
        )}
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} disabled={submitting}>
          {t('codeRemovalDialog.cancel')}
        </Button>
        <Button
          variant="contained"
          color="error"
          onClick={onConfirm}
          disabled={confirmDisabled}
          aria-label={t('codeRemovalDialog.confirm')}
        >
          {submitting ? <CircularProgress size={18} /> : t('codeRemovalDialog.confirm')}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
