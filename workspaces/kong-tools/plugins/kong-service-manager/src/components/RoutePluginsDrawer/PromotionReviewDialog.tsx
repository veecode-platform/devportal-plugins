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

type PromotionReviewDialogProps = {
  open: boolean;
  pluginName: string;
  /** The plugin's live config, as read from Kong — the only artifact available before promote (design 02, review step). */
  liveConfig: Record<string, unknown>;
  onClose: () => void;
  onConfirm: () => void;
  submitting?: boolean;
  error?: string | null;
};

/**
 * Review step shown before promote does anything (design 02): the live
 * config and a one-line explanation of the mechanics. The backend only
 * generates the chart YAML as part of the promote call itself (P3 has no
 * dry-run endpoint), so this intentionally does not show a generated-YAML
 * diff — showing YAML the backend hasn't produced would drift from what
 * `renderCheck` actually verifies.
 */
export function PromotionReviewDialog({
  open,
  pluginName,
  liveConfig,
  onClose,
  onConfirm,
  submitting = false,
  error,
}: PromotionReviewDialogProps) {
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
          }}
        >
          {JSON.stringify(liveConfig, null, 2)}
        </Box>

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
          disabled={submitting}
          aria-label="Promote to code"
        >
          {submitting ? <CircularProgress size={18} /> : 'Promote to code'}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
