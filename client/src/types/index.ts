/**
 * Shared frontend types. Role/kycStatus mirror the server's `role` and
 * `kyc_status` Postgres enums (see server/src/database/schema.ts) plus the
 * frontend-only "guest" role for signed-out visitors.
 */

export type Role =
  | "guest"
  | "customer"
  | "driver"
  | "bus_operator"
  | "freight"
  | "hotel"
  | "restaurant"
  | "grocery"
  | "admin";

export interface User {
  id: string;
  name: string;
  mobile: string;
  email: string;
  role: Role;
  avatarUrl: string | null;
  kycStatus: "PENDING" | "APPROVED" | "SUSPENDED";
}

/**
 * The contract every data surface maps its fetch outcome onto — see
 * hooks/useResource.ts for how these five states are derived.
 */
export type AsyncState = "idle" | "loading" | "success" | "empty" | "error";

/** One entry in the marketplace catalog (config/index.ts SERVICES). */
export interface ServiceVertical {
  id: string;
  name: string;
  tagline: string;
  group: string;
  icon: string;
  to: string;
  accent: string;
  live: boolean;
}

/** One sidebar link in a portal's nav (config/index.ts PORTAL_NAV). */
export interface NavItem {
  label: string;
  to: string;
  icon: string;
  badge?: string | number;
}