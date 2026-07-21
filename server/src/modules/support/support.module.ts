import { Module } from '@nestjs/common';
import { SupportController, SupportService } from './support.controller';

@Module({
  controllers: [SupportController],
  providers: [SupportService],
})
export class SupportModule {}