import { InfoCard } from '@backstage/core-components';
import { Avatar, Grid, List, ListItem, ListItemAvatar, ListItemText } from '@mui/material';
import MailIcon from '@mui/icons-material/Mail';
import DescriptionIcon from '@mui/icons-material/Description';
import NearMeIcon from '@mui/icons-material/NearMe';
import ForumIcon from '@mui/icons-material/Forum';
import BusinessIcon from '@mui/icons-material/Business';

// TODO: re-enable license key validation

export const SupportTab = () => {
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
            {/** E-mail */}
            <a
              href="mailto:platform-sales@vee.codes"
              target="_blank"
              rel="noopener noreferrer"
            >
              <ListItem sx={{ padding: '1rem .5rem' }}>
                <ListItemAvatar>
                  <Avatar>
                    <MailIcon />
                  </Avatar>
                </ListItemAvatar>
                <ListItemText
                  primary="Email"
                  secondary={<>You can contact our sales team by e-mail <strong>platform-sales@vee.codes</strong></>}
                />
              </ListItem>
            </a>

            {/** Discord */}
            <a
              href="https://discord.gg/pREwxeVzAD"
              target="_blank"
              rel="noopener noreferrer"
            >
              <ListItem sx={{ padding: '1rem .5rem' }}>
                <ListItemAvatar>
                  <Avatar>
                    <ForumIcon />
                  </Avatar>
                </ListItemAvatar>
                <ListItemText
                  primary="Discord"
                  secondary="Become a member of our free community"
                />
              </ListItem>
            </a>

            {/** Documentation */}
            <a
              href="https://docs.platform.vee.codes/devportal/intro/"
              target="_blank"
              rel="noopener noreferrer"
            >
              <ListItem sx={{ padding: '1rem .5rem' }}>
                <ListItemAvatar>
                  <Avatar>
                    <DescriptionIcon />
                  </Avatar>
                </ListItemAvatar>
                <ListItemText
                  primary="Documentation"
                  secondary="Check our product documentation online."
                />
              </ListItem>
            </a>

            {/** Site */}
            <a
              href="https://platform.vee.codes/en/"
              target="_blank"
              rel="noopener noreferrer"
            >
              <ListItem sx={{ padding: '1rem .5rem' }}>
                <ListItemAvatar>
                  <Avatar>
                    <NearMeIcon />
                  </Avatar>
                </ListItemAvatar>
                <ListItemText
                  primary="Website"
                  secondary="Learn more about our plans and prices."
                />
              </ListItem>
            </a>

            {/** AWS */}
            <a
              href="https://aws.amazon.com/marketplace/seller-profile?id=seller-6k2v2qio4njt4&ref=dtl_prodview-aybwnwq4fx2ts"
              target="_blank"
              rel="noopener noreferrer"
            >
              <ListItem sx={{ padding: '1rem .5rem' }}>
                <ListItemAvatar>
                  <Avatar>
                    <BusinessIcon />
                  </Avatar>
                </ListItemAvatar>
                <ListItemText
                  primary="AWS Marketplace"
                  secondary="Check our product and service offerings for VeeCode Platform."
                />
              </ListItem>
            </a>
          </List>
        </InfoCard>
      </Grid>
    </Grid>
  );
}
