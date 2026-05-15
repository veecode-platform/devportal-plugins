import { InfoCard, Progress } from '@backstage/core-components';
import { Avatar, Box, Chip, Grid, List, ListItem, ListItemAvatar, ListItemText } from '@mui/material';
import { Alert } from '@mui/material';
import { VeecodeLogoIcon } from './DevportalIcon';
import { BackstageLogoIcon } from './BackstageLogoIcon';
import { useInfo, useSpec } from '../../hooks';
import DescriptionIcon from '@mui/icons-material/Description';
import MemoryIcon from '@mui/icons-material/Memory';
import DeveloperBoardIcon from '@mui/icons-material/DeveloperBoard';

export const AboutTab = () => {
  const { about, loading, error } = useInfo();
  const { lastVersion } = useSpec();

  if (loading) {
    return <Progress />;
  } else if (error) {
    return <Alert severity="error">{error.message}</Alert>;
  }

  const textDevportalVersion = (): string => {
    return (about?.devportalVersion !== lastVersion)
      ? `Its current version is ${about?.devportalVersion}. Update to version ${lastVersion}`
      : `You are using the latest available version: ${about?.devportalVersion}`;
  }

  return (
    <Grid container direction="row" spacing={3}>
      <Grid item xs={12} md={12}>
        <InfoCard title="Details">
          <List sx={{
            display: 'flex',
            flexDirection: 'column',
            padding: 0,
            '& > :nth-of-type(odd)': {
              backgroundColor: 'background.default',
              borderRadius: '4px',
            },
          }}>
            {/**Devportal Version */}
            <ListItem sx={{ padding: '1rem .5rem' }}>
              <ListItemAvatar>
                <Avatar>
                  <VeecodeLogoIcon/>
                </Avatar>
              </ListItemAvatar>
              <Box sx={{ display: 'flex', alignItems: 'center' }}>
                <ListItemText
                  primary="Devportal Version"
                  secondary={textDevportalVersion()}
                />
                {about?.devportalVersion !== lastVersion && (
                  <Chip label="New" sx={{
                    height: '24px',
                    minWidth: '24px',
                    fontSize: '0.75rem',
                    backgroundColor: '#B8B344',
                    ml: 1,
                    alignSelf: 'flex-end',
                    transform: 'translateY(3px)',
                  }}/>
                )}
              </Box>
            </ListItem>

            {/** Operating Sistem */}
            <ListItem>
              <ListItemAvatar>
                <Avatar>
                  <DeveloperBoardIcon />
                </Avatar>
              </ListItemAvatar>
              <ListItemText
                primary="Operating System"
                secondary={about?.operatingSystem}
              />
            </ListItem>

            {/**Resource Utilization */}
            <ListItem>
              <ListItemAvatar>
                <Avatar>
                  <MemoryIcon />
                </Avatar>
              </ListItemAvatar>
              <ListItemText
                primary="Resource utilization"
                secondary={about?.resourceUtilization}
              />
            </ListItem>

            {/** Node Version */}
            <ListItem>
              <ListItemAvatar>
                <Avatar>
                  <DescriptionIcon />
                </Avatar>
              </ListItemAvatar>
              <ListItemText
                primary="NodeJS Version"
                secondary={about?.nodeJsVersion}
              />
            </ListItem>

            {/** Backstage Version */}
            <ListItem>
              <ListItemAvatar>
                <Avatar>
                  <BackstageLogoIcon />
                </Avatar>
              </ListItemAvatar>
              <ListItemText
                primary="Backstage Version"
                secondary={about?.backstageVersion}
              />
            </ListItem>
          </List>
        </InfoCard>
      </Grid>
    </Grid>
  );
}
