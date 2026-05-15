import { dummyPlugin } from './plugin';

describe('dummy', () => {
  it('should export plugin', () => {
    expect(dummyPlugin).toBeDefined();
  });
});
