import { SetMetadata } from '@nestjs/common';

export const ALLOW_PENDING_KEY = 'allowPendingPartner';

/**
 * Marks a route (or a whole controller) as reachable by a business partner
 * whose account has not been approved yet.
 *
 * Business partners (hotel, restaurant, grocery, bus operator, freight) can
 * sign in straight after registering so they can upload their verification
 * documents. RolesGuard blocks them from everything else until a super admin
 * approves them, unless the route opts in with this decorator.
 */
export const AllowPending = () => SetMetadata(ALLOW_PENDING_KEY, true);
