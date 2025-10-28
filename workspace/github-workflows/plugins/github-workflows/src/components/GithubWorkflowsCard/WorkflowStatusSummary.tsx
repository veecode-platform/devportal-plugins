import { FC } from 'react';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import { makeStyles } from '@mui/styles';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import CancelIcon from '@mui/icons-material/Cancel';
import ErrorIcon from '@mui/icons-material/Error';
import PendingIcon from '@mui/icons-material/Pending';
import { WorkflowResultsProps } from '../../utils/types';
import { StatusWorkflowEnum } from '../../utils/enums/WorkflowListEnum';

const useStyles = makeStyles((theme: any) => ({
  summaryContainer: {
    display: 'flex',
    gap: theme.spacing(3),
    padding: theme.spacing(2, 0),
    flexWrap: 'wrap',
  },
  statusItem: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    minWidth: 80,
  },
  statusCount: {
    fontSize: '2rem',
    fontWeight: 'bold',
    lineHeight: 1.2,
  },
  statusLabel: {
    fontSize: '0.75rem',
    marginTop: theme.spacing(0.5),
    textTransform: 'uppercase',
    letterSpacing: '0.5px',
  },
  success: {
    color: theme.palette.success.main,
  },
  failure: {
    color: theme.palette.error.main,
  },
  cancelled: {
    color: theme.palette.warning.main,
  },
  inProgress: {
    color: theme.palette.info.main,
  },
  neutral: {
    color: theme.palette.text.secondary,
  },
}));

interface WorkflowStatusSummaryProps {
  workflows: WorkflowResultsProps[];
}

export const WorkflowStatusSummary: FC<WorkflowStatusSummaryProps> = ({
  workflows,
}) => {
  const classes = useStyles();

  // Count workflows by conclusion status
  const counts = workflows.reduce(
    (acc, workflow) => {
      const conclusion = workflow.conclusion || StatusWorkflowEnum.default;
      const status = workflow.status;

      // Check if workflow is in progress
      if (status === 'in_progress' || status === 'queued') {
        acc.inProgress++;
      } else if (conclusion === StatusWorkflowEnum.success) {
        acc.success++;
      } else if (conclusion === StatusWorkflowEnum.failure) {
        acc.failure++;
      } else if (conclusion === StatusWorkflowEnum.canceled) {
        acc.cancelled++;
      } else {
        acc.other++;
      }

      return acc;
    },
    {
      success: 0,
      failure: 0,
      cancelled: 0,
      inProgress: 0,
      other: 0,
    }
  );

  return (
    <Box className={classes.summaryContainer}>
      <Box className={classes.statusItem}>
        <CheckCircleIcon className={classes.success} fontSize="small" />
        <Typography className={`${classes.statusCount} ${classes.success}`}>
          {counts.success}
        </Typography>
        <Typography className={classes.statusLabel}>Success</Typography>
      </Box>

      <Box className={classes.statusItem}>
        <ErrorIcon className={classes.failure} fontSize="small" />
        <Typography className={`${classes.statusCount} ${classes.failure}`}>
          {counts.failure}
        </Typography>
        <Typography className={classes.statusLabel}>Failed</Typography>
      </Box>

      {counts.inProgress > 0 && (
        <Box className={classes.statusItem}>
          <PendingIcon className={classes.inProgress} fontSize="small" />
          <Typography
            className={`${classes.statusCount} ${classes.inProgress}`}
          >
            {counts.inProgress}
          </Typography>
          <Typography className={classes.statusLabel}>Running</Typography>
        </Box>
      )}

      {counts.cancelled > 0 && (
        <Box className={classes.statusItem}>
          <CancelIcon className={classes.cancelled} fontSize="small" />
          <Typography
            className={`${classes.statusCount} ${classes.cancelled}`}
          >
            {counts.cancelled}
          </Typography>
          <Typography className={classes.statusLabel}>Cancelled</Typography>
        </Box>
      )}

      {counts.other > 0 && (
        <Box className={classes.statusItem}>
          <Typography
            className={`${classes.statusCount} ${classes.neutral}`}
          >
            {counts.other}
          </Typography>
          <Typography className={classes.statusLabel}>Other</Typography>
        </Box>
      )}
    </Box>
  );
};
