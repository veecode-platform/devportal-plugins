import { TestApiProvider, renderInTestApp } from '@backstage/test-utils';
import { discoveryApiRef, fetchApiRef } from '@backstage/core-plugin-api';
import { DummyCard } from './DummyCard';

const mockDiscoveryApi = {
  getBaseUrl: jest.fn().mockResolvedValue('http://localhost:7007/api/plugin-dummy-backend'),
};

const mockFetchApi = {
  fetch: jest.fn().mockResolvedValue({
    ok: true,
    status: 200,
    statusText: 'OK',
    headers: new Headers({ 'content-type': 'application/json' }),
    json: async () => ({
      teams: [{ id: 'arsenal', name: 'Arsenal', country: 'England' }],
      totalCount: 1,
      limit: 5,
      offset: 0,
    }),
  }),
} as any;

describe('DummyCard', () => {
  it('renders the InfoCard with teams table', async () => {
    const { findByText } = await renderInTestApp(
      <TestApiProvider
        apis={[
          [discoveryApiRef, mockDiscoveryApi],
          [fetchApiRef, mockFetchApi],
        ]}
      >
        <DummyCard />
      </TestApiProvider>,
    );

    expect(await findByText('Dummy Plugin')).toBeInTheDocument();
    expect(await findByText('Arsenal')).toBeInTheDocument();
  });
});
