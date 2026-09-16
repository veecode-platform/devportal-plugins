import {
  Box,
  Button,
  Card,
  CardActions,
  CardContent,
  CardHeader,
  CircularProgress,
  IconButton,
  Tooltip,
  Typography,
} from '@mui/material';
import EditIcon from '@mui/icons-material/Edit';
import type { PluginCard as PluginCardType } from '@veecode-platform/backstage-plugin-kong-service-manager-common';
import { getPluginImage } from '../../assets/pluginImages';
import { PromotionBadgeChip } from '../RoutePluginsDrawer/PromotionBadgeChip';
import type { PromotionBadge } from '../RoutePluginsDrawer/promotionBadge';

type PluginCardProps = {
  plugin: PluginCardType;
  /** ID from associated plugins list, present when the plugin is enabled */
  associatedId?: string;
  disabling?: boolean;
  canEnable?: boolean;
  canDisable?: boolean;
  canEdit?: boolean;
  onEnable: (pluginSlug: string) => void;
  onEdit: (pluginId: string, pluginName: string) => void;
  onDisable: (pluginId: string, pluginName: string) => void;
  /** Promotion state (design 02 / plan P5) — omitted entirely outside route scope, where promotion doesn't apply. */
  promotionBadge?: PromotionBadge;
  canPromote?: boolean;
  /** Set when promotion is unavailable for a structural reason (e.g. no owning repo) — disables the action with this reason shown. */
  promoteDisabledReason?: string;
  discardingPromotion?: boolean;
  onPromote?: (pluginId: string, pluginName: string) => void;
  onDiscardPromotion?: (pluginId: string, pluginName: string) => void;
  /** `kong.promotion.editInCode` capability (issue #135) — gates the "Edit in code" action for a code-owned plugin. */
  editInCodeEnabled?: boolean;
  onEditInCode?: (pluginId: string, pluginName: string) => void;
};

export function PluginCard({
  plugin,
  associatedId,
  disabling,
  canEnable = true,
  canDisable = true,
  canEdit = true,
  onEnable,
  onEdit,
  onDisable,
  promotionBadge,
  canPromote = true,
  promoteDisabledReason,
  discardingPromotion,
  onPromote,
  onDiscardPromotion,
  editInCodeEnabled,
  onEditInCode,
}: PluginCardProps) {
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
  const showEditInCode = isAssociated && isCodeOwned && !!editInCodeEnabled && !!onEditInCode;

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
            <Tooltip title="Edit plugin configuration">
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
                {discardingPromotion ? <CircularProgress size={18} /> : 'Descartar promoção'}
              </Button>
            ) : (
              canDisable &&
              !isReadOnly && (
                <Button
                  variant="contained"
                  color="primary"
                  size="small"
                  disabled={disabling}
                  onClick={() => onDisable(associatedId, plugin.slug)}
                >
                  {disabling ? <CircularProgress size={18} /> : 'Disable'}
                </Button>
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
                    Promote to code
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
                    Edit in code
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
              Enable
            </Button>
          )
        )}
      </CardActions>
      {isReadOnly && !showEditInCode && (
        <Box px={1.5} pb={1.5} textAlign="center">
          <Typography variant="caption" color="text.secondary">
            Managed from the repository — change it in code.
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
