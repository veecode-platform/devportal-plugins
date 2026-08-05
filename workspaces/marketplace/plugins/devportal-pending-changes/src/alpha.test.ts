import appModulePendingChanges, {
  pendingChangesApi,
  pendingChangesRootElement,
} from './alpha';

describe('appModulePendingChanges (NFS alpha module)', () => {
  it('is a valid FrontendModule targeting the host app plugin', () => {
    // This is exactly the contract @backstage/frontend-dynamic-feature-loader
    // and the static app.packages discovery check on the default export:
    // https://github.com/backstage/backstage/blob/v1.53.0/packages/frontend-dynamic-feature-loader/src/loader.ts
    expect(appModulePendingChanges.$$type).toBe('@backstage/FrontendModule');
    expect(appModulePendingChanges.pluginId).toBe('app');
  });

  it('provides the pending-changes API and the app-root element extension', () => {
    expect(pendingChangesApi).toBeDefined();
    expect(pendingChangesRootElement).toBeDefined();
  });
});
