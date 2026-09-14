import { makeStyles } from '@material-ui/core';

export const useTeardownOperationsStyles = makeStyles(theme => ({
  title: {
    paddingLeft: '2rem',
    fontSize: '1.5rem',
  },
  state: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'flex-start',
    gap: '.7rem',
  },
  sha: {
    fontFamily: 'monospace',
    color: theme.palette.text.secondary,
  },
}));
