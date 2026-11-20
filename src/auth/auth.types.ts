export type VerifiedAccessToken = {
  sub: string;
  email?: string;
  /**
   * True only when the access token itself says the email is verified.
   * Account linking must not treat a matching address as proof of ownership.
   */
  emailVerified: boolean;
  displayName: string;
  role?: string;
  expiresAt?: number;
};

import type { PlatformRole } from '../generated/prisma/client.js';

export type AuthenticatedUser = {
  id: string;
  email?: string;
  displayName: string;
  /** From `user_profiles.platform_role` only — never from the client. */
  platformRole: PlatformRole | null;
};

export const TOKEN_VERIFIER = Symbol('TOKEN_VERIFIER');

export interface TokenVerifier {
  verify(accessToken: string): Promise<VerifiedAccessToken>;
}
