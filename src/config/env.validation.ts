import { invitationTtlDays } from '../memberships/invitation-policy.js';

export type AppConfig = {
  nodeEnv: 'development' | 'test' | 'production';
  port: number;
  apiPrefix: string;
  corsOrigins: string[];
  databaseUrl?: string;
  supabaseUrl?: string;
  supabaseAnonKey?: string;
  supabaseServiceRoleKey?: string;
  supabaseJwtIssuer?: string;
  supabaseJwtSecret?: string;
  supabaseJwksUrl?: string;
  signupIntentSecret?: string;
  supportEmail?: string;
  mailFrom?: string;
  resendApiKey?: string;
  /**
   * Number of reverse proxies Express may trust. 0 leaves `trust proxy` off,
   * so client-supplied X-Forwarded-For is ignored.
   */
  trustedProxyHops: number;
  /** Production Swagger stays off unless this is explicitly true. */
  swaggerEnabled: boolean;
};

const DEFAULT_NODE_ENV = 'development';
const DEFAULT_PORT = 4000;
const DEFAULT_API_PREFIX = 'api/v1';
const DEFAULT_CORS_ORIGINS = 'http://localhost:3000';

export function readAppConfig(env: Record<string, unknown>): AppConfig {
  const nodeEnv = parseNodeEnv(env.NODE_ENV);
  const port = parsePort(env.PORT);
  const apiPrefix = parseApiPrefix(env.API_PREFIX);
  const corsOrigins = parseCorsOrigins(env.CORS_ORIGINS);
  const databaseUrl = parseDatabaseUrl(env.DATABASE_URL);
  const supabaseUrl = parseHttpUrl('SUPABASE_URL', env.SUPABASE_URL);
  const supabaseAnonKey = optionalString(env.SUPABASE_ANON_KEY);
  const supabaseServiceRoleKey = optionalString(env.SUPABASE_SERVICE_ROLE_KEY);
  const supabaseJwtIssuer = optionalString(env.SUPABASE_JWT_ISSUER);
  const supabaseJwtSecret = optionalString(env.SUPABASE_JWT_SECRET);
  const supabaseJwksUrl = parseHttpUrl(
    'SUPABASE_JWKS_URL',
    env.SUPABASE_JWKS_URL,
  );
  const signupIntentSecret = optionalString(env.SIGNUP_INTENT_SECRET);
  const supportEmail = optionalEmail('SUPPORT_EMAIL', env.SUPPORT_EMAIL);
  const mailFrom = optionalEmail('MAIL_FROM', env.MAIL_FROM);
  const resendApiKey = optionalString(env.RESEND_API_KEY);
  const trustedProxyHops = parseTrustedProxyHops(env.TRUSTED_PROXY_HOPS);
  const swaggerEnabled = parseSwaggerEnabled(env.SWAGGER_ENABLED);
  invitationTtlDays(env.INVITATION_TTL_DAYS);
  assertMailConfig(supportEmail, mailFrom, resendApiKey);

  if (Boolean(supabaseUrl) !== Boolean(supabaseAnonKey)) {
    throw new Error(
      'SUPABASE_URL and SUPABASE_ANON_KEY must both be set, or both left unset',
    );
  }

  if (supabaseServiceRoleKey && !supabaseUrl) {
    throw new Error(
      'SUPABASE_SERVICE_ROLE_KEY requires SUPABASE_URL and SUPABASE_ANON_KEY',
    );
  }

  if (supabaseJwksUrl && !supabaseUrl && !supabaseJwtSecret) {
    throw new Error(
      'SUPABASE_JWKS_URL requires SUPABASE_URL or SUPABASE_JWT_SECRET',
    );
  }

  if (nodeEnv === 'production') {
    if (!databaseUrl) {
      throw new Error('DATABASE_URL is required when NODE_ENV=production');
    }
    if (!supabaseUrl || !supabaseAnonKey) {
      throw new Error(
        'SUPABASE_URL and SUPABASE_ANON_KEY are required when NODE_ENV=production',
      );
    }
    if (!optionalString(env.CORS_ORIGINS)) {
      throw new Error(
        'CORS_ORIGINS must be set explicitly when NODE_ENV=production (do not rely on localhost defaults)',
      );
    }
    for (const origin of corsOrigins) {
      if (origin.includes('localhost') || origin.includes('127.0.0.1')) {
        throw new Error(
          'CORS_ORIGINS must not include localhost when NODE_ENV=production',
        );
      }
    }
    if (!signupIntentSecret || signupIntentSecret.length < 16) {
      throw new Error(
        'SIGNUP_INTENT_SECRET must be at least 16 characters when NODE_ENV=production',
      );
    }
  }

  return {
    nodeEnv,
    port,
    apiPrefix,
    corsOrigins,
    databaseUrl,
    supabaseUrl,
    supabaseAnonKey,
    supabaseServiceRoleKey,
    supabaseJwtIssuer,
    supabaseJwtSecret,
    supabaseJwksUrl,
    signupIntentSecret,
    supportEmail,
    mailFrom,
    resendApiKey,
    trustedProxyHops,
    swaggerEnabled,
  };
}

