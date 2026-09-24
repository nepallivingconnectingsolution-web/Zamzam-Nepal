import { Inject, Injectable, type CanActivate, type ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { eq } from 'drizzle-orm';
import type { Request } from 'express';
import { ROLES_KEY } from '../decorators/roles.decorator';
import { ALLOW_PENDING_KEY } from '../decorators/allow-pending.decorator';
import { apiError } from '../exceptions';
import { DATABASE_CONNECTION, type Database } from '../../database/database.module';
import { users, type Role } from '../../database/schema';
import type { AuthenticatedUser } from '../../modules/auth/jwt.strategy';

/**
 * Business partners who may sign in while their account is still awaiting
 * approval, so they can upload verification documents. Drivers are not listed:
 * their access is gated by DriverEligibilityService and the onboarding flow.
 */
export const BUSINESS_PARTNER_ROLES: readonly Role[] = ['hotel', 'restaurant', 'grocery', 'bus_operator', 'freight'];

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
 *
 * It also holds the line for unapproved business partners: they can hold a
 * session (to upload documents) but every role-gated route is closed to them
 * with 'PARTNER_NOT_APPROVED' unless it is marked @AllowPending().
 */
@Injectable()
export class RolesGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    @Inject(DATABASE_CONNECTION) private readonly db: Database,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
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

    if (BUSINESS_PARTNER_ROLES.includes(user.role)) {
      const allowPending = this.reflector.getAllAndOverride<boolean>(ALLOW_PENDING_KEY, [
        context.getHandler(),
        context.getClass(),
      ]);
      if (!allowPending) {
        // The JWT does not carry kycStatus, so read the live value: approval
        // and suspension must take effect on the very next request.
        const [row] = await this.db
          .select({ kycStatus: users.kycStatus })
          .from(users)
          .where(eq(users.id, user.id))
          .limit(1);
        if (row?.kycStatus !== 'APPROVED') {
          apiError(
            403,
            row?.kycStatus === 'SUSPENDED'
              ? 'This account has been suspended. Contact support for help.'
              : 'Your business is awaiting verification. Upload your documents and wait for approval.',
            'PARTNER_NOT_APPROVED',
          );
        }
      }
    }
    return true;
  }
}
