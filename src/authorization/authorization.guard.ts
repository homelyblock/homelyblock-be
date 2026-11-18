import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import type { AuthenticatedUser } from '../auth/auth.types.js';
import {
  REQUIRE_PLATFORM_ROLES_KEY,
  REQUIRE_SOCIETY_ROLES_KEY,
  type RequirePlatformRolesMetadata,
  type RequireSocietyRolesMetadata,
} from './authorization.constants.js';
import {
  AuthorizationService,
  type AuthorizedSocietyMembership,
} from './authorization.service.js';

type AuthorizedRequest = Request & {
  user?: AuthenticatedUser;
  societyMembership?: AuthorizedSocietyMembership;
};

@Injectable()
export class AuthorizationGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly authorizationService: AuthorizationService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const platformMeta = this.reflector.getAllAndOverride<
      RequirePlatformRolesMetadata | undefined
    >(REQUIRE_PLATFORM_ROLES_KEY, [context.getHandler(), context.getClass()]);

    const societyMeta = this.reflector.getAllAndOverride<
      RequireSocietyRolesMetadata | undefined
    >(REQUIRE_SOCIETY_ROLES_KEY, [context.getHandler(), context.getClass()]);

    if (!platformMeta && !societyMeta) {
      return true;
    }

    const request = context.switchToHttp().getRequest<AuthorizedRequest>();
    const user = request.user;

    if (!user) {
      throw new UnauthorizedException({
        message: 'Authentication is required before authorization',
        code: 'UNAUTHORIZED',
      });
    }

    if (platformMeta) {
      this.authorizationService.assertPlatformRoles(user, platformMeta.roles);
    }

    if (societyMeta) {
      const societyId = request.params?.[societyMeta.societyIdParam];
      if (typeof societyId !== 'string' || societyId.trim().length === 0) {
        throw new ForbiddenException({
          message: `Missing society id route parameter "${societyMeta.societyIdParam}"`,
          code: 'FORBIDDEN',
        });
      }

      request.societyMembership =
        await this.authorizationService.assertSocietyRoles(
          user.id,
          societyId,
          societyMeta.roles,
        );
    }

    return true;
  }
}
