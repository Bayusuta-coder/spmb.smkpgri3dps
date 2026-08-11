import { Controller, Get } from '@nestjs/common';
import { StatistikService } from './statistik.service';
import { Permissions } from '../common/decorators/permissions.decorator';

@Controller('statistik')
export class StatistikController {
  constructor(private readonly service: StatistikService) {}

  @Get('summary')
  @Permissions('statistik.view')
  summary() {
    return this.service.summary();
  }
}
