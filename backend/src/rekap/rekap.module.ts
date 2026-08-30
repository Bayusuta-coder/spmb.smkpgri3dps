import { Module } from '@nestjs/common';
import { RekapController } from './rekap.controller';
import { RekapService } from './rekap.service';

@Module({
  controllers: [RekapController],
  providers: [RekapService],
})
export class RekapModule {}
