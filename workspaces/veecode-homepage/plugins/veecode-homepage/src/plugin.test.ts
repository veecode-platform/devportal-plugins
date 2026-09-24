import { VisitsStorageApi } from '@backstage/plugin-home';
import { mockApis } from '@backstage/test-utils';
import { VisitListener } from './index';
import { veecodeHomepagePlugin } from './plugin';

describe('veecode-homepage', () => {
  it('should export plugin', () => {
    expect(veecodeHomepagePlugin).toBeDefined();
  });

  // The dynamic-plugin build tree-shakes anything unreferenced, and a missing
  // mount-point export fails silently at runtime (the loader only warns).
  it('should export VisitListener for the application/listener mount point', () => {
    expect(VisitListener).toBeDefined();
  });

  // Browsers expose crypto.randomUUID only in secure contexts, so a plain-HTTP
  // origin is simulated by shadowing it before the plugin module loads.
  it('saves a visit on an origin without crypto.randomUUID', async () => {
    Object.defineProperty(window.crypto, 'randomUUID', {
      value: undefined,
      configurable: true,
      writable: true,
    });
    try {
      await jest.isolateModulesAsync(async () => {
        await import('./plugin');
      });
      const visits = VisitsStorageApi.create({
        storageApi: mockApis.storage(),
        identityApi: mockApis.identity(),
      });

      const saved = await visits.save({
        visit: { name: 'Catalog', pathname: '/catalog' },
      });

      expect(saved.id).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
      );
    } finally {
      delete (window.crypto as { randomUUID?: unknown }).randomUUID;
    }
  });
});
