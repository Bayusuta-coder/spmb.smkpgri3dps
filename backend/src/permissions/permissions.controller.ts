import { Controller, Get } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { PermissionsService } from './permissions.service';
import { Permissions } from '../common/decorators/permissions.decorator';

@ApiTags('permissions')
@ApiBearerAuth('bearer')
@Controller('permissions')
export class PermissionsController {
  constructor(private readonly perms: PermissionsService) {}

  @Get()
  @Permissions('role.view')
  list() {
    return this.perms.findAll();
  }

  @Get('grouped')
  @Permissions('role.view')
  grouped() {
    return this.perms.grouped();
  }
}
