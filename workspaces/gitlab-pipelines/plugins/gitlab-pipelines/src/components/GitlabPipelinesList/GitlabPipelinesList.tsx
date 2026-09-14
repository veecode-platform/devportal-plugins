import { Grid } from '@material-ui/core';
import { PipelinesTable } from './PipelinesTable';
import { TeardownOperations } from './TeardownOperations';
import { GitlabPipelinesProvider } from '../../context';

export const GitlabPipelinesList = () => {

    return (
        <GitlabPipelinesProvider>
            <Grid container spacing={3} direction="column">
                <Grid item>
                    <PipelinesTable/>
                </Grid>
                <Grid item>
                    <TeardownOperations/>
                </Grid>
            </Grid>
        </GitlabPipelinesProvider>
    )
}
