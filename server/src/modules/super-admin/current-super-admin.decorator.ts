import { createParamDecorator, type ExecutionContext } from '@nestjs/common';
import type { Request } from 'express';
import type { AuthenticatedSuperAdmin } from './super-admin-jwt.strategy';

export const CurrentSuperAdmin = createParamDecorator(
  (_: unknown, ctx: ExecutionContext): AuthenticatedSuperAdmin => {
    const request = ctx.switchToHttp().getRequest<Request & { user: AuthenticatedSuperAdmin }>();
    return request.user;
  },
);
