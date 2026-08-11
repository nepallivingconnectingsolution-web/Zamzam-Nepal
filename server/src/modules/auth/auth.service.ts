import { ConflictException, Inject, Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcryptjs';
import { createHash } from 'crypto';
import { and, eq, lt } from 'drizzle-orm';
import { DATABASE_CONNECTION, type Database } from '../../database/database.module';
import { auditLogs, refreshTokens, superAdmins, users } from '../../database/schema';
import { id } from '../../common/id';
import { apiError } from '../../common/exceptions';
import type { RegisterDto, LoginDto } from './dto/auth.dto';
import type { Role } from '../../database/schema';
import { NotificationsService } from '../notifications/notifications.service';
import { PasswordResetService } from '../../common/password-reset/password-reset.service';


/** Deterministic hash for refresh-token storage — see refreshTokens in schema.ts for why not bcrypt. */
function sha256Hex(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

export interface PublicUser {
  id: string;
  name: string;
  mobile: string;
  email: string;
  role: Role;
  avatarUrl: string | null;
  kycStatus: 'PENDING' | 'APPROVED' | 'SUSPENDED';
}

const PARTNER_ROLES = ['driver', 'bus_operator', 'freight', 'hotel', 'restaurant', 'grocery'] as const;
const PARTNER_ROLE_LABELS: Record<typeof PARTNER_ROLES[number], string> = {
  driver: 'Driver',
  bus_operator: 'Bus Operator',
  freight: 'Freight',
  hotel: 'Hotel',
  restaurant: 'Restaurant',
  grocery: 'Grocery',
};

@Injectable()
export class AuthService {
  constructor(
    @Inject(DATABASE_CONNECTION) private readonly db: Database,
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
    private readonly notifications: NotificationsService,
    private readonly passwordReset: PasswordResetService,
  ) {}

  private toPublicUser(u: typeof users.$inferSelect): PublicUser {
    return {
      id: u.id,
      name: u.name,
      mobile: u.mobile,
      email: u.email,
      role: u.role,
      avatarUrl: u.avatarUrl,
      kycStatus: u.kycStatus,
    };
  }

private async issueTokens(userId: string, role: Role) {
    const accessToken = await this.jwt.signAsync(
      { sub: userId, role, type: 'access' },
      {
        secret: this.config.get<string>('JWT_ACCESS_SECRET'),
        expiresIn: this.config.get<string>('JWT_ACCESS_EXPIRES_IN'),
      },
    );

    // One refresh-token row per session (browser/device). jti ties the JWT
    // to its DB row so a login on one device never invalidates another.
    const jti = id('rt');
    const refreshToken = await this.jwt.signAsync(
      { sub: userId, role, type: 'refresh', jti },
      {
        secret: this.config.get<string>('JWT_REFRESH_SECRET'),
        expiresIn: this.config.get<string>('JWT_REFRESH_EXPIRES_IN'),
      },
    );

    const decoded = this.jwt.decode<{ exp?: number }>(refreshToken);
    const expiresAt = decoded?.exp ? new Date(decoded.exp * 1000) : new Date(Date.now() + 30 * 86_400_000);

    await this.db.insert(refreshTokens).values({
      id: jti,
      userId,
      tokenHash: sha256Hex(refreshToken),
      expiresAt,
    });

    // Housekeeping: drop this user's expired sessions so the table can't
    // grow unbounded from repeated logins.
    await this.db
      .delete(refreshTokens)
      .where(and(eq(refreshTokens.userId, userId), lt(refreshTokens.expiresAt, new Date())));

    return { accessToken, refreshToken };
  }

  async register(dto: RegisterDto) {
    const existing = await this.db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.email, dto.email))
      .limit(1);

    if (existing.length > 0) {
      throw new ConflictException('An account with this email already exists.');
    }

    const existingMobile = await this.db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.mobile, dto.mobile))
      .limit(1);

    if (existingMobile.length > 0) {
      throw new ConflictException('An account with this mobile number already exists.');
    }

    const isPartner = (PARTNER_ROLES as readonly string[]).includes(dto.role);
    const passwordHash = await bcrypt.hash(dto.password, 10);
    const newId = id('u');

    await this.db.insert(users).values({
      id: newId,
      name: dto.name,
      email: dto.email,
      mobile: dto.mobile,
      passwordHash,
      role: dto.role,
      kycStatus: isPartner ? 'PENDING' : 'APPROVED',
      profileComplete: false,
    });

    if (isPartner) {
  const roleLabel = PARTNER_ROLE_LABELS[dto.role as (typeof PARTNER_ROLES)[number]] ?? 'Partner';
  await this.notifications.notify({
    type: 'partner_registration',
    title: 'New partner registration',
    message: `${dto.name} registered as a ${roleLabel} and is awaiting KYC review.`,
    entityType: 'partner',
    entityId: newId,
  });

  return {
    registered: true as const,
    pending: true as const,
    message:
      "Registration submitted. Our team will review your business and notify you once it's approved.",
  };
}

    const [createdUser] = await this.db.select().from(users).where(eq(users.id, newId)).limit(1);
    const { accessToken, refreshToken } = await this.issueTokens(newId, dto.role);

    return {
      registered: true as const,
      accessToken,
      refreshToken,
      user: this.toPublicUser(createdUser),
      profileComplete: false,
    };
  }

  /**
   * Super admin signing in through the ordinary login form.
   *
   * Super admin is a separate identity: its own table, its own JWT secret, its
   * own guard. It stays that way — this only removes the requirement to know
   * the hidden /x-admin/login URL, so one set of credentials in one form is
   * enough. It is checked BEFORE the users lookup because the two tables are
   * independent and an address could in principle exist in both; the admin
   * identity wins.
   *
   * Returns null on any miss, including a super-admin email with the wrong
   * password. That case deliberately falls through to the normal user lookup
   * and ends at the standard "Invalid email or password.", so a wrong password
   * is indistinguishable from an address that isn't an admin — otherwise this
   * endpoint becomes an oracle for enumerating admin accounts.
   *
   * Inlined here rather than delegating to SuperAdminService: that service
   * pulls in notifications, password-reset and the whole super-admin module
   * graph, and importing it from AuthModule (which SuperAdminModule already
   * depends on) would be a circular dependency for the sake of twenty lines.
   */
  private async trySuperAdminLogin(dto: LoginDto) {
    const [admin] = await this.db
      .select()
      .from(superAdmins)
      .where(eq(superAdmins.email, dto.email))
      .limit(1);

    if (!admin || !(await bcrypt.compare(dto.password, admin.passwordHash))) return null;

    // Same payload shape and secret as SuperAdminService.login, so the token
    // this hands back is verified by the existing SuperAdminJwtStrategy with
    // no changes on the guard side.
    const accessToken = await this.jwt.signAsync(
      { sub: admin.id, type: 'super_admin_access' },
      {
        secret: this.config.get<string>('SUPER_ADMIN_JWT_SECRET'),
        expiresIn: this.config.get<string>('SUPER_ADMIN_JWT_EXPIRES_IN'),
      },
    );

    // Logged under the same action name as the dedicated endpoint: the audit
    // trail records that an admin signed in, not which form they used.
    await this.db.insert(auditLogs).values({
      id: id('audit'),
      actorId: admin.id,
      actorType: 'super_admin',
      action: 'super_admin.login',
      targetType: null,
      targetId: null,
    });

    return {
      superAdmin: true as const,
      accessToken,
      admin: { id: admin.id, name: admin.name, email: admin.email },
    };
  }

  async login(dto: LoginDto) {
    // No refresh token in this branch, matching the dedicated super-admin
    // endpoint: admin sessions are sessionStorage-scoped and expire with the
    // tab rather than renewing in the background.
    const superAdminSession = await this.trySuperAdminLogin(dto);
    if (superAdminSession) return superAdminSession;

    const [user] = await this.db.select().from(users).where(eq(users.email, dto.email)).limit(1);

    if (!user || !(await bcrypt.compare(dto.password, user.passwordHash))) {
      apiError(401, 'Invalid email or password.');
    }

    if (user.kycStatus === 'PENDING') {
      apiError(403, 'Your account is awaiting super-admin verification.', 'PENDING_APPROVAL');
    }
    if (user.kycStatus === 'SUSPENDED') {
      apiError(403, 'This account has been suspended. Contact support for help.', 'SUSPENDED');
    }

    const { accessToken, refreshToken } = await this.issueTokens(user.id, user.role);

    return {
      accessToken,
      refreshToken,
      user: this.toPublicUser(user),
      profileComplete: user.profileComplete,
    };
  }

  async refresh(refreshToken: string) {
    let payload: { sub: string; role: Role; type: string; jti?: string };
    try {
      payload = await this.jwt.verifyAsync(refreshToken, {
        secret: this.config.get<string>('JWT_REFRESH_SECRET'),
      });
    } catch {
      throw new UnauthorizedException('Session expired. Please sign in again.');
    }

    if (payload.type !== 'refresh') {
      throw new UnauthorizedException('Invalid token type.');
    }

    const [user] = await this.db.select().from(users).where(eq(users.id, payload.sub)).limit(1);
    if (!user) {
      throw new UnauthorizedException('Session expired. Please sign in again.');
    }

    if (payload.jti) {
      // Current tokens: look up this session's own row — other sessions'
      // rows (other devices) are irrelevant, so they never conflict.
      const [session] = await this.db
        .select()
        .from(refreshTokens)
        .where(eq(refreshTokens.id, payload.jti))
        .limit(1);
      const valid =
        session &&
        session.userId === user.id &&
        session.expiresAt > new Date() &&
        session.tokenHash === sha256Hex(refreshToken);
      if (!valid) {
        throw new UnauthorizedException('Session expired. Please sign in again.');
      }
    } else {
      // Legacy tokens issued before the refresh_tokens table existed (no jti)
      // still validate against the old single-hash column, so users who were
      // already signed in when this fix shipped aren't force-logged-out. New
      // logins always carry a jti, so this branch retires by itself as the
      // old 30-day tokens expire.
      if (!user.refreshTokenHash || !(await bcrypt.compare(refreshToken, user.refreshTokenHash))) {
        throw new UnauthorizedException('Session expired. Please sign in again.');
      }
    }

    const accessToken = await this.jwt.signAsync(
      { sub: user.id, role: user.role, type: 'access' },
      {
        secret: this.config.get<string>('JWT_ACCESS_SECRET'),
        expiresIn: this.config.get<string>('JWT_ACCESS_EXPIRES_IN'),
      },
    );
    return { accessToken };
  }

  async me(userId: string): Promise<PublicUser> {
    const [user] = await this.db.select().from(users).where(eq(users.id, userId)).limit(1);
    if (!user) apiError(401, 'Session expired. Please sign in again.');
    return this.toPublicUser(user);
  }

  /**
   * Always resolves — never reveals whether `email` belongs to an account.
   * See PasswordResetService.requestOtp for the actual enumeration guard.
   */
  async forgotPassword(email: string): Promise<{ message: string }> {
    const [user] = await this.db.select({ id: users.id }).from(users).where(eq(users.email, email)).limit(1);
    await this.passwordReset.requestOtp(email, user ? { id: user.id, type: 'user' } : null);
    return { message: "If an account exists for that email, we've sent a reset code." };
  }

  async verifyResetOtp(email: string, otp: string): Promise<{ valid: true }> {
    const valid = await this.passwordReset.verifyOtp(email, otp);
    if (!valid) apiError(400, 'That code is incorrect or has expired.');
    return { valid: true };
  }

  async resetPassword(email: string, otp: string, newPassword: string): Promise<{ message: string }> {
    const consumed = await this.passwordReset.consumeOtp(email, otp);
    if (!consumed?.userId) apiError(400, 'That code is incorrect or has expired.');

    const passwordHash = await bcrypt.hash(newPassword, 10);
    await this.db.update(users).set({ passwordHash, updatedAt: new Date() }).where(eq(users.id, consumed.userId));

    // Invalidate every existing session for this account — the whole point
    // of a password reset is that anyone who had a live session (e.g. from
    // a stolen device) no longer does.
    await this.db.delete(refreshTokens).where(eq(refreshTokens.userId, consumed.userId));

    return { message: 'Your password has been updated.' };
  }
}