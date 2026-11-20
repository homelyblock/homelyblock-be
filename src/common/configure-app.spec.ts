import { isSwaggerEnabled } from './configure-app.js';
import { THROTTLE_LIMIT, THROTTLE_TTL_MS } from './throttler.config.js';

describe('configureApp security defaults', () => {
  it('disables Swagger in production unless explicitly overridden', () => {
    expect(isSwaggerEnabled('production')).toBe(false);
    expect(isSwaggerEnabled('production', {}, true)).toBe(true);
    expect(isSwaggerEnabled('production', { swagger: true })).toBe(true);
    expect(isSwaggerEnabled('development')).toBe(true);
    expect(isSwaggerEnabled('test')).toBe(true);
    expect(isSwaggerEnabled('development', { swagger: false })).toBe(false);
  });

  it('keeps a conservative global throttle budget', () => {
    expect(THROTTLE_TTL_MS).toBe(60_000);
    expect(THROTTLE_LIMIT).toBe(120);
  });
});
