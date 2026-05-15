import { TestApiProvider, renderInTestApp } from '@backstage/test-utils';
import { discoveryApiRef, fetchApiRef } from '@backstage/core-plugin-api';
import { DummyComponent } from './DummyComponent';

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

describe('DummyComponent', () => {
  it('should render', async () => {
    const { findByText } = await renderInTestApp(
      <TestApiProvider
        apis={[
          [discoveryApiRef, mockDiscoveryApi],
          [fetchApiRef, mockFetchApi],
        ]}
      >
        <DummyComponent />
      </TestApiProvider>,
    );

    expect(await findByText('Welcome to dummy!')).toBeInTheDocument();
  });
});
