import { ThrottlerModule } from '@nestjs/throttler';

/**
 * Global request throttling for abuse-prone routes.
 * Auth still relies on JWT verification; this only limits request volume.
 *
 * Tracker key uses Express `req.ip`. `trust proxy` stays off unless
 * TRUSTED_PROXY_HOPS is set, so client-supplied `X-Forwarded-For` is ignored.
 * Behind one reverse proxy, set TRUSTED_PROXY_HOPS=1 only when the API cannot
 * be reached except through that proxy. Otherwise every client shares the
 * proxy address, which is safer than trusting a spoofed header.
 */
export const THROTTLE_TTL_MS = 60_000;
export const THROTTLE_LIMIT = 120;

export const GlobalThrottlerModule = ThrottlerModule.forRoot([
  {
    name: 'default',
    ttl: THROTTLE_TTL_MS,
    limit: THROTTLE_LIMIT,
  },
]);
