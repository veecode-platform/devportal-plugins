import { test, expect, type Page, type Route as PwRoute } from '@playwright/test';

// ---------------------------------------------------------------------------
// Role definitions — mirrors backend permission policy
// ---------------------------------------------------------------------------

type Role = 'admin' | 'operator' | 'viewer';

const READ_PERMISSIONS = new Set([
  'kong.service.read',
  'kong.plugins.read',
  'kong.routes.read',
]);

const PLUGIN_MUTATION_PERMISSIONS = new Set([
  'kong.plugin.service.apply',
  'kong.plugin.service.update',
  'kong.plugin.service.disable',
  'kong.plugin.route.apply',
  'kong.plugin.route.update',
  'kong.plugin.route.disable',
]);

function decidePermission(role: Role, permissionName: string): 'ALLOW' | 'DENY' {
  if (READ_PERMISSIONS.has(permissionName)) return 'ALLOW';
  if (role === 'admin') return 'ALLOW';
  if (role === 'operator' && PLUGIN_MUTATION_PERMISSIONS.has(permissionName)) {
    return 'ALLOW';
  }
  return 'DENY';
}

// ---------------------------------------------------------------------------
// Mock Kong backend data
// ---------------------------------------------------------------------------

const MOCK_SERVICE = {
  id: '3b06c6e5-50a7-4db2-9e44-1cf4a0c3e8d1',
  name: 'my-service',
  protocol: 'http',
  host: 'httpbin.org',
  port: 80,
  path: '/anything',
  retries: 5,
  connect_timeout: 60000,
  write_timeout: 60000,
  read_timeout: 60000,
  enabled: true,
  created_at: 1700000000,
  updated_at: 1700000001,
  tags: ['managed'],
};

const MOCK_ROUTE = {
  id: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
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
  service: { id: MOCK_SERVICE.id },
  created_at: 1700000010,
  updated_at: 1700000011,
};

const MOCK_PLUGIN = {
  id: 'p1a2b3c4-d5e6-7890-abcd-111111111111',
  name: 'rate-limiting',
  enabled: true,
  config: { minute: 100, policy: 'local', fault_tolerant: true },
  protocols: ['http', 'https'],
  tags: null,
  created_at: 1700000020,
  service: { id: MOCK_SERVICE.id },
  route: null,
  consumer: null,
};

const MOCK_AVAILABLE_PLUGINS = {
  enabled_plugins: ['rate-limiting', 'cors', 'key-auth', 'basic-auth'],
};

const MOCK_PLUGIN_FIELDS = {
  fields: [
    {
      config: {
        type: 'record',
        fields: [
          { minute: { type: 'number', required: false } },
          { policy: { type: 'string', required: false, default: 'local' } },
        ],
      },
    },
  ],
};

// ---------------------------------------------------------------------------
// Helper: intercept permission API and Kong backend API
// ---------------------------------------------------------------------------

async function mockPermissionsForRole(page: Page, role: Role) {
  // Intercept POST /api/permission/authorize
  await page.route('**/api/permission/authorize', async (route: PwRoute) => {
    const request = route.request();
    const postData = request.postDataJSON();
    const items = postData?.items ?? [];

    const results = items.map((item: { permission: { name: string } }) => {
      const result = decidePermission(role, item.permission.name);
      return { result };
    });

    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ items: results }),
    });
  });
}

async function mockKongBackend(page: Page) {
  // Service info
  await page.route('**/api/kong-service-manager/*/services/*', async (route: PwRoute) => {
    if (route.request().method() !== 'GET') {
      await route.continue();
      return;
    }
    const url = route.request().url();
    if (url.includes('/plugins/associated')) {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([MOCK_PLUGIN]),
      });
    } else if (url.includes('/plugins/') && url.includes('/fields')) {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(MOCK_PLUGIN_FIELDS),
      });
    } else if (url.includes('/routes/')) {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(MOCK_ROUTE),
      });
    } else if (url.includes('/routes')) {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ data: [MOCK_ROUTE], next: null }),
      });
    } else {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(MOCK_SERVICE),
      });
    }
  });

  // Available plugins
  await page.route('**/api/kong-service-manager/*/plugins', async (route: PwRoute) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(MOCK_AVAILABLE_PLUGINS),
    });
  });

  // Route associated plugins
  await page.route('**/api/kong-service-manager/*/routes/*/plugins/associated', async (route: PwRoute) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify([MOCK_PLUGIN]),
    });
  });
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

