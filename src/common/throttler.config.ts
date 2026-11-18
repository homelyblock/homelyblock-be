import { ThrottlerModule } from '@nestjs/throttler';

/**
 * Global request throttling for abuse-prone routes.
 * Auth still relies on JWT verification; this only limits request volume.
 *
 * Tracker key uses Express `req.ip`. Because `trust proxy` is not enabled in
 * configureApp, client-supplied `X-Forwarded-For` is ignored. Behind a reverse
 * proxy, all clients may share the proxy IP for throttling — safer for a pilot
 * than trusting spoofable forwarded headers.
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
