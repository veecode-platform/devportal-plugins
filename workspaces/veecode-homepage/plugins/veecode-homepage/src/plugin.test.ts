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
});
