import React from 'react';
import {
  Box,
  Card,
  CardContent,
  CardHeader,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  Typography,
} from '@material-ui/core';
import { TeardownOperationDto, TeardownState } from '@veecode-platform/gitlab-pipelines-common';
import dayjs from 'dayjs';
import relativeTime from 'dayjs/plugin/relativeTime';
import { useGitlabPipelinesContext } from '../../../context';
import GitlabIcon from '../../../assets/gitlabIcon';
import {
  CheckOkIcon,
  CircleChevronsRight,
  CircleCloseOutline,
  ClockIcon,
  WarningIcon,
} from '../../shared';
import { useTeardownOperationsStyles } from './styles';
import { TeardownOperationsProps } from './types';

dayjs.extend(relativeTime);

const TEARDOWN_STATE_LABEL: Record<TeardownState, string> = {
  pending: 'Pending',
  failed: 'Failed',
  superseded: 'Superseded',
  consumed: 'Consumed',
  flagged: 'Flagged',
};

const TEARDOWN_STATE_ICON: Record<TeardownState, React.FC> = {
  pending: ClockIcon,
  failed: CircleCloseOutline,
  superseded: CircleChevronsRight,
  consumed: CheckOkIcon,
  flagged: WarningIcon,
};

const TeardownStateBadge: React.FC<{ state: TeardownState }> = ({ state }) => {
  const classes = useTeardownOperationsStyles();
  const Icon = TEARDOWN_STATE_ICON[state];
  return (
    <Box className={classes.state}>
      <Icon /> {TEARDOWN_STATE_LABEL[state]}
    </Box>
  );
};

export const TeardownOperationsList: React.FC<TeardownOperationsProps> = ({ items }) => {
  const classes = useTeardownOperationsStyles();

  const TitleBar = (
    <Typography className={classes.title}>
      <GitlabIcon />
      Teardown Operations
    </Typography>
  );

  return (
    <Card>
      <CardHeader title={TitleBar} />
      <CardContent>
        <Table size="small" aria-label="teardown operations">
          <TableHead>
            <TableRow>
              <TableCell>State</TableCell>
              <TableCell>Requested by</TableCell>
              <TableCell>Requested at</TableCell>
              <TableCell>Unregister commit</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {items.map(op => (
              <TableRow key={op.id}>
                <TableCell>
                  <TeardownStateBadge state={op.state} />
                </TableCell>
                <TableCell>{op.requesterRef}</TableCell>
                <TableCell>
                  <time>{dayjs(op.createdAt).fromNow()}</time>
                </TableCell>
                <TableCell className={classes.sha}>
                  {op.state === 'consumed' && op.unregisterCommitSha
                    ? op.unregisterCommitSha.slice(0, 7)
                    : null}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
};

export const TeardownOperations = () => {
  const { listTeardowns } = useGitlabPipelinesContext();
  const [operations, setOperations] = React.useState<TeardownOperationDto[]>([]);

  React.useEffect(() => {
    listTeardowns().then(setOperations);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (operations.length === 0) {
    return null;
  }

  return <TeardownOperationsList items={operations} />;
};
