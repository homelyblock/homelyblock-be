import { UnauthorizedException } from '@nestjs/common';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthService } from './auth.service.js';
import type {
  AuthenticatedUser,
  TokenVerifier,
  VerifiedAccessToken,
} from './auth.types.js';
import { UsersService } from './users.service.js';

describe('AuthService', () => {
  const verify = vi.fn();
  const ensureProfile = vi.fn();
  let service: AuthService;

  beforeEach(() => {
    verify.mockReset();
    ensureProfile.mockReset();
    service = new AuthService(
      { verify } as unknown as TokenVerifier,
      { ensureProfile } as unknown as UsersService,
    );
  });

  it('rejects a missing access token', async () => {
    await expect(service.authenticate('')).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
    expect(verify).not.toHaveBeenCalled();
  });

  it('verifies the token and synchronizes the local profile', async () => {
    const identity: VerifiedAccessToken = {
      sub: '11111111-1111-1111-1111-111111111111',
      email: 'resident@example.com',
      displayName: 'Resident',
    };
    const user: AuthenticatedUser = {
      id: identity.sub,
      email: identity.email,
      displayName: 'Resident',
      platformRole: null,
    };
    verify.mockResolvedValue(identity);
    ensureProfile.mockResolvedValue(user);

    await expect(service.authenticate(' access-token ')).resolves.toEqual(user);
    expect(verify).toHaveBeenCalledWith('access-token');
    expect(ensureProfile).toHaveBeenCalledWith(identity);
  });
});
