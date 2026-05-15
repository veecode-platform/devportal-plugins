import { Grid } from '@material-ui/core';
import { DummyCard } from '../DummyCard';

export const DummyContent = () => {
  return (
    <Grid container spacing={3}>
      <Grid item xs={12}>
        <DummyCard />
      </Grid>
    </Grid>
  );
};