export function validateEnv(
  env: Record<string, unknown>,
): Record<string, unknown> {
  const config = readAppConfig(env);

  return {
    ...env,
    NODE_ENV: config.nodeEnv,
    PORT: String(config.port),
    API_PREFIX: config.apiPrefix,
    CORS_ORIGINS: config.corsOrigins.join(','),
  };
}

function optionalString(value: unknown): string | undefined {
  if (value === undefined || value === null) {
    return undefined;
  }

  if (typeof value !== 'string') {
    throw new Error('Environment values must be strings');
  }

  const trimmed = value.trim();
  return trimmed.length === 0 ? undefined : trimmed;
}

function parseSwaggerEnabled(value: unknown): boolean {
  const raw = optionalString(value);
  if (!raw) {
    return false;
  }
  if (raw === 'true') {
    return true;
  }
  if (raw === 'false') {
    return false;
  }
  throw new Error('SWAGGER_ENABLED must be true or false');
}

function parseNodeEnv(value: unknown): 'development' | 'test' | 'production' {
  const raw = optionalString(value) ?? DEFAULT_NODE_ENV;

  if (raw === 'development' || raw === 'test' || raw === 'production') {
    return raw;
  }

  throw new Error('NODE_ENV must be development, test, or production');
}

function parsePort(value: unknown): number {
  const raw = optionalString(value);
  if (!raw) {
    return DEFAULT_PORT;
  }

  if (!/^\d+$/.test(raw)) {
    throw new Error('PORT must be an integer');
  }

  const port = Number(raw);
  if (port < 1 || port > 65535) {
    throw new Error('PORT must be between 1 and 65535');
  }

  return port;
}

function parseApiPrefix(value: unknown): string {
  const raw = optionalString(value) ?? DEFAULT_API_PREFIX;
  const normalized = raw.replace(/^\/+|\/+$/g, '');

  if (!/^api\/v\d+$/.test(normalized)) {
    throw new Error('API_PREFIX must look like api/v1');
  }

  return normalized;
}

function parseCorsOrigins(value: unknown): string[] {
  const raw = optionalString(value) ?? DEFAULT_CORS_ORIGINS;
  const origins = raw
    .split(',')
    .map((origin) => origin.trim())
    .filter((origin) => origin.length > 0);

  if (origins.length === 0) {
    throw new Error('CORS_ORIGINS must include at least one origin');
  }

  return origins.map((origin) => {
    const url = parseUrl('CORS origin', origin);
    if (url.username || url.password) {
      throw new Error('CORS origins must not include credentials');
    }
    if (url.pathname !== '/' || url.search || url.hash) {
      throw new Error(
        `CORS origin must be an origin without a path: ${origin}`,
      );
    }
    if (url.protocol !== 'http:' && url.protocol !== 'https:') {
      throw new Error(`CORS origin must use http or https: ${origin}`);
    }
    return url.origin;
  });
}

function parseDatabaseUrl(value: unknown): string | undefined {
  const raw = optionalString(value);
  if (!raw) {
    return undefined;
  }

  const url = parseUrl('DATABASE_URL', raw);
  if (url.protocol !== 'postgresql:' && url.protocol !== 'postgres:') {
    throw new Error('DATABASE_URL must use the postgresql protocol');
  }

  return raw;
}

function parseHttpUrl(name: string, value: unknown): string | undefined {
  const raw = optionalString(value);
  if (!raw) {
    return undefined;
  }

  const url = parseUrl(name, raw);
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new Error(`${name} must use http or https`);
  }

  return raw;
}

function optionalEmail(name: string, value: unknown): string | undefined {
  const raw = optionalString(value);
  if (!raw) {
    return undefined;
  }

  if (raw.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(raw)) {
    throw new Error(`${name} must be an email address`);
  }

  return raw;
}

function assertMailConfig(
  supportEmail: string | undefined,
  mailFrom: string | undefined,
  resendApiKey: string | undefined,
): void {
  const configured = [supportEmail, mailFrom, resendApiKey].filter(
    (value) => value !== undefined,
  ).length;

  if (configured !== 0 && configured !== 3) {
    throw new Error(
      'SUPPORT_EMAIL, MAIL_FROM, and RESEND_API_KEY must all be set, or all left unset',
    );
  }

  if (resendApiKey && resendApiKey.length < 8) {
    throw new Error('RESEND_API_KEY is too short');
  }
}

function parseTrustedProxyHops(value: unknown): number {
  const raw = optionalString(value);
  if (!raw || raw === '0') return 0;
  if (!/^\d+$/.test(raw)) {
    throw new Error(
      'TRUSTED_PROXY_HOPS must be a whole number. Use 0 unless the process is reachable only through a known reverse proxy.',
    );
  }
  const hops = Number(raw);
  if (hops < 0 || hops > 5) {
    throw new Error('TRUSTED_PROXY_HOPS must be from 0 to 5');
  }
  return hops;
}

function parseUrl(name: string, value: string): URL {
  try {
    return new URL(value);
  } catch {
    throw new Error(`${name} must be a valid URL`);
  }
}
