import { UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SignJWT } from 'jose';
import { describe, expect, it } from 'vitest';
import { SupabaseTokenVerifier } from './supabase-token.verifier.js';

const secret = new TextEncoder().encode('test-supabase-jwt-secret-value');
const issuer = 'https://example.supabase.co/auth/v1';

async function signToken(
  claims: Record<string, unknown>,
  options?: { expiresIn?: string | number; secretOverride?: Uint8Array },
): Promise<string> {
  const subject =
    typeof claims.sub === 'string'
      ? claims.sub
      : '11111111-1111-1111-1111-111111111111';

  let builder = new SignJWT(claims)
    .setProtectedHeader({ alg: 'HS256', typ: 'JWT' })
    .setSubject(subject)
    .setIssuer(issuer)
    .setAudience('authenticated')
    .setIssuedAt();

  if (options?.expiresIn !== undefined) {
    builder = builder.setExpirationTime(options.expiresIn);
  } else {
    builder = builder.setExpirationTime('2h');
  }

  return builder.sign(options?.secretOverride ?? secret);
}

function createVerifier(
  env: Record<string, string | undefined> = {
    SUPABASE_URL: 'https://example.supabase.co',
    SUPABASE_JWT_SECRET: 'test-supabase-jwt-secret-value',
    SUPABASE_JWT_ISSUER: issuer,
  },
): SupabaseTokenVerifier {
  return new SupabaseTokenVerifier({
    get: (key: string) => env[key],
  } as ConfigService);
}

describe('SupabaseTokenVerifier', () => {
  it('accepts a valid HS256 access token', async () => {
    const verifier = createVerifier();
    const token = await signToken({
      sub: '11111111-1111-1111-1111-111111111111',
      email: 'resident@example.com',
      role: 'authenticated',
      user_metadata: { full_name: 'Resident One' },
    });

    await expect(verifier.verify(token)).resolves.toMatchObject({
      sub: '11111111-1111-1111-1111-111111111111',
      email: 'resident@example.com',
      emailVerified: false,
      displayName: 'Resident One',
      role: 'authenticated',
    });
  });

  it('reads a verified-email claim', async () => {
    const verifier = createVerifier();
    const token = await signToken({
      sub: '11111111-1111-1111-1111-111111111111',
      email: 'resident@example.com',
      email_verified: true,
    });

    await expect(verifier.verify(token)).resolves.toMatchObject({
      emailVerified: true,
    });
  });

  it('rejects an expired token', async () => {
    const verifier = createVerifier();
    const token = await signToken(
      {
        sub: '11111111-1111-1111-1111-111111111111',
        email: 'resident@example.com',
      },
      { expiresIn: 0 },
    );

    await expect(verifier.verify(token)).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });

  it('rejects a token with an invalid signature', async () => {
    const verifier = createVerifier();
    const token = await signToken(
      {
        sub: '11111111-1111-1111-1111-111111111111',
        email: 'resident@example.com',
      },
      {
        secretOverride: new TextEncoder().encode('different-secret-value'),
      },
    );

    await expect(verifier.verify(token)).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });

  it('rejects verification when auth is not configured', async () => {
    const verifier = createVerifier({});

    await expect(verifier.verify('any-token')).rejects.toMatchObject({
      response: expect.objectContaining({
        code: 'UNAUTHORIZED',
      }),
    });
  });
});
