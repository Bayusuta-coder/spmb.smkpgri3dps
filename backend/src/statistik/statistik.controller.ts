import { Controller, Get } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { StatistikService } from './statistik.service';
import { Permissions } from '../common/decorators/permissions.decorator';

@ApiTags('statistik')
@ApiBearerAuth('bearer')
@Controller('statistik')
export class StatistikController {
  constructor(private readonly service: StatistikService) {}

  @Get('summary')
  @Permissions('statistik.view')
  summary() {
    return this.service.summary();
  }
}
