import { ConflictException, Inject, Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcryptjs';
import { createHash } from 'crypto';
import { and, eq, lt } from 'drizzle-orm';
import { DATABASE_CONNECTION, type Database } from '../../database/database.module';
import { refreshTokens, users } from '../../database/schema';
import { id } from '../../common/id';
import { apiError } from '../../common/exceptions';
import type { RegisterDto, LoginDto } from './dto/auth.dto';
import type { Role } from '../../database/schema';
import { NotificationsService } from '../notifications/notifications.service';


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

  async login(dto: LoginDto) {
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
}