import {
  Box,
  Button,
  Card,
  CardActions,
  CardContent,
  CardHeader,
  CircularProgress,
  FormControlLabel,
  IconButton,
  Switch,
  Tooltip,
  Typography,
} from '@mui/material';
import EditIcon from '@mui/icons-material/Edit';
import type { PluginCard as PluginCardType } from '@veecode-platform/backstage-plugin-kong-service-manager-common';
import { getPluginImage } from '../../assets/pluginImages';
import { PromotionBadgeChip } from '../RoutePluginsDrawer/PromotionBadgeChip';
import type { PromotionBadge } from '../RoutePluginsDrawer/promotionBadge';
import { useTranslation } from '../../hooks/useTranslation';

type PluginCardProps = {
  plugin: PluginCardType;
  /** ID from associated plugins list, present when the plugin is attached to the gateway */
  associatedId?: string;
  /** The attached plugin's live `enabled` flag — drives the on/off toggle and its label. */
  enabled?: boolean;
  canEnable?: boolean;
  canEdit?: boolean;
  onEnable: (pluginSlug: string) => void;
  onEdit: (pluginId: string, pluginName: string) => void;
  /** Toggle the plugin's `enabled` flag in the gateway (PATCH) — "disable" is toggling it off; the plugin stays attached. Portal-managed plugins only. */
  canToggleEnabled?: boolean;
  togglingEnabled?: boolean;
  onToggleEnabled?: (pluginId: string, pluginName: string, nextEnabled: boolean) => void;
  /** Promotion state (design 02 / plan P5) — omitted entirely outside route scope, where promotion doesn't apply. */
  promotionBadge?: PromotionBadge;
  canPromote?: boolean;
  /** Set when promotion is unavailable for a structural reason (e.g. no owning repo) — disables the action with this reason shown. */
  promoteDisabledReason?: string;
  discardingPromotion?: boolean;
  onPromote?: (pluginId: string, pluginName: string) => void;
  onDiscardPromotion?: (pluginId: string, pluginName: string) => void;
  /** `kong.promotion.editInCode` capability (issue #135) — gates the "Edit in code" and "Remove from code" actions for a code-owned plugin. */
  editInCodeEnabled?: boolean;
  onEditInCode?: (pluginId: string, pluginName: string) => void;
  /** Delete-in-code (issue #3): remove a code-owned plugin from the chart via an MR. Gated like edit-in-code (KIC-managed + capability on). */
  onDeleteInCode?: (pluginId: string, pluginName: string) => void;
};

