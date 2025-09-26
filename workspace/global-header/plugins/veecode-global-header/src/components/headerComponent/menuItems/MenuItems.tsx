import { ReactElement, useEffect } from 'react';
import HelpOutlineIcon from '@mui/icons-material/HelpOutline';
import SettingsIcon from '@mui/icons-material/Settings';
import Menu from '@mui/material/Menu';
import Box from '@mui/material/Box';
import { useUserProfile } from '@backstage/plugin-user-settings';
import Typography from '@mui/material/Typography';
import { Divider, ListItemIcon, MenuItem } from '@mui/material';
import { UserAvatar } from '../userAvatar/UserAvatar';
import { useApi } from '@backstage/core-plugin-api';
import { catalogApiRef } from '@backstage/plugin-catalog-react';
import { configApiRef } from '@backstage/core-plugin-api';
import { UserEntity } from '@backstage/catalog-model';
import { Link } from 'react-router-dom';
import { Logout } from '../logout/Logout';
import Chip from '@mui/material/Chip';
import { useTheme } from '@mui/material/styles';

interface MenuItemsProps {
  anchorEl: HTMLElement | null;
  menuId: string;
  isOpen: boolean;
  handleClose: () => void;
}

interface MenuItemProps {
  handleClose: () => void;
  link: string;
  children: ReactElement;
}

const MenuItemComponent: React.FC<MenuItemProps> = ({
  handleClose,
  link,
  children,
}) => {
  return (
    <MenuItem onClick={handleClose}>
      <Link to={link}>
        <Box
          component="div"
          sx={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'flex-start',
            padding: '.1rem 0',
          }}
        >
          {children}
        </Box>
      </Link>
    </MenuItem>
  );
};

export const MenuItems: React.FC<MenuItemsProps> = ({
  anchorEl,
  menuId,
  isOpen,
  handleClose,
}) => {
  const theme = useTheme();
  const { displayName, backstageIdentity } = useUserProfile();
  const catalogApi = useApi(catalogApiRef);
  const config = useApi(configApiRef);
  const supportUrl =
    config.app?.support?.url ??
    // config.getOptionalString('app.support.url') ??
    'https://github.com/orgs/veecode-platform/discussions';

  useEffect(() => {
    const fetchUserEntity = async () => {
      let userProfile;
      try {
        if (backstageIdentity?.userEntityRef) {
          userProfile = (await catalogApi.getEntityByRef(
            backstageIdentity.userEntityRef,
          )) as unknown as UserEntity;
        }
        return userProfile;
      } catch (_err) {
        return null;
      }
    };

    fetchUserEntity();
  }, [backstageIdentity, catalogApi]);

  const profileDisplayName = () => {
    const name = displayName;
    const regex = /^[^:/]+:[^/]+\/[^/]+$/;
    if (regex.test(name)) {
      return name
        .charAt(name.indexOf('/') + 1)
        .toLocaleUpperCase('en-US')
        .concat(name.substring(name.indexOf('/') + 2));
    }
    return name;
  };

  return (
    <Menu
      anchorEl={anchorEl}
      anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
      transformOrigin={{ vertical: 'top', horizontal: 'right' }}
      id={menuId}
      keepMounted
      open={isOpen}
      onClose={handleClose}
      slotProps={{
        paper: {
          sx: {
            width: 250,
            borderRadius: 2,
            mt: 0.8,
            mr: -0.5,
            boxShadow: 3,
            background: `${theme.palette.background.default} !important`,
            border: `1px solid ${theme.palette.grey[600]}`,
          },
        },
      }}
    >
      {/* Profile */}
      <Box
        sx={{ px: 2, py: 1.5, display: 'flex', alignItems: 'center', gap: 1.5 }}
      >
        <UserAvatar />
        <Box>
          <Typography variant="subtitle1">{profileDisplayName()}</Typography>
          <Chip
            size="small"
            variant="outlined"
            label={backstageIdentity?.ownershipEntityRefs[0].split('/')[1]}
          />
        </Box>
      </Box>

      <Divider />

      {/* Support */}
      <MenuItemComponent handleClose={handleClose} link={supportUrl}>
        <>
          <ListItemIcon>
            <HelpOutlineIcon fontSize="small" />
          </ListItemIcon>
          Help
        </>
      </MenuItemComponent>
      {/* Settings */}
      <MenuItemComponent handleClose={handleClose} link="/settings">
        <>
          <ListItemIcon>
            <SettingsIcon fontSize="small" />
          </ListItemIcon>
          Settings
        </>
      </MenuItemComponent>
      <Divider />

      {/* Logout */}
      <MenuItem>
        <Logout />
      </MenuItem>
    </Menu>
  );
};
