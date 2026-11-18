import { Inject, Injectable, UnauthorizedException } from '@nestjs/common';
import {
  TOKEN_VERIFIER,
  type AuthenticatedUser,
  type TokenVerifier,
} from './auth.types.js';
import { UsersService } from './users.service.js';

@Injectable()
export class AuthService {
  constructor(
    @Inject(TOKEN_VERIFIER) private readonly tokenVerifier: TokenVerifier,
    private readonly usersService: UsersService,
  ) {}

  async authenticate(accessToken: string): Promise<AuthenticatedUser> {
    if (!accessToken || accessToken.trim().length === 0) {
      throw new UnauthorizedException({
        message: 'Missing access token',
        code: 'UNAUTHORIZED',
      });
    }

    const identity = await this.tokenVerifier.verify(accessToken.trim());
    return this.usersService.ensureProfile(identity);
  }
}