export function PluginCard({
  plugin,
  associatedId,
  enabled = true,
  canEnable = true,
  canEdit = true,
  onEnable,
  onEdit,
  canToggleEnabled = true,
  togglingEnabled,
  onToggleEnabled,
  promotionBadge,
  canPromote = true,
  promoteDisabledReason,
  discardingPromotion,
  onPromote,
  onDiscardPromotion,
  editInCodeEnabled,
  onEditInCode,
  onDeleteInCode,
}: PluginCardProps) {
  const { t } = useTranslation();
  const isAssociated = !!associatedId;
  // Frozen (open MR / applying) blocks portal edits server-side (409); codified is terminal and read-only.
  const isFrozen = promotionBadge?.kind === 'mr-open' || promotionBadge?.kind === 'pending-deploy';
  const isCodified = promotionBadge?.kind === 'codified';
  // Code-owned (ADR-017): the plugin was never portal-created, so it never
  // has a promotion to start or discard. Read-only like codified (#136):
  // editing or disabling it through the Admin API is drift the ingress
  // controller reverts on its next push — change it in the repository, or,
  // when kong.promotion.editInCode is on, through the Edit-in-code action
  // (issue #135). While a code-only promotion is active the badge reads
  // mr-open/pending-deploy instead (active records win over ownership), so
  // this only matches a code-owned plugin with no open edit.
  const isCodeOwned = promotionBadge?.kind === 'code-owned';
  const isReadOnly = isCodified || isCodeOwned;
  // Failed handover (ADR-020): the experiment was removed at merge and the
  // chart already carries the plugin — there is nothing left to promote.
  const isFailedHandover = promotionBadge?.record?.state === 'failed';
  const showPromote =
    isAssociated && !!promotionBadge && !isFrozen && !isCodified && !isCodeOwned && !isFailedHandover;
  const showDiscard = isAssociated && isFrozen && !isCodeOwned;
  // Edit-in-code only reaches a KIC-managed plugin (the badge carries this from
  // the plugin's tags): a code-owned plugin the ingress controller does not
  // manage would 400 on the backend's W1 gate, so hide the button rather than
  // offer a dead click (issue #135, edit-in-code ships on by default).
  const showEditInCode =
    isAssociated && isCodeOwned && !!promotionBadge?.editableInCode && !!editInCodeEnabled && !!onEditInCode;
  // Remove-from-code (issue #3): same gate as edit-in-code — a code-owned,
  // KIC-managed plugin with the capability on. The backend refuses a demote of
  // a non-KIC plugin, so hide the button rather than offer a dead click.
  const showDeleteInCode =
    isAssociated && isCodeOwned && !!promotionBadge?.editableInCode && !!editInCodeEnabled && !!onDeleteInCode && canPromote;

  return (
    <Card
      variant="outlined"
      sx={{
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'space-between',
        minHeight: '100%',
        borderRadius: '8px',
      }}
    >
      <CardHeader
        title={
          <Typography variant="subtitle1" color="primary" fontWeight={600}>
            {plugin.name}
          </Typography>
        }
        action={
          isAssociated && canEdit && !isReadOnly && !isFrozen ? (
            <Tooltip title={t('pluginCard.editTooltip')}>
              <IconButton
                size="small"
                onClick={() => onEdit(associatedId, plugin.slug)}
              >
                <EditIcon fontSize="small" />
              </IconButton>
            </Tooltip>
          ) : undefined
        }
      />

      {promotionBadge && (
        <Box display="flex" justifyContent="center" px={1.5} pb={0.5}>
          <PromotionBadgeChip
            badge={promotionBadge}
            onRetry={onPromote ? () => onPromote(associatedId!, plugin.slug) : undefined}
          />
        </Box>
      )}

      <Box display="flex" justifyContent="center" py={1}>
        <Box
          component="img"
          src={getPluginImage(plugin.slug)}
          alt={plugin.name}
          sx={{
            width: 60,
            height: 60,
            borderRadius: '4px',
            objectFit: 'contain',
            filter: isAssociated ? 'none' : 'grayscale(100%)',
            opacity: isAssociated ? 1 : 0.4,
          }}
        />
      </Box>

      <CardContent sx={{ flexGrow: 1, textAlign: 'center' }}>
        <Typography variant="body2" color="text.secondary">
          {plugin.description || plugin.slug}
        </Typography>
      </CardContent>

      <CardActions sx={{ justifyContent: 'center', gap: 1, pb: 2, flexWrap: 'wrap' }}>
        {isAssociated ? (
          <>
            {showDiscard ? (
              <Button
                variant="outlined"
                color="secondary"
                size="small"
                disabled={discardingPromotion}
                onClick={() => onDiscardPromotion?.(associatedId, plugin.slug)}
              >
                {discardingPromotion ? <CircularProgress size={18} /> : t('pluginCard.discardPromotion')}
              </Button>
            ) : (
              !isReadOnly &&
              canToggleEnabled &&
              onToggleEnabled && (
                <FormControlLabel
                  sx={{ mr: 0 }}
                  control={
                    <Switch
                      size="small"
                      color="primary"
                      checked={enabled}
                      disabled={togglingEnabled}
                      onChange={e =>
                        onToggleEnabled(associatedId, plugin.slug, e.target.checked)
                      }
                    />
                  }
                  label={
                    <Typography variant="body2" color="text.secondary">
                      {enabled
                        ? t('pluginCard.enabledLabel')
                        : t('pluginCard.disabledLabel')}
                    </Typography>
                  }
                />
              )
            )}
            {showPromote && (
              <Tooltip title={promoteDisabledReason ?? ''}>
                <span>
                  <Button
                    variant="outlined"
                    color="primary"
                    size="small"
                    disabled={!canPromote || !!promoteDisabledReason}
                    onClick={() => onPromote?.(associatedId, plugin.slug)}
                  >
                    {t('pluginCard.promoteToCode')}
                  </Button>
                </span>
              </Tooltip>
            )}
            {showEditInCode && (
              <Tooltip title={promoteDisabledReason ?? ''}>
                <span>
                  <Button
                    variant="outlined"
                    color="primary"
                    size="small"
                    disabled={!canPromote || !!promoteDisabledReason}
                    onClick={() => onEditInCode?.(associatedId, plugin.slug)}
                  >
                    {t('pluginCard.editInCode')}
                  </Button>
                </span>
              </Tooltip>
            )}
            {showDeleteInCode && (
              <Tooltip title={t('pluginCard.deleteInCodeTooltip')}>
                <span>
                  <Button
                    variant="outlined"
                    color="error"
                    size="small"
                    disabled={!!promoteDisabledReason}
                    onClick={() => onDeleteInCode?.(associatedId, plugin.slug)}
                  >
                    {t('pluginCard.deleteInCode')}
                  </Button>
                </span>
              </Tooltip>
            )}
          </>
        ) : (
          canEnable && (
            <Button
              variant="outlined"
              color="primary"
              size="small"
              onClick={() => onEnable(plugin.slug)}
            >
              {t('pluginCard.enable')}
            </Button>
          )
        )}
      </CardActions>
      {isReadOnly && !showEditInCode && (
        <Box px={1.5} pb={1.5} textAlign="center">
          <Typography variant="caption" color="text.secondary">
            {t('pluginCard.managedFromRepository')}
          </Typography>
        </Box>
      )}
      {(showPromote || showEditInCode) && promoteDisabledReason && (
        <Box px={1.5} pb={1.5} textAlign="center">
          <Typography variant="caption" color="text.secondary">
            {promoteDisabledReason}
          </Typography>
        </Box>
      )}

    </Card>
  );
}
