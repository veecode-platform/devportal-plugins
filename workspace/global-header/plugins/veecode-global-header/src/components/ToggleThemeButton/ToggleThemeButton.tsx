import { useTheme } from '@mui/material/styles';
import LightModeOutlinedIcon from '@mui/icons-material/LightModeOutlined';
import DarkModeOutlinedIcon from '@mui/icons-material/DarkModeOutlined';
import { appThemeApiRef, useApi } from '@backstage/core-plugin-api';
import { IconButtonComponent } from './IconButtonComponent';

import type { CSSProperties } from 'react';

/**
 * @public
 */
export interface ToggleThemeProps {
  layout?: CSSProperties;
}

export const ToggleThemeButton = ({ layout }: ToggleThemeProps)  => {
  console.log('ToggleTheme rendering started');
  const appThemeApi = useApi(appThemeApiRef);
  const theme = useTheme();
  const isDarkMode = theme.palette.mode === 'dark';
  const tooltipTitle = isDarkMode
    ? 'Select theme Light Theme'
    : 'Select theme Dark Theme';
  const themeIds = appThemeApi.getInstalledThemes();

  const handleSetTheme = (
    e: React.MouseEvent<HTMLButtonElement, MouseEvent>,
  ) => {
    const newThemeId = isDarkMode ? 'light' : 'dark';
    e.preventDefault();
    e.stopPropagation();
    if (themeIds.some(it => it.id === newThemeId)) {
      appThemeApi.setActiveThemeId(newThemeId);
    } else {
      appThemeApi.setActiveThemeId(undefined);
    }
  };

  return (
    <IconButtonComponent
      title={tooltipTitle}
      handleClick={handleSetTheme}
      color="inherit"
      label="Toggle-theme"
      layout={layout}
    >
      {isDarkMode ? <LightModeOutlinedIcon /> : <DarkModeOutlinedIcon />}
    </IconButtonComponent>
  );
};
