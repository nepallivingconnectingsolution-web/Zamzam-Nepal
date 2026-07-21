import { SetMetadata } from '@nestjs/common';
import type { Role } from '../../database/schema';

export const ROLES_KEY = 'roles';

/**
 * Restricts a route to the given customer-facing role(s). Must be combined
 * with JwtAuthGuard (which populates `request.user`) — apply both via
 * `@UseGuards(JwtAuthGuard, RolesGuard)`.
 */
export const Roles = (...roles: Role[]) => SetMetadata(ROLES_KEY, roles);
