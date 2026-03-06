import { TestApiProvider, renderInTestApp } from '@backstage/test-utils';
import { discoveryApiRef, fetchApiRef } from '@backstage/core-plugin-api';
import { DummyFetchComponent } from './DummyFetchComponent';

const mockDiscoveryApi = {
  getBaseUrl: jest.fn().mockResolvedValue('http://localhost:7007/api/plugin-dummy-backend'),
};

describe('DummyFetchComponent', () => {
  it('renders the teams table from the backend', async () => {
    const mockFetchApi = {
      fetch: jest.fn().mockResolvedValue({
        ok: true,
        status: 200,
        statusText: 'OK',
        headers: new Headers({ 'content-type': 'application/json' }),
        json: async () => ({
          teams: [
            { id: 'arsenal', name: 'Arsenal', country: 'England' },
            { id: 'flamengo', name: 'Flamengo', country: 'Brazil' },
          ],
          totalCount: 2,
          limit: 5,
          offset: 0,
        }),
      }),
    } as any;

    const { findByText } = await renderInTestApp(
      <TestApiProvider
        apis={[
          [discoveryApiRef, mockDiscoveryApi],
          [fetchApiRef, mockFetchApi],
        ]}
      >
        <DummyFetchComponent />
      </TestApiProvider>,
    );

    expect(await findByText('Arsenal')).toBeInTheDocument();
    expect(await findByText('England')).toBeInTheDocument();
    expect(await findByText('Flamengo')).toBeInTheDocument();
    expect(await findByText('Brazil')).toBeInTheDocument();
    expect(mockFetchApi.fetch).toHaveBeenCalledWith(
      'http://localhost:7007/api/plugin-dummy-backend/teams?limit=5&offset=0',
    );
  });
});
