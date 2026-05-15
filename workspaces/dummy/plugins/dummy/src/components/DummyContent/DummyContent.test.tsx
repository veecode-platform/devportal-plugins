import { TestApiProvider, renderInTestApp } from '@backstage/test-utils';
import { discoveryApiRef, fetchApiRef } from '@backstage/core-plugin-api';
import { DummyContent } from './DummyContent';

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
      teams: [{ id: 'flamengo', name: 'Flamengo', country: 'Brazil' }],
      totalCount: 1,
      limit: 5,
      offset: 0,
    }),
  }),
} as any;

describe('DummyContent', () => {
  it('renders the content grid with DummyCard', async () => {
    const { findByText } = await renderInTestApp(
      <TestApiProvider
        apis={[
          [discoveryApiRef, mockDiscoveryApi],
          [fetchApiRef, mockFetchApi],
        ]}
      >
        <DummyContent />
      </TestApiProvider>,
    );

    expect(await findByText('Dummy Plugin')).toBeInTheDocument();
    expect(await findByText('Flamengo')).toBeInTheDocument();
  });
});