test.describe('Permission visibility — Admin', () => {
  test.beforeEach(async ({ page }) => {
    await mockPermissionsForRole(page, 'admin');
    await mockKongBackend(page);
  });

  test('Plugins tab: Enable and Disable buttons visible', async ({ page }) => {
    await page.goto('/');

    // Sign in if guest provider shows Enter button
    const enterButton = page.getByRole('button', { name: 'Enter' });
    if (await enterButton.isVisible({ timeout: 3000 }).catch(() => false)) {
      await enterButton.click();
    }

    // Navigate to the entity page with kong-service-manager
    // The exact URL depends on the catalog entity; use a known test entity
    await page.goto('/catalog/default/component/my-service');

    // Click the Plugins tab
    await page.getByRole('tab', { name: 'Plugins' }).click();

    // Admin should see Enable and Disable buttons
    await expect(page.getByRole('button', { name: 'Enable' }).first()).toBeVisible();
    await expect(page.getByRole('button', { name: 'Disable' }).first()).toBeVisible();
  });

  test('Routes tab: Create Route, Edit, Delete visible', async ({ page }) => {
    await page.goto('/catalog/default/component/my-service');

    const enterButton = page.getByRole('button', { name: 'Enter' });
    if (await enterButton.isVisible({ timeout: 3000 }).catch(() => false)) {
      await enterButton.click();
    }

    await page.getByRole('tab', { name: 'Routes' }).click();

    await expect(page.getByRole('button', { name: 'Create Route' })).toBeVisible();
    await expect(page.locator('[title="Edit route"]').first()).toBeVisible();
    await expect(page.locator('[title="Delete route"]').first()).toBeVisible();
  });
});

test.describe('Permission visibility — Operator', () => {
  test.beforeEach(async ({ page }) => {
    await mockPermissionsForRole(page, 'operator');
    await mockKongBackend(page);
  });

  test('Plugins tab: Enable and Disable buttons visible', async ({ page }) => {
    await page.goto('/catalog/default/component/my-service');

    const enterButton = page.getByRole('button', { name: 'Enter' });
    if (await enterButton.isVisible({ timeout: 3000 }).catch(() => false)) {
      await enterButton.click();
    }

    await page.getByRole('tab', { name: 'Plugins' }).click();

    await expect(page.getByRole('button', { name: 'Enable' }).first()).toBeVisible();
    await expect(page.getByRole('button', { name: 'Disable' }).first()).toBeVisible();
  });

  test('Routes tab: Create Route NOT visible, Edit/Delete NOT visible', async ({ page }) => {
    await page.goto('/catalog/default/component/my-service');

    const enterButton = page.getByRole('button', { name: 'Enter' });
    if (await enterButton.isVisible({ timeout: 3000 }).catch(() => false)) {
      await enterButton.click();
    }

    await page.getByRole('tab', { name: 'Routes' }).click();

    // Route data should still be visible
    await expect(page.getByText('my-route')).toBeVisible();

    // Mutation buttons should NOT be visible
    await expect(page.getByRole('button', { name: 'Create Route' })).not.toBeVisible();
    await expect(page.locator('[title="Edit route"]')).toHaveCount(0);
    await expect(page.locator('[title="Delete route"]')).toHaveCount(0);
  });
});

test.describe('Permission visibility — Viewer', () => {
  test.beforeEach(async ({ page }) => {
    await mockPermissionsForRole(page, 'viewer');
    await mockKongBackend(page);
  });

  test('Plugins tab: Enable and Disable buttons NOT visible, data still shows', async ({ page }) => {
    await page.goto('/catalog/default/component/my-service');

    const enterButton = page.getByRole('button', { name: 'Enter' });
    if (await enterButton.isVisible({ timeout: 3000 }).catch(() => false)) {
      await enterButton.click();
    }

    await page.getByRole('tab', { name: 'Plugins' }).click();

    // Plugin cards should still be visible (data is readable)
    await expect(page.getByText('rate-limiting')).toBeVisible();

    // Mutation buttons should NOT be visible
    await expect(page.getByRole('button', { name: 'Enable' })).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Disable' })).toHaveCount(0);
  });

  test('Routes tab: data visible, no mutation buttons', async ({ page }) => {
    await page.goto('/catalog/default/component/my-service');

    const enterButton = page.getByRole('button', { name: 'Enter' });
    if (await enterButton.isVisible({ timeout: 3000 }).catch(() => false)) {
      await enterButton.click();
    }

    await page.getByRole('tab', { name: 'Routes' }).click();

    // Route data should still be visible
    await expect(page.getByText('my-route')).toBeVisible();

    // Mutation buttons should NOT be visible
    await expect(page.getByRole('button', { name: 'Create Route' })).not.toBeVisible();
    await expect(page.locator('[title="Edit route"]')).toHaveCount(0);
    await expect(page.locator('[title="Delete route"]')).toHaveCount(0);
  });
});
