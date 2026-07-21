import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ConfigService } from '@nestjs/config';
import { ExtractJwt, Strategy } from 'passport-jwt';

export interface SuperAdminJwtPayload {
  sub: string;
  type: 'super_admin_access';
}

export interface AuthenticatedSuperAdmin {
  id: string;
}

/**
 * Entirely separate auth domain from regular user JWTs — its own secret,
 * its own passport strategy name ("super-admin-jwt"), its own token type
 * discriminator. This mirrors the frontend's super-admin.store.ts, which
 * never touches localStorage.zz_token and keeps its token in a dedicated
 * zustand store instead. A leaked/forged regular-user token can never pass
 * this strategy, and vice versa.
 */
@Injectable()
export class SuperAdminJwtStrategy extends PassportStrategy(Strategy, 'super-admin-jwt') {
  constructor(config: ConfigService) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: config.get<string>('SUPER_ADMIN_JWT_SECRET')!,
    });
  }

  validate(payload: SuperAdminJwtPayload): AuthenticatedSuperAdmin {
    if (payload.type !== 'super_admin_access') {
      throw new UnauthorizedException('Invalid token type.');
    }
    return { id: payload.sub };
  }
}
