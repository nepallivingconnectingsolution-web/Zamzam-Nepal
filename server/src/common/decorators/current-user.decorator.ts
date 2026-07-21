import { createParamDecorator, type ExecutionContext } from '@nestjs/common';
import type { Request } from 'express';
import type { AuthenticatedUser } from '../../modules/auth/jwt.strategy';

/**
 * Pulls the authenticated user (attached by JwtAuthGuard/JwtStrategy) off
 * the request. Usage: `@CurrentUser() user: AuthenticatedUser`.
 */
export const CurrentUser = createParamDecorator((_: unknown, ctx: ExecutionContext): AuthenticatedUser => {
  const request = ctx.switchToHttp().getRequest<Request & { user: AuthenticatedUser }>();
  return request.user;
});
