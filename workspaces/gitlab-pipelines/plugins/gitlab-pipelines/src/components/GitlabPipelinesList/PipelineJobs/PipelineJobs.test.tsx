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
    expect(screen.getAllByRole('button', { name: /play/i })).toHaveLength(1);
    fireEvent.click(screen.getByRole('button', { name: /play/i }));
    fireEvent.change(screen.getByLabelText(/key/i), { target: { value: 'CONFIRM_DESTROY' } });
    fireEvent.change(screen.getByLabelText(/value/i), { target: { value: 'yes' } });
    fireEvent.click(screen.getByRole('button', { name: /confirm|run/i }));
    await waitFor(() => expect(c.playJob).toHaveBeenCalledWith(6, [{ key: 'CONFIRM_DESTROY', value: 'yes' }]));
  });
});
