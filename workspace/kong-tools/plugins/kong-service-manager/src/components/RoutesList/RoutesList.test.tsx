import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { RoutesList } from './RoutesList';
import type { RouteResponse, RoutesResponse } from '@veecode-platform/backstage-plugin-kong-service-manager-common';

const mockRoute: RouteResponse = {
  id: 'route-1',
  name: 'my-route',
  protocols: ['http', 'https'],
  methods: ['GET', 'POST'],
  hosts: ['example.com'],
  paths: ['/api/v1'],
  headers: null,
  https_redirect_status_code: 426,
  regex_priority: 0,
  strip_path: true,
  path_handling: 'v0',
  preserve_host: false,
  request_buffering: true,
  response_buffering: true,
  tags: null,
  service: { id: 'svc-1' },
  created_at: 1700000010,
  updated_at: 1700000011,
};

const mockRoutes: RoutesResponse = {
  data: [mockRoute],
  next: null,
};

// Mock the context hook
const mockFetchRoutes = jest.fn();
const mockRemoveRoute = jest.fn();

jest.mock('../../context/KongServiceManagerContext', () => ({
  useKongServiceManager: () => ({
    state: {
      routes: mockRoutes,
      loading: false,
      error: null,
      instance: 'default',
      serviceName: 'my-service',
    },
    fetchRoutes: mockFetchRoutes,
    removeRoute: mockRemoveRoute,
  }),
}));

describe('RoutesList', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders route rows with name, protocols, methods, and paths', () => {
    render(<RoutesList />);

    expect(screen.getByText('my-route')).toBeInTheDocument();
    expect(screen.getByText('http')).toBeInTheDocument();
    expect(screen.getByText('https')).toBeInTheDocument();
    expect(screen.getByText('GET')).toBeInTheDocument();
    expect(screen.getByText('POST')).toBeInTheDocument();
    expect(screen.getByText('/api/v1')).toBeInTheDocument();
    expect(screen.getByText('example.com')).toBeInTheDocument();
  });

  it('shows Manage plugins button when onManagePlugins is provided', () => {
    const onManagePlugins = jest.fn();
    render(<RoutesList onManagePlugins={onManagePlugins} />);

    expect(
      screen.getByRole('button', { name: 'Manage plugins' }),
    ).toBeInTheDocument();
  });

  it('does not show Manage plugins button when onManagePlugins is not provided', () => {
    render(<RoutesList />);

    expect(
      screen.queryByRole('button', { name: 'Manage plugins' }),
    ).not.toBeInTheDocument();
  });

  it('shows delete confirmation dialog when delete is clicked', async () => {
    render(<RoutesList />);

    await userEvent.click(
      screen.getByRole('button', { name: 'Delete route' }),
    );

    expect(screen.getByText('Delete Route')).toBeInTheDocument();
    expect(
      screen.getByText(/Are you sure you want to delete route/),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Delete' }),
    ).toBeInTheDocument();
  });

  it('calls removeRoute when delete is confirmed', async () => {
    render(<RoutesList />);

    await userEvent.click(
      screen.getByRole('button', { name: 'Delete route' }),
    );
    await userEvent.click(screen.getByRole('button', { name: 'Delete' }));

    expect(mockRemoveRoute).toHaveBeenCalledWith('route-1');
  });

  it('shows route count in header', () => {
    render(<RoutesList />);

    expect(screen.getByText('1 route(s)')).toBeInTheDocument();
  });
});
