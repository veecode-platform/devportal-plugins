import { samePlugin } from './pluginKey';
import { PLUGIN_KEY_VECTORS } from './pluginKeyVectors';

describe('samePlugin', () => {
  it.each(PLUGIN_KEY_VECTORS)(
    'compares %s with %s as %s, in both directions',
    (a, b, expected) => {
      expect(samePlugin(a, b)).toBe(expected);
      expect(samePlugin(b, a)).toBe(expected);
    },
  );
});
