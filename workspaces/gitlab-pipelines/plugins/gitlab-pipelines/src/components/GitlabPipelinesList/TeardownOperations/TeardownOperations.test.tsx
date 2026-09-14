import { render, screen } from '@testing-library/react';
import { GitlabPipelinesContext } from '../../../context/GitlabPipelinesContext';
import { TeardownOperations } from './TeardownOperations';

const op = (over: Partial<any> = {}) => ({
  id: 1,
  host: 'gitlab.example.com',
  projectSlug: 'group/box',
  pipelineId: 10,
  jobId: 6,
  requesterRef: 'user:default/jdoe',
  state: 'pending',
  detail: null,
  unregisterCommitSha: null,
  createdAt: '2026-09-10T12:00:00.000Z',
  updatedAt: '2026-09-10T12:00:00.000Z',
  ...over,
});

const ctx = (over: Partial<any> = {}) => ({
  listTeardowns: jest.fn(async () => []),
  ...over,
});

describe('TeardownOperations', () => {
  it('renders nothing when there are no teardown operations', async () => {
    const c = ctx();
    const { container } = render(
      <GitlabPipelinesContext.Provider value={c as any}>
        <TeardownOperations />
      </GitlabPipelinesContext.Provider>,
    );
    await Promise.resolve();
    expect(c.listTeardowns).toHaveBeenCalled();
    expect(container).toBeEmptyDOMElement();
  });

  it('renders a distinct label per teardown state', async () => {
    const c = ctx({
      listTeardowns: jest.fn(async () => [
        op({ id: 1, state: 'pending' }),
        op({ id: 2, state: 'failed' }),
        op({ id: 3, state: 'superseded' }),
        op({ id: 4, state: 'consumed', unregisterCommitSha: 'abcdef1234567890' }),
        op({ id: 5, state: 'flagged' }),
      ]),
    });
    render(
      <GitlabPipelinesContext.Provider value={c as any}>
        <TeardownOperations />
      </GitlabPipelinesContext.Provider>,
    );

    expect(await screen.findByText('Pending')).toBeInTheDocument();
    expect(screen.getByText('Failed')).toBeInTheDocument();
    expect(screen.getByText('Superseded')).toBeInTheDocument();
    expect(screen.getByText('Consumed')).toBeInTheDocument();
    expect(screen.getByText('Flagged')).toBeInTheDocument();
  });

  it('shows who requested each operation and when', async () => {
    const c = ctx({
      listTeardowns: jest.fn(async () => [op({ requesterRef: 'user:default/jdoe' })]),
    });
    render(
      <GitlabPipelinesContext.Provider value={c as any}>
        <TeardownOperations />
      </GitlabPipelinesContext.Provider>,
    );

    expect(await screen.findByText('user:default/jdoe')).toBeInTheDocument();
    expect(screen.getByText(/ago$/)).toBeInTheDocument();
  });

  it('shows the short unregister commit sha only for consumed operations', async () => {
    const c = ctx({
      listTeardowns: jest.fn(async () => [
        op({ id: 1, state: 'consumed', unregisterCommitSha: 'abcdef1234567890' }),
        op({ id: 2, state: 'pending', unregisterCommitSha: null }),
      ]),
    });
    render(
      <GitlabPipelinesContext.Provider value={c as any}>
        <TeardownOperations />
      </GitlabPipelinesContext.Provider>,
    );

    expect(await screen.findByText('abcdef1')).toBeInTheDocument();
  });
});
