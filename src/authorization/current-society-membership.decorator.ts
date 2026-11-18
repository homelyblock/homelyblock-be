import {
  createParamDecorator,
  ExecutionContext,
  ForbiddenException,
} from '@nestjs/common';
import type { Request } from 'express';
import type { AuthorizedSocietyMembership } from './authorization.service.js';

type AuthorizedRequest = Request & {
  societyMembership?: AuthorizedSocietyMembership;
};

/**
 * Reads the society membership attached by AuthorizationGuard after a
 * successful society-scoped role check.
 */
export const CurrentSocietyMembership = createParamDecorator(
  (_data: unknown, context: ExecutionContext): AuthorizedSocietyMembership => {
    const request = context.switchToHttp().getRequest<AuthorizedRequest>();
    if (!request.societyMembership) {
      throw new ForbiddenException({
        message: 'Society membership is not available on this request',
        code: 'FORBIDDEN',
      });
    }
    return request.societyMembership;
  },
);
