import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { JwtStrategy } from './jwt.strategy';

@Module({
  // ConfigModule is imported explicitly here even though it's registered
  // globally in AppModule via isGlobal:true — relying on global
  // registration alone does not guarantee ConfigService is instantiated
  // before JwtStrategy/AuthService request it via constructor injection.
  // An explicit import pins the dependency order correctly.
  imports: [ConfigModule, PassportModule, JwtModule.register({})],
  controllers: [AuthController],
  providers: [AuthService, JwtStrategy],
  exports: [AuthService],
})
export class AuthModule {}
