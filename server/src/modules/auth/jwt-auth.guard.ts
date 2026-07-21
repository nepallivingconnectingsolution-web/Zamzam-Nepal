import { Injectable } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';

/**
 * Standard guard for any route requiring a logged-in user (any role).
 * Combine with RolesGuard + @Roles(...) to also restrict by role.
 */
@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {}
