import { Controller, Get, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { AuditLogService } from './audit-log.service';
import { Permissions } from '../common/decorators/permissions.decorator';

@ApiTags('audit-log')
@ApiBearerAuth('bearer')
@Controller('audit-logs')
export class AuditLogController {
  constructor(private readonly service: AuditLogService) {}

  @Get()
  @Permissions('audit.view')
  list(
    @Query('module') module?: string,
    @Query('userId') userId?: string,
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
  ) {
    return this.service.findAll({
      module,
      userId,
      page: page ? Number(page) : undefined,
      pageSize: pageSize ? Number(pageSize) : undefined,
    });
  }
}
