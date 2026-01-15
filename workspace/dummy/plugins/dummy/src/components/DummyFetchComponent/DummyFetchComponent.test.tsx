import { TestApiProvider, renderInTestApp } from '@backstage/test-utils';
import { fetchApiRef } from '@backstage/core-plugin-api';
import { DummyFetchComponent } from './DummyFetchComponent';

describe('DummyFetchComponent', () => {
  it('renders the teams table from the backend', async () => {
    const mockFetchApi = {
      fetch: jest.fn().mockResolvedValue({
        ok: true,
        status: 200,
        statusText: 'OK',
        json: async () => ({
          teams: [
            { id: 'arsenal', name: 'Arsenal', country: 'England' },
            { id: 'flamengo', name: 'Flamengo', country: 'Brazil' },
          ],
        }),
      }),
    } as any;

    const { findByRole, findByText } = await renderInTestApp(
      <TestApiProvider apis={[[fetchApiRef, mockFetchApi]]}>
        <DummyFetchComponent />
      </TestApiProvider>,
    );

    // Wait for the table to render
    const table = await findByRole('table');
    expect(table).toBeInTheDocument();
    expect(await findByText('Arsenal')).toBeInTheDocument();
    expect(await findByText('England')).toBeInTheDocument();
    expect(await findByText('Flamengo')).toBeInTheDocument();
    expect(await findByText('Brazil')).toBeInTheDocument();
    // Sanity check: correct URL used
    expect(mockFetchApi.fetch).toHaveBeenCalledWith(
      '/api/plugin-dummy-backend/teams',
    );
  });
});
