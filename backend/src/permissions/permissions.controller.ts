import { Controller, Get } from '@nestjs/common';
import { PermissionsService } from './permissions.service';
import { Permissions } from '../common/decorators/permissions.decorator';

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
