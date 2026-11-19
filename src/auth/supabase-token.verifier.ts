import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  createRemoteJWKSet,
  jwtVerify,
  type JWTPayload,
  type JWTVerifyGetKey,
} from 'jose';
import type { TokenVerifier, VerifiedAccessToken } from './auth.types.js';

@Injectable()
export class SupabaseTokenVerifier implements TokenVerifier {
  private readonly issuer?: string;
  private readonly audience = 'authenticated';
  private readonly jwks?: JWTVerifyGetKey;
  private readonly jwtSecret?: Uint8Array;
  private readonly configured: boolean;

  constructor(configService: ConfigService) {
    const supabaseUrl = configService.get<string>('SUPABASE_URL')?.trim();
    const jwtSecret = configService.get<string>('SUPABASE_JWT_SECRET')?.trim();

    if (!supabaseUrl && !jwtSecret) {
      this.configured = false;
      return;
    }

    this.configured = true;
    this.issuer =
      configService.get<string>('SUPABASE_JWT_ISSUER')?.trim() ||
      (supabaseUrl ? `${supabaseUrl.replace(/\/$/, '')}/auth/v1` : undefined);

    if (jwtSecret) {
      this.jwtSecret = new TextEncoder().encode(jwtSecret);
      return;
    }

    const jwksUrl =
      configService.get<string>('SUPABASE_JWKS_URL')?.trim() ||
      `${supabaseUrl!.replace(/\/$/, '')}/auth/v1/.well-known/jwks.json`;
    this.jwks = createRemoteJWKSet(new URL(jwksUrl));
  }

  async verify(accessToken: string): Promise<VerifiedAccessToken> {
    if (!this.configured) {
      throw new UnauthorizedException({
        message: 'Authentication is not configured on the server',
        code: 'UNAUTHORIZED',
      });
    }

    try {
      const verifyOptions = {
        issuer: this.issuer,
        audience: this.audience,
      };

      const { payload } = this.jwtSecret
        ? await jwtVerify(accessToken, this.jwtSecret, {
            ...verifyOptions,
            algorithms: ['HS256'],
          })
        : await jwtVerify(accessToken, this.jwks!, {
            ...verifyOptions,
            algorithms: ['ES256', 'RS256'],
          });

      return this.toVerifiedToken(payload);
    } catch (error) {
      if (error instanceof UnauthorizedException) {
        throw error;
      }
      throw new UnauthorizedException({
        message: 'Invalid or expired access token',
        code: 'UNAUTHORIZED',
      });
    }
  }

  private toVerifiedToken(payload: JWTPayload): VerifiedAccessToken {
    if (typeof payload.sub !== 'string' || payload.sub.length === 0) {
      throw new UnauthorizedException({
        message: 'Access token is missing a subject claim',
        code: 'UNAUTHORIZED',
      });
    }

    const metadata =
      typeof payload.user_metadata === 'object' && payload.user_metadata
        ? (payload.user_metadata as Record<string, unknown>)
        : {};

    const displayNameCandidate =
      (typeof metadata.full_name === 'string' && metadata.full_name) ||
      (typeof metadata.name === 'string' && metadata.name) ||
      (typeof payload.email === 'string' && payload.email) ||
      'HomelyBlock user';

    return {
      sub: payload.sub,
      email: typeof payload.email === 'string' ? payload.email : undefined,
      displayName: displayNameCandidate.trim() || 'HomelyBlock user',
      role: typeof payload.role === 'string' ? payload.role : undefined,
      expiresAt: typeof payload.exp === 'number' ? payload.exp : undefined,
    };
  }
}
