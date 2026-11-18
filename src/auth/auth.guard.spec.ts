import { ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthGuard } from './auth.guard.js';
import { AuthService } from './auth.service.js';
import type { AuthenticatedUser } from './auth.types.js';

describe('AuthGuard', () => {
  const authenticate = vi.fn();
  let guard: AuthGuard;

  beforeEach(() => {
    authenticate.mockReset();
    guard = new AuthGuard({
      authenticate,
    } as unknown as AuthService);
  });

  function createContext(authorization?: string): {
    context: ExecutionContext;
    request: { headers: { authorization?: string }; user?: AuthenticatedUser };
  } {
    const request: {
      headers: { authorization?: string };
      user?: AuthenticatedUser;
    } = {
      headers: { authorization },
    };

    return {
      request,
      context: {
        switchToHttp: () => ({
          getRequest: () => request,
        }),
      } as ExecutionContext,
    };
  }

  it('rejects a missing authorization header', async () => {
    const { context } = createContext();

    await expect(guard.canActivate(context)).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
    expect(authenticate).not.toHaveBeenCalled();
  });

  it('rejects a malformed bearer token', async () => {
    const { context } = createContext('Token abc');

    await expect(guard.canActivate(context)).rejects.toMatchObject({
      response: expect.objectContaining({
        message: 'Authorization header must use Bearer token format',
        code: 'UNAUTHORIZED',
      }),
    });
    expect(authenticate).not.toHaveBeenCalled();
  });

  it('attaches the authenticated user for a valid bearer token', async () => {
    const user: AuthenticatedUser = {
      id: '11111111-1111-1111-1111-111111111111',
      email: 'resident@example.com',
      displayName: 'Resident',
      platformRole: null,
    };
    authenticate.mockResolvedValue(user);
    const { context, request } = createContext('Bearer valid-token');

    await expect(guard.canActivate(context)).resolves.toBe(true);
    expect(authenticate).toHaveBeenCalledWith('valid-token');
    expect(request.user).toEqual(user);
  });
});
