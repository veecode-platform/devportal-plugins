import Grid from '@mui/material/Grid';

export type SignInPageClassKey = 'container' | 'item';

export const GridItem = ({ children }: { children: JSX.Element }) => {
    return (
        <Grid
            component="li"
            item
            sx={{
                display: 'flex',
                flexDirection: 'column',
                width: '100%',
                maxWidth: '400px',
                margin: 0,
                padding: 0,
            }}
        >
            {children}
        </Grid>
    );
};
