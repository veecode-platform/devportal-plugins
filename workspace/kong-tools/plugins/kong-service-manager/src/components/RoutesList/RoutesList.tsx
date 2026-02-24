import { useEffect, useState } from 'react';
import {
  Box,
  Card,
  CardContent,
  CardHeader,
  Chip,
  IconButton,
  Skeleton,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Tooltip,
  Typography,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogContentText,
  DialogActions,
  Button,
} from '@mui/material';
import EditIcon from '@mui/icons-material/Edit';
import DeleteIcon from '@mui/icons-material/Delete';
import ExtensionIcon from '@mui/icons-material/Extension';
import { useKongServiceManager } from '../../context/KongServiceManagerContext';
import type { RouteResponse } from '@veecode-platform/backstage-plugin-kong-service-manager-common';

type RoutesListProps = {
  onEditRoute?: (route: RouteResponse) => void;
  onManagePlugins?: (route: RouteResponse) => void;
  onRouteDeleted?: () => void;
};

export function RoutesList({ onEditRoute, onManagePlugins, onRouteDeleted }: RoutesListProps) {
  const { state, fetchRoutes, removeRoute } = useKongServiceManager();
  const { routes, loading, instance, serviceName } = state;
  const [deleteTarget, setDeleteTarget] = useState<RouteResponse | null>(null);

  useEffect(() => {
    if (instance && serviceName) {
      fetchRoutes();
    }
  }, [instance, serviceName, fetchRoutes]);

  const handleDelete = async () => {
    if (deleteTarget) {
      try {
        await removeRoute(deleteTarget.id);
        setDeleteTarget(null);
        onRouteDeleted?.();
      } catch {
        setDeleteTarget(null);
      }
    }
  };

  if (loading && !routes) {
    return (
      <Card variant="outlined">
        <CardHeader title="Routes" />
        <CardContent>
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell>Name</TableCell>
                <TableCell>Protocols</TableCell>
                <TableCell>Methods</TableCell>
                <TableCell>Paths</TableCell>
                <TableCell>Hosts</TableCell>
                <TableCell align="right">Actions</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {Array.from({ length: 3 }).map((_, i) => (
                <TableRow key={i}>
                  {Array.from({ length: 6 }).map((__, j) => (
                    <TableCell key={j}>
                      <Skeleton variant="text" />
                    </TableCell>
                  ))}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    );
  }

  const routeData = routes?.data ?? [];

  return (
    <>
      <Card variant="outlined">
        <CardHeader
          title="Routes"
          subheader={`${routeData.length} route(s)`}
        />
        <CardContent>
          {routeData.length === 0 ? (
            <Typography color="text.secondary">
              No routes configured for this service.
            </Typography>
          ) : (
            <TableContainer>
              <Table size="small">
                <TableHead>
                  <TableRow>
                    <TableCell>Name</TableCell>
                    <TableCell>Protocols</TableCell>
                    <TableCell>Methods</TableCell>
                    <TableCell>Paths</TableCell>
                    <TableCell>Hosts</TableCell>
                    <TableCell align="right">Actions</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {routeData.map(route => (
                    <TableRow key={route.id}>
                      <TableCell>
                        <Typography variant="body2">
                          {route.name ?? route.id.slice(0, 8)}
                        </Typography>
                      </TableCell>
                      <TableCell>
                        <Box display="flex" gap={0.5} flexWrap="wrap">
                          {route.protocols.map(p => (
                            <Chip key={p} label={p} size="small" />
                          ))}
                        </Box>
                      </TableCell>
                      <TableCell>
                        <Box display="flex" gap={0.5} flexWrap="wrap">
                          {route.methods?.map(m => (
                            <Chip key={m} label={m} size="small" variant="outlined" />
                          )) ?? '-'}
                        </Box>
                      </TableCell>
                      <TableCell>
                        {route.paths?.join(', ') ?? '-'}
                      </TableCell>
                      <TableCell>
                        {route.hosts?.join(', ') ?? '-'}
                      </TableCell>
                      <TableCell align="right">
                        <Box display="flex" justifyContent="flex-end" gap={0.5}>
                          {onManagePlugins && (
                            <Tooltip title="Manage plugins">
                              <IconButton
                                size="small"
                                onClick={() => onManagePlugins(route)}
                              >
                                <ExtensionIcon fontSize="small" />
                              </IconButton>
                            </Tooltip>
                          )}
                          {onEditRoute && (
                            <Tooltip title="Edit route">
                              <IconButton
                                size="small"
                                onClick={() => onEditRoute(route)}
                              >
                                <EditIcon fontSize="small" />
                              </IconButton>
                            </Tooltip>
                          )}
                          <Tooltip title="Delete route">
                            <IconButton
                              size="small"
                              color="error"
                              onClick={() => setDeleteTarget(route)}
                            >
                              <DeleteIcon fontSize="small" />
                            </IconButton>
                          </Tooltip>
                        </Box>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableContainer>
          )}
        </CardContent>
      </Card>

      <Dialog open={!!deleteTarget} onClose={() => setDeleteTarget(null)}>
        <DialogTitle>Delete Route</DialogTitle>
        <DialogContent>
          <DialogContentText>
            Are you sure you want to delete route{' '}
            <strong>{deleteTarget?.name ?? deleteTarget?.id}</strong>? This
            action cannot be undone.
          </DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDeleteTarget(null)}>Cancel</Button>
          <Button onClick={handleDelete} color="error" variant="contained">
            Delete
          </Button>
        </DialogActions>
      </Dialog>
    </>
  );
}
