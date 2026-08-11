import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
} from '@nestjs/common';
import { IsArray, IsOptional, IsString } from 'class-validator';
import { RolesService } from './roles.service';
import { Permissions } from '../common/decorators/permissions.decorator';

class CreateRoleDto {
  @IsString() name!: string;
  @IsOptional() @IsString() description?: string;
  @IsArray() @IsString({ each: true }) permissionIds!: string[];
}

class UpdateRoleDto {
  @IsOptional() @IsString() name?: string;
  @IsOptional() @IsString() description?: string;
  @IsOptional() @IsArray() @IsString({ each: true }) permissionIds?: string[];
}

@Controller('roles')
export class RolesController {
  constructor(private readonly roles: RolesService) {}

  @Get()
  @Permissions('role.view')
  list() {
    return this.roles.findAll();
  }

  @Get(':id')
  @Permissions('role.view')
  detail(@Param('id') id: string) {
    return this.roles.findOne(id);
  }

  @Post()
  @Permissions('role.manage')
  create(@Body() dto: CreateRoleDto) {
    return this.roles.create(dto);
  }

  @Patch(':id')
  @Permissions('role.manage')
  update(@Param('id') id: string, @Body() dto: UpdateRoleDto) {
    return this.roles.update(id, dto);
  }

  @Delete(':id')
  @Permissions('role.manage')
  remove(@Param('id') id: string) {
    return this.roles.remove(id);
  }
}
