import { Inject, Injectable } from '@nestjs/common';
import * as bcrypt from 'bcryptjs';
import { and, eq, ne } from 'drizzle-orm';
import { DATABASE_CONNECTION, type Database } from '../../database/database.module';
import { users } from '../../database/schema';
import { apiError } from '../../common/exceptions';
import type { ChangePasswordDto, SetBusinessProfileDto, SetCustomerProfileDto } from './dto/profile.dto';

@Injectable()
export class ProfileService {
  constructor(@Inject(DATABASE_CONNECTION) private readonly db: Database) {}

  async setCustomerProfile(userId: string, dto: SetCustomerProfileDto) {
    // users.email has a UNIQUE index — without this pre-check, saving an
    // email that belongs to another account surfaces as a raw Postgres
    // unique-violation (HTTP 500) instead of a readable message.
    if (dto.email) {
      const [taken] = await this.db
        .select({ id: users.id })
        .from(users)
        .where(and(eq(users.email, dto.email.trim()), ne(users.id, userId)))
        .limit(1);
      if (taken) apiError(409, 'That email is already in use by another account.');
    }

    await this.db
      .update(users)
      .set({
        name: dto.fullName.trim(),
        ...(dto.email ? { email: dto.email.trim() } : {}),
        profileComplete: true,
        updatedAt: new Date(),
      })
      .where(eq(users.id, userId));
    return { ok: true };
  }

  async setBusinessProfile(userId: string, dto: SetBusinessProfileDto) {
    await this.db
      .update(users)
      .set({
        businessName: dto.businessName,
        businessAddress: dto.address ?? null,
        businessDocumentRef: dto.documentRef ?? null,
        profileComplete: true,
        updatedAt: new Date(),
      })
      .where(eq(users.id, userId));
    return { ok: true };
  }

  /**
   * Changes the account password after verifying the current one, and
   * clears the stored refresh token so every *other* session is signed
   * out — the standard containment step if the old password was stolen.
   */
  async changePassword(userId: string, dto: ChangePasswordDto) {
    const [user] = await this.db.select().from(users).where(eq(users.id, userId)).limit(1);
    if (!user) apiError(401, 'Session expired. Please sign in again.');

    const matches = await bcrypt.compare(dto.currentPassword, user.passwordHash);
    if (!matches) apiError(400, 'Your current password is incorrect.');

    if (dto.currentPassword === dto.newPassword) {
      apiError(400, 'New password must be different from your current password.');
    }

    const passwordHash = await bcrypt.hash(dto.newPassword, 10);
    await this.db
      .update(users)
      .set({ passwordHash, refreshTokenHash: null, updatedAt: new Date() })
      .where(eq(users.id, userId));

    return { ok: true };
  }

  /**
   * Sanitized self-view. NEVER return the raw users row here — it carries
   * passwordHash and refreshTokenHash, which must not leave the server.
   */
  async me(userId: string) {
    const [user] = await this.db.select().from(users).where(eq(users.id, userId)).limit(1);
    if (!user) apiError(401, 'Session expired. Please sign in again.');
    return {
      id: user.id,
      name: user.name,
      mobile: user.mobile,
      email: user.email,
      role: user.role,
      kycStatus: user.kycStatus,
      profileComplete: user.profileComplete,
      avatarUrl: user.avatarUrl,
      businessName: user.businessName,
      businessAddress: user.businessAddress,
      createdAt: user.createdAt.toISOString(),
    };
  }
}