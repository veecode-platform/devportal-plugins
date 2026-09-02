import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { GitlabPipelinesContext } from '../../../context/GitlabPipelinesContext';
import { PipelineJobs } from './PipelineJobs';

const ctx = (over: Partial<any> = {}) => ({
  listJobs: jest.fn(async () => [
    { id: 6, name: 'destroy', stage: 'destroy', status: 'manual', manual: true, allowFailure: false, webUrl: 'u', startedAt: null, finishedAt: null },
    { id: 5, name: 'apply', stage: 'apply', status: 'success', manual: false, allowFailure: false, webUrl: 'u', startedAt: null, finishedAt: null },
  ]),
  playJob: jest.fn(async () => ({ id: 6, status: 'pending', manual: false })),
  retryJob: jest.fn(), cancelJob: jest.fn(),
  ...over,
});

describe('PipelineJobs', () => {
  it('shows a Play button only for manual jobs and sends the typed variables', async () => {
    const c = ctx();
    render(<GitlabPipelinesContext.Provider value={c as any}><PipelineJobs pipelineId={1} /></GitlabPipelinesContext.Provider>);
    await screen.findAllByText('destroy');
    expect(screen.getByText('Manual')).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: /play/i })).toHaveLength(1);
    fireEvent.click(screen.getByRole('button', { name: /play/i }));
    fireEvent.change(screen.getByLabelText(/key/i), { target: { value: 'CONFIRM_DESTROY' } });
    fireEvent.change(screen.getByLabelText(/value/i), { target: { value: 'yes' } });
    fireEvent.click(screen.getByRole('button', { name: /confirm|run/i }));
    await waitFor(() => expect(c.playJob).toHaveBeenCalledWith(6, [{ key: 'CONFIRM_DESTROY', value: 'yes' }]));
  });

  it('plays a manual job with no variables when Run is clicked without typing', async () => {
    const c = ctx();
    render(<GitlabPipelinesContext.Provider value={c as any}><PipelineJobs pipelineId={1} /></GitlabPipelinesContext.Provider>);
    await screen.findAllByText('destroy');
    fireEvent.click(screen.getByRole('button', { name: /play/i }));
    fireEvent.click(screen.getByRole('button', { name: /run/i }));
    await waitFor(() => expect(c.playJob).toHaveBeenCalledWith(6, []));
  });

  it('renders a job with an unsafe URL without an anchor', async () => {
    const c = ctx({
      listJobs: jest.fn(async () => [
        { id: 7, name: 'unsafe job', stage: 'test', status: 'success', manual: false, allowFailure: false, webUrl: 'javascript:alert(1)', startedAt: null, finishedAt: null },
      ]),
    });
    render(<GitlabPipelinesContext.Provider value={c as any}><PipelineJobs pipelineId={1} /></GitlabPipelinesContext.Provider>);

    await screen.findByText('unsafe job');
    expect(screen.queryByRole('link', { name: 'unsafe job' })).not.toBeInTheDocument();
    expect(document.querySelector('a[href="javascript:alert(1)"]')).not.toBeInTheDocument();
  });
});
