import { readAppConfig } from './env.validation.js';

describe('readAppConfig', () => {
  it('uses local defaults when optional values are absent', () => {
    const config = readAppConfig({});

    expect(config.nodeEnv).toBe('development');
    expect(config.port).toBe(4000);
    expect(config.apiPrefix).toBe('api/v1');
    expect(config.corsOrigins).toEqual(['http://localhost:3000']);
    expect(config.databaseUrl).toBeUndefined();
    expect(config.supabaseUrl).toBeUndefined();
    expect(config.supabaseAnonKey).toBeUndefined();
    expect(config.supabaseServiceRoleKey).toBeUndefined();
    expect(config.supabaseJwtSecret).toBeUndefined();
    expect(config.supabaseJwksUrl).toBeUndefined();
    expect(config.trustedProxyHops).toBe(0);
  });

  it('accepts a fixed proxy hop count and rejects spoofable values', () => {
    expect(readAppConfig({ TRUSTED_PROXY_HOPS: '1' }).trustedProxyHops).toBe(1);
    expect(() => readAppConfig({ TRUSTED_PROXY_HOPS: 'true' })).toThrow(
      /TRUSTED_PROXY_HOPS/,
    );
    expect(() => readAppConfig({ TRUSTED_PROXY_HOPS: '6' })).toThrow(
      /TRUSTED_PROXY_HOPS/,
    );
  });

  it('normalizes the API prefix and accepts paired Supabase settings', () => {
    const config = readAppConfig({
      NODE_ENV: 'test',
      PORT: '4000',
      API_PREFIX: '/api/v1/',
      CORS_ORIGINS: 'http://localhost:3000, https://app.example.com',
      DATABASE_URL: 'postgresql://user:password@localhost:5432/livingspace',
      SUPABASE_URL: 'https://example.supabase.co',
      SUPABASE_ANON_KEY: 'public-anon-key',
      SUPABASE_SERVICE_ROLE_KEY: 'service-role-key',
    });

    expect(config.nodeEnv).toBe('test');
    expect(config.apiPrefix).toBe('api/v1');
    expect(config.corsOrigins).toEqual([
      'http://localhost:3000',
      'https://app.example.com',
    ]);
    expect(config.databaseUrl).toBe(
      'postgresql://user:password@localhost:5432/livingspace',
    );
    expect(config.supabaseUrl).toBe('https://example.supabase.co');
    expect(config.supabaseServiceRoleKey).toBe('service-role-key');
  });

  it('rejects an invalid port', () => {
    expect(() => readAppConfig({ PORT: '0' })).toThrow(/PORT/);
  });

  it('rejects a non-PostgreSQL database URL', () => {
    expect(() =>
      readAppConfig({ DATABASE_URL: 'mysql://localhost/livingspace' }),
    ).toThrow(/DATABASE_URL/);
  });

  it('rejects a Supabase URL without its anon key', () => {
    expect(() =>
      readAppConfig({ SUPABASE_URL: 'https://example.supabase.co' }),
    ).toThrow(/SUPABASE_URL and SUPABASE_ANON_KEY/);
  });

  it('requires database, supabase, and explicit CORS in production', () => {
    expect(() =>
      readAppConfig({
        NODE_ENV: 'production',
        CORS_ORIGINS: 'https://app.example.com',
        SUPABASE_URL: 'https://example.supabase.co',
        SUPABASE_ANON_KEY: 'anon',
      }),
    ).toThrow(/DATABASE_URL/);

    expect(() =>
      readAppConfig({
        NODE_ENV: 'production',
        DATABASE_URL: 'postgresql://user:password@localhost:5432/livingspace',
        CORS_ORIGINS: 'https://app.example.com',
      }),
    ).toThrow(/SUPABASE_URL and SUPABASE_ANON_KEY/);

    expect(() =>
      readAppConfig({
        NODE_ENV: 'production',
        DATABASE_URL: 'postgresql://user:password@localhost:5432/livingspace',
        SUPABASE_URL: 'https://example.supabase.co',
        SUPABASE_ANON_KEY: 'anon',
      }),
    ).toThrow(/CORS_ORIGINS must be set explicitly/);

    expect(() =>
      readAppConfig({
        NODE_ENV: 'production',
        DATABASE_URL: 'postgresql://user:password@db.example:5432/livingspace',
        SUPABASE_URL: 'https://example.supabase.co',
        SUPABASE_ANON_KEY: 'anon',
        CORS_ORIGINS: 'http://localhost:3000',
      }),
    ).toThrow(/must not include localhost/);

    expect(() =>
      readAppConfig({
        NODE_ENV: 'production',
        DATABASE_URL: 'postgresql://user:password@db.example:5432/livingspace',
        SUPABASE_URL: 'https://example.supabase.co',
        SUPABASE_ANON_KEY: 'anon',
        CORS_ORIGINS: 'https://app.example.com',
      }),
    ).toThrow(/SIGNUP_INTENT_SECRET/);

    expect(() =>
      readAppConfig({
        NODE_ENV: 'production',
        DATABASE_URL: 'postgresql://user:password@db.example:5432/livingspace',
        SUPABASE_URL: 'https://example.supabase.co',
        SUPABASE_ANON_KEY: 'anon',
        CORS_ORIGINS: 'https://app.example.com',
        SIGNUP_INTENT_SECRET: 'too-short',
      }),
    ).toThrow(/SIGNUP_INTENT_SECRET/);

    const config = readAppConfig({
      NODE_ENV: 'production',
      DATABASE_URL: 'postgresql://user:password@db.example:5432/livingspace',
      SUPABASE_URL: 'https://example.supabase.co',
      SUPABASE_ANON_KEY: 'anon',
      CORS_ORIGINS: 'https://app.example.com',
      SIGNUP_INTENT_SECRET: 'signup-intent-secret',
    });
    expect(config.nodeEnv).toBe('production');
    expect(config.signupIntentSecret).toBe('signup-intent-secret');
    expect(config.supportEmail).toBeUndefined();
  });

  it('requires the contact mail settings as a complete set', () => {
    expect(() =>
      readAppConfig({
        SUPPORT_EMAIL: 'support@example.com',
      }),
    ).toThrow(/SUPPORT_EMAIL, MAIL_FROM, and RESEND_API_KEY/);

    expect(() =>
      readAppConfig({
        SUPPORT_EMAIL: 'not-an-email',
        MAIL_FROM: 'LivingSpace <mail@example.com>',
        RESEND_API_KEY: 're_test_key',
      }),
    ).toThrow(/SUPPORT_EMAIL must be an email address/);

    const config = readAppConfig({
      SUPPORT_EMAIL: 'support@example.com',
      MAIL_FROM: 'mail@example.com',
      RESEND_API_KEY: 're_test_key',
    });
    expect(config.supportEmail).toBe('support@example.com');
    expect(config.mailFrom).toBe('mail@example.com');
    expect(config.resendApiKey).toBe('re_test_key');
  });
});
