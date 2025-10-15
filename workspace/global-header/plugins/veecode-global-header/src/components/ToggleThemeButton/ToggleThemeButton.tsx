import { useTheme } from '@mui/material/styles';
import LightModeOutlinedIcon from '@mui/icons-material/LightModeOutlined';
import DarkModeOutlinedIcon from '@mui/icons-material/DarkModeOutlined';
import { appThemeApiRef, useApi } from '@backstage/core-plugin-api';
import { IconButtonComponent } from './IconButtonComponent';
import { useTranslation } from '../../hooks/useTranslation';

import type { CSSProperties } from 'react';

/**
 * @public
 */
export interface ToggleThemeProps {
  title?: string;
  tooltipLight?: string;
  tooltipDark?: string;
  layout?: CSSProperties;
}

export const ToggleThemeButton = ({ title, tooltipLight, tooltipDark, layout }: ToggleThemeProps)  => {
  const { t } = useTranslation();
  
  const displayTitle = title || t('toggleTheme.title');
  const displayTooltipLight = tooltipLight || t('toggleTheme.tooltipLight');
  const displayTooltipDark = tooltipDark || t('toggleTheme.tooltipDark');
  
  const appThemeApi = useApi(appThemeApiRef);
  const theme = useTheme();
  const isDarkMode = theme.palette.mode === 'dark';
  const tooltip = isDarkMode
    ? displayTooltipLight
    : displayTooltipDark
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
      title={tooltip}
      handleClick={handleSetTheme}
      color="inherit"
      label={displayTitle}
      layout={layout}
    >
      {isDarkMode ? <LightModeOutlinedIcon /> : <DarkModeOutlinedIcon />}
    </IconButtonComponent>
  );
};
