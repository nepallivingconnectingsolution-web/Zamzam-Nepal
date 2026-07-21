import { Injectable, type CanActivate, type ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import { ROLES_KEY } from '../decorators/roles.decorator';
import { apiError } from '../exceptions';
import type { Role } from '../../database/schema';
import type { AuthenticatedUser } from '../../modules/auth/jwt.strategy';

/**
 * Enforces @Roles(...) metadata against the JWT's role claim. This is the
 * server-side half of the frontend's RequireRole component — the comment
 * in RequireRole.tsx says it explicitly: "every role-gated API call would
 * 403, because the RolesGuard on the server checks the token's real role".
 * This class is that guard.
 *
 * Tagged with code: 'ROLE_MISMATCH' (rather than a bare ForbiddenException)
 * so the client can tell this specific case apart from an ordinary 403 and
 * treat it as a stale/crossed session — see api/client.ts's handling of
 * this code — instead of leaving the person stuck on a page that will
 * never succeed no matter how many times they retry.
 */
@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const requiredRoles = this.reflector.getAllAndOverride<Role[]>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (!requiredRoles || requiredRoles.length === 0) return true;

    const request = context.switchToHttp().getRequest<Request & { user: AuthenticatedUser }>();
    const user = request.user;

    if (!user || !requiredRoles.includes(user.role)) {
      apiError(403, 'You do not have access to this resource.', 'ROLE_MISMATCH');
    }
    return true;
  }
}