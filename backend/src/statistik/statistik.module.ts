import { Module } from '@nestjs/common';
import { StatistikController } from './statistik.controller';
import { StatistikService } from './statistik.service';

@Module({
  controllers: [StatistikController],
  providers: [StatistikService],
})
export class StatistikModule {}
