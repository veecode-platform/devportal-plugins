import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { RoutePluginsDrawer } from './RoutePluginsDrawer';
import type {
  AssociatedPluginsResponse,
  PluginPerCategory,
  RouteResponse,
} from '@veecode-platform/backstage-plugin-kong-service-manager-common';

const mockRoute: RouteResponse = {
  id: 'route-1',
  name: 'my-route',
  protocols: ['http'],
  methods: ['GET'],
  hosts: null,
  paths: ['/api'],
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
  created_at: 1700000000,
  updated_at: 1700000000,
};

const routePlugin: AssociatedPluginsResponse = {
  id: 'plugin-1',
  name: 'rate-limiting',
  enabled: true,
  config: { minute: 60 },
  protocols: ['http'],
  tags: null,
  created_at: 1700000000,
  service: null,
  route: { id: 'route-1' },
  consumer: null,
};

const availablePlugins: PluginPerCategory[] = [
  { category: 'traffic-control', plugins: [{ name: 'rate-limiting', slug: 'rate-limiting', associated: true }] },
];

let mockEntity: {
  kind: string;
  metadata: { name: string; namespace?: string; annotations?: Record<string, string> };
} = {
  kind: 'Component',
  metadata: { name: 'my-service', annotations: { 'gitlab.com/project-slug': 'team/my-service' } },
};

const mockFetchRouteAssociatedPlugins = jest.fn();
const mockFetchAvailablePlugins = jest.fn();
const mockRemoveRoutePlugin = jest.fn();
const mockFetchPromotions = jest.fn();
const mockFetchInstances = jest.fn();
const mockFetchPromotionCapabilities = jest.fn();
const mockPreviewPromotion = jest.fn();
const mockPromotePlugin = jest.fn();
const mockDiscardPromotion = jest.fn();

let mockPromotionsByPluginId: Record<string, unknown[]> = {};
let mockPromotionCapabilities: { helm: { available: boolean; path: string; error?: string }; editInCode?: boolean } | null = null;
let mockKongInstances: Array<{ id: string; apiBaseUrl: string; defaultTags?: string[] }> = [];
const mockFetchPluginFields = jest.fn();
const mockAddPluginToRoute = jest.fn();
const mockEditRoutePlugin = jest.fn();
const mockClearError = jest.fn();
let mockPluginFields: unknown = null;

jest.mock('@backstage/plugin-catalog-react', () => ({
  useEntity: () => ({ entity: mockEntity }),
}));

jest.mock('../../context/KongServiceManagerContext', () => ({
  useKongServiceManager: () => ({
    state: {
      routeAssociatedPlugins: [routePlugin],
      availablePlugins,
      loading: false,
      instance: 'default',
      serviceName: 'my-service',
      promotionsByPluginId: mockPromotionsByPluginId,
      kongInstances: mockKongInstances,
      promotionCapabilities: mockPromotionCapabilities,
      pluginFields: mockPluginFields,
    },
    fetchRouteAssociatedPlugins: mockFetchRouteAssociatedPlugins,
    fetchAvailablePlugins: mockFetchAvailablePlugins,
    removeRoutePlugin: mockRemoveRoutePlugin,
    fetchPromotions: mockFetchPromotions,
    fetchInstances: mockFetchInstances,
    fetchPromotionCapabilities: mockFetchPromotionCapabilities,
    previewPromotion: mockPreviewPromotion,
    promotePlugin: mockPromotePlugin,
    discardPromotion: mockDiscardPromotion,
    // PluginConfigDrawer's dependencies — the code-mode edit-in-code instance
    // mounted inside RoutePluginsDrawer (issue #135) shares this same mocked
    // context, so it needs these even though most tests here never open it.
    fetchPluginFields: mockFetchPluginFields,
    addPluginToRoute: mockAddPluginToRoute,
    editRoutePlugin: mockEditRoutePlugin,
    addPluginToService: jest.fn(),
    editServicePlugin: jest.fn(),
    clearError: mockClearError,
  }),
}));

