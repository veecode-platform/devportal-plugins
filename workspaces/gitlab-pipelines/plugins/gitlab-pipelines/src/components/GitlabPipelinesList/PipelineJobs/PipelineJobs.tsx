import React from 'react';
import {
  IconButton,
  Link,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  Tooltip,
} from '@material-ui/core';
import PlayArrowIcon from '@material-ui/icons/PlayArrow';
import ReplayIcon from '@material-ui/icons/Replay';
import CancelIcon from '@material-ui/icons/Cancel';
import { JobDto, PipelineVariable } from '@veecode-platform/gitlab-pipelines-common';
import { useGitlabPipelinesContext } from '../../../context';
import { ModalComponent } from '../../ModalComponent';
import { StatusComponent } from '../../StatusComponent';

export const PipelineJobs = ({ pipelineId }: { pipelineId: number }) => {
  const { listJobs, playJob, retryJob, cancelJob } = useGitlabPipelinesContext();
  const [jobs, setJobs] = React.useState<JobDto[]>([]);
  const [busy, setBusy] = React.useState<number | null>(null);
  const [playing, setPlaying] = React.useState<JobDto | null>(null);

  const refresh = React.useCallback(
    async () => setJobs(await listJobs(pipelineId)),
    [listJobs, pipelineId],
  );

  React.useEffect(() => {
    refresh();
  }, [refresh]);

  const run = async (id: number, fn: () => Promise<unknown>) => {
    setBusy(id);
    try {
      await fn();
      await refresh();
    } finally {
      setBusy(null);
    }
  };

  const onConfirmPlay = async (variables: PipelineVariable[]) => {
    if (!playing) return;
    const job = playing;
    setPlaying(null);
    await run(job.id, () => playJob(job.id, variables));
  };

  return (
    <>
      <Table size="small" aria-label="pipeline jobs">
        <TableHead>
          <TableRow>
            <TableCell>Stage</TableCell>
            <TableCell>Job</TableCell>
            <TableCell>Status</TableCell>
            <TableCell align="right">Actions</TableCell>
          </TableRow>
        </TableHead>
        <TableBody>
          {jobs.map(job => (
            <TableRow key={job.id}>
              <TableCell>{job.stage}</TableCell>
              <TableCell>
                <Link href={job.webUrl} target="_blank" rel="noopener">
                  {job.name}
                </Link>
              </TableCell>
              <TableCell>
                <StatusComponent status={job.status} />
              </TableCell>
              <TableCell align="right">
                {job.manual && (
                  <Tooltip title="Play manual job">
                    <IconButton
                      aria-label="play"
                      size="small"
                      disabled={busy === job.id}
                      onClick={() => setPlaying(job)}
                    >
                      <PlayArrowIcon />
                    </IconButton>
                  </Tooltip>
                )}
                {(job.status === 'failed' || job.status === 'canceled') && (
                  <Tooltip title="Retry">
                    <IconButton
                      aria-label="retry"
                      size="small"
                      disabled={busy === job.id}
                      onClick={() => run(job.id, () => retryJob(job.id))}
                    >
                      <ReplayIcon />
                    </IconButton>
                  </Tooltip>
                )}
                {(job.status === 'running' || job.status === 'pending') && (
                  <Tooltip title="Cancel">
                    <IconButton
                      aria-label="cancel"
                      size="small"
                      disabled={busy === job.id}
                      onClick={() => run(job.id, () => cancelJob(job.id))}
                    >
                      <CancelIcon />
                    </IconButton>
                  </Tooltip>
                )}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
      {playing && (
        <ModalComponent
          open
          title={`Play "${playing.name}" with variables`}
          onClose={() => setPlaying(null)}
          onConfirm={onConfirmPlay}
        />
      )}
    </>
  );
};
