import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { PublicCmsController, SuperAdminController } from './super-admin.controller';
import { SuperAdminService } from './super-admin.service';
import { SuperAdminJwtStrategy } from './super-admin-jwt.strategy';
import { ApprovalsService } from './approvals.service';
import { ApprovalsController, PartnerRecordsController } from './approvals.controller';

@Module({
  // See AuthModule for why ConfigModule is imported explicitly rather than
  // relied on purely via isGlobal:true.
  imports: [ConfigModule, PassportModule, JwtModule.register({})],
  controllers: [SuperAdminController, PublicCmsController, ApprovalsController, PartnerRecordsController],
  providers: [SuperAdminService, SuperAdminJwtStrategy, ApprovalsService],
})
export class SuperAdminModule {}