describe('RoutePluginsDrawer', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockEntity = {
      kind: 'Component',
      metadata: { name: 'my-service', annotations: { 'gitlab.com/project-slug': 'team/my-service' } },
    };
    mockPromotionsByPluginId = {};
    mockPromotionCapabilities = { helm: { available: true, path: 'helm' } };
    mockKongInstances = [];
    mockPluginFields = { fields: [{ minute: { type: 'number' } }] };
    mockPreviewPromotion.mockResolvedValue({ files: [], normalizedConfig: {} });
  });

  it('fetches promotion history for each associated route plugin when opened', () => {
    render(
      <RoutePluginsDrawer
        open
        route={mockRoute}
        onClose={jest.fn()}
        onEnablePlugin={jest.fn()}
        onEditPlugin={jest.fn()}
        canPromote
      />,
    );

    expect(mockFetchPromotions).toHaveBeenCalledWith('route-1', 'plugin-1');
  });

  it('opens the review dialog and promotes with the entity ref on confirm', async () => {
    mockPromotePlugin.mockResolvedValue({ id: 1, state: 'mr-open' });
    render(
      <RoutePluginsDrawer
        open
        route={mockRoute}
        onClose={jest.fn()}
        onEnablePlugin={jest.fn()}
        onEditPlugin={jest.fn()}
        canPromote
      />,
    );

    await userEvent.click(screen.getByRole('button', { name: /Promote to code/i }));
    const dialog = screen.getByRole('dialog');
    expect(within(dialog).getByText(/rate-limiting/)).toBeInTheDocument();

    await waitFor(() =>
      expect(within(dialog).getByRole('button', { name: /Promote to code/i })).toBeEnabled(),
    );
    await userEvent.click(within(dialog).getByRole('button', { name: /Promote to code/i }));
    expect(mockPromotePlugin).toHaveBeenCalledWith('route-1', 'plugin-1', expect.any(String), undefined);
  });

  it('disables promote with a reason when the entity has no owning repo (pure route)', () => {
    mockEntity = { kind: 'Component', metadata: { name: 'my-service' } };
    render(
      <RoutePluginsDrawer
        open
        route={mockRoute}
        onClose={jest.fn()}
        onEnablePlugin={jest.fn()}
        onEditPlugin={jest.fn()}
        canPromote
      />,
    );

    expect(screen.getByRole('button', { name: /Promote to code/i })).toBeDisabled();
    expect(screen.getByText(/No owning repo/)).toBeInTheDocument();
  });

  it('fetches promotion capabilities once when opened', () => {
    mockPromotionCapabilities = null;
    render(
      <RoutePluginsDrawer
        open
        route={mockRoute}
        onClose={jest.fn()}
        onEnablePlugin={jest.fn()}
        onEditPlugin={jest.fn()}
        canPromote
      />,
    );

    expect(mockFetchPromotionCapabilities).toHaveBeenCalledTimes(1);
  });

  it('disables promote with the backend message when helm is unavailable', () => {
    mockPromotionCapabilities = {
      helm: {
        available: false,
        path: '/opt/helm/helm',
        error: 'promotion unavailable: helm not found at "/opt/helm/helm" — the deployment must provide the helm CLI and point kong.promotion.helmPath at it (see README, "Prerequisites")',
      },
    };
    render(
      <RoutePluginsDrawer
        open
        route={mockRoute}
        onClose={jest.fn()}
        onEnablePlugin={jest.fn()}
        onEditPlugin={jest.fn()}
        canPromote
      />,
    );

    expect(screen.getByRole('button', { name: /Promote to code/i })).toBeDisabled();
    expect(screen.getByText(/helm not found at "\/opt\/helm\/helm"/)).toBeInTheDocument();
  });

  it('discards an open promotion', async () => {
    mockPromotionsByPluginId = {
      'plugin-1': [
        {
          id: 1,
          instance: 'default',
          serviceName: 'my-service',
          routeId: 'route-1',
          pluginType: 'rate-limiting',
          state: 'mr-open',
          mrRef: 'https://gitlab.example.com/team/my-service/-/merge_requests/1',
          requesterRef: 'user:default/alice',
          createdAt: '2026-09-01T00:00:00.000Z',
          updatedAt: '2026-09-01T00:00:00.000Z',
        },
      ],
    };
    mockDiscardPromotion.mockResolvedValue(undefined);

    render(
      <RoutePluginsDrawer
        open
        route={mockRoute}
        onClose={jest.fn()}
        onEnablePlugin={jest.fn()}
        onEditPlugin={jest.fn()}
        canPromote
      />,
    );

    await userEvent.click(screen.getByRole('button', { name: 'Descartar promoção' }));
    expect(mockDiscardPromotion).toHaveBeenCalledWith('route-1', 'plugin-1');
  });

  describe('edit in code (issue #135)', () => {
    beforeEach(() => {
      mockPromotionCapabilities = { helm: { available: true, path: 'helm' }, editInCode: true };
      // No defaultTags on the plugin's own tags (null) but the instance
      // carries one => ADR-017 code-owned.
      mockKongInstances = [{ id: 'default', apiBaseUrl: 'https://kong.example.com', defaultTags: ['portal-managed'] }];
    });

    it('opens the code form, then the review dialog, and promotes with the edited config', async () => {
      mockPromotePlugin.mockResolvedValue({ id: 1, state: 'mr-open', mode: 'code-only' });
      render(
        <RoutePluginsDrawer
          open
          route={mockRoute}
          onClose={jest.fn()}
          onEnablePlugin={jest.fn()}
          onEditPlugin={jest.fn()}
          canPromote
        />,
      );

      await userEvent.click(screen.getByRole('button', { name: 'Edit in code' }));
      expect(screen.getByRole('button', { name: /Review promotion/i })).toBeInTheDocument();

      const minuteField = screen.getByLabelText('config.minute');
      await userEvent.clear(minuteField);
      await userEvent.type(minuteField, '30');
      await userEvent.click(screen.getByRole('button', { name: /Review promotion/i }));

      const dialog = await screen.findByRole('dialog');
      expect(within(dialog).getByText(/Edit rate-limiting in code/)).toBeInTheDocument();
      await waitFor(() =>
        expect(within(dialog).getByRole('button', { name: /Promote to code/i })).toBeEnabled(),
      );
      await userEvent.click(within(dialog).getByRole('button', { name: /Promote to code/i }));

      expect(mockPromotePlugin).toHaveBeenCalledWith(
        'route-1',
        'plugin-1',
        expect.any(String),
        expect.objectContaining({ minute: 30 }),
      );
      // Edit-in-code never touches the Kong plugin CRUD endpoints.
      expect(mockEditRoutePlugin).not.toHaveBeenCalled();
      expect(mockAddPluginToRoute).not.toHaveBeenCalled();
    });

    it('hides Edit in code when the capability is off', () => {
      mockPromotionCapabilities = { helm: { available: true, path: 'helm' }, editInCode: false };
      render(
        <RoutePluginsDrawer
          open
          route={mockRoute}
          onClose={jest.fn()}
          onEnablePlugin={jest.fn()}
          onEditPlugin={jest.fn()}
          canPromote
        />,
      );

      expect(screen.queryByRole('button', { name: 'Edit in code' })).not.toBeInTheDocument();
    });
  });
});
