import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import type { Request } from 'express';
import { AuthService } from './auth.service.js';
import type { AuthenticatedUser } from './auth.types.js';

type AuthenticatedRequest = Request & {
  user?: AuthenticatedUser;
};

@Injectable()
export class AuthGuard implements CanActivate {
  constructor(private readonly authService: AuthService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const header = request.headers.authorization;

    if (!header) {
      throw new UnauthorizedException({
        message: 'Missing authorization header',
        code: 'UNAUTHORIZED',
      });
    }

    const [scheme, token] = header.split(' ');
    if (scheme !== 'Bearer' || !token) {
      throw new UnauthorizedException({
        message: 'Authorization header must use Bearer token format',
        code: 'UNAUTHORIZED',
      });
    }

    request.user = await this.authService.authenticate(token);
    return true;
  }
}
