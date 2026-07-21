import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ConfigService } from '@nestjs/config';
import { ExtractJwt, Strategy } from 'passport-jwt';
import type { Role } from '../../database/schema';

export interface JwtAccessPayload {
  sub: string; // user id
  role: Role;
  type: 'access';
}

export interface AuthenticatedUser {
  id: string;
  role: Role;
}

/**
 * Validates the access token on every guarded request. Only accepts tokens
 * with `type: "access"` — refresh tokens (type: "refresh") are structurally
 * valid JWTs too, but must never be usable to call regular API routes, only
 * the dedicated /auth/refresh endpoint.
 */
@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy, 'jwt') {
  constructor(config: ConfigService) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: config.get<string>('JWT_ACCESS_SECRET')!,
    });
  }

  validate(payload: JwtAccessPayload): AuthenticatedUser {
    if (payload.type !== 'access') {
      throw new UnauthorizedException('Invalid token type.');
    }
    return { id: payload.sub, role: payload.role };
  }
}
