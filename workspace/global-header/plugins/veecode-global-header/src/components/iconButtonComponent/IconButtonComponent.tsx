import React from 'react';
import IconButton from '@mui/material/IconButton';
import Tooltip from '@mui/material/Tooltip';
import { Link } from 'react-router-dom';
import { ReactElement, MouseEvent } from 'react';

interface IconButtonProps {
  title: string;
  size: 'small' | 'medium' | 'large';
  tooltip: string;
  color: 'warning' | 'error' | 'inherit';
  handleClick?: (e: MouseEvent<HTMLButtonElement>) => void;
  link?: string;
  children: ReactElement;
}

export const IconButtonComponent: React.FC<IconButtonProps> = ({
  title,
  size,
  tooltip,
  color,
  handleClick,
  link,
  children,
}) => {
  const button = (
    <IconButton
      size={size}
      aria-label={title}
      color={color}
      aria-controls={`${title}-menu`}
      aria-haspopup="true"
      sx={{
        width: '42px',
        height: '42px',
        borderRadius: '50%',
      }}
      onClick={handleClick}
    >
      {children}
    </IconButton>
  );

  return (
    <Tooltip title={tooltip}>
      {link ? <Link to={link}>{button}</Link> : button}
    </Tooltip>
  );
};
