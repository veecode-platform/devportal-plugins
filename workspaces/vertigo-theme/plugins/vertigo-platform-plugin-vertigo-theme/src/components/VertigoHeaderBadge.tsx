import { useTheme } from '@mui/material/styles';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import { tokens } from '../themes/tokens';

/*
 * Vertigo header badge — a small brand pill injected into the global header via
 * the `global.header/component` mount point. Purpose of the spike: prove a
 * custom, non-Backstage component can be mounted into the shell and pick up the
 * Vertigo theme (it reads palette/text from useTheme, so it stays in sync with
 * light/dark). Deliberately dependency-light (MUI Box/Typography only) to keep
 * render risk near zero — there's no browser here to catch a runtime throw.
 */
export const VertigoHeaderBadge = () => {
  const theme = useTheme();
  return (
    <Box
      sx={{
        display: 'flex',
        alignItems: 'center',
        gap: 0.75,
        pl: 1,
        pr: 1.25,
        py: 0.5,
        borderRadius: 2,
        // The global header is dark chrome in BOTH themes, so the pill uses fixed
        // light-on-dark tones (not palette.divider/text.primary, which are dark in
        // light mode and would vanish on the chrome bar).
        border: `1px solid ${tokens.hairlineDark}`,
        userSelect: 'none',
      }}
    >
      <Box
        sx={{
          width: 7,
          height: 7,
          borderRadius: '50%',
          backgroundColor: theme.palette.primary.main,
        }}
      />
      <Typography
        component="span"
        sx={{
          fontFamily: '"Geist Sans", system-ui, sans-serif',
          fontWeight: 600,
          fontSize: 13,
          letterSpacing: '-0.01em',
          lineHeight: 1,
          color: tokens.brand.paper,
        }}
      >
        Vertigo
      </Typography>
    </Box>
  );
};
