// eslint-disable-next-line no-restricted-syntax
import * as React from 'react';
import AppBar from '@mui/material/AppBar';
import Box from '@mui/material/Box';
import Toolbar from '@mui/material/Toolbar';
import { ToogleTheme } from './toggleTheme/ToggleTheme';
import { SearchComponent } from './searchComponent/SearchComponent';
import { MenuItems } from './menuItems/MenuItems';
import { Notifications } from './notifications/Notifications';
import { Profile } from './profile/Profle';
import { useTheme } from '@mui/material/styles';

export const HeaderComponent = () => {
  const theme = useTheme();
  const [profileAnchorEl, setProfileAnchorEl] =
    React.useState<null | HTMLElement>(null);

  const isProfileMenuOpen = Boolean(profileAnchorEl);

  const handleProfileMenuOpen = (event: React.MouseEvent<HTMLElement>) => {
    setProfileAnchorEl(event.currentTarget);
  };

  const handleProfileMenuClose = () => {
    setProfileAnchorEl(null);
  };

  return (
    <Box sx={{ position: 'relative' }}>
      <AppBar
        position="sticky"
        component="nav"
        style={{ zIndex: theme.zIndex.appBar - 1 }}
      >
        <Toolbar>
          <SearchComponent />
          <Box sx={{ flexGrow: 1 }} />
          <Box
            sx={{
              display: {
                xs: 'none',
                md: 'flex',
                alignItems: 'center',
                gap: '.5rem',
              },
            }}
          >
            <Notifications />
            <ToogleTheme />
            <Profile handleOpenMenu={handleProfileMenuOpen} />
          </Box>
        </Toolbar>
      </AppBar>

      {/* Profile options */}
      <MenuItems
        anchorEl={profileAnchorEl}
        menuId="profile-menu"
        isOpen={isProfileMenuOpen}
        handleClose={handleProfileMenuClose}
      />
    </Box>
  );
};
