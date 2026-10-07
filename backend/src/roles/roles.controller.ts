import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import type { Request } from 'express';
import { IsArray, IsOptional, IsString } from 'class-validator';
import { ApiBearerAuth, ApiProperty, ApiPropertyOptional, ApiTags } from '@nestjs/swagger';
import { RolesService } from './roles.service';
import { Permissions } from '../common/decorators/permissions.decorator';
import { RolesOnly } from '../common/decorators/roles-only.decorator';
import { RolesOnlyGuard } from '../common/guards/roles-only.guard';
import { CurrentUser, JwtUserPayload } from '../common/decorators/current-user.decorator';

class CreateRoleDto {
  @ApiProperty({ type: String, description: 'Nama role (mis. "Admin", "TU", "Bendahara")' })
  @IsString() name!: string;
  @ApiPropertyOptional({ type: String, description: 'Deskripsi role (opsional)' })
  @IsOptional() @IsString() description?: string;
  @ApiProperty({ type: [String], description: 'Daftar ID permission yang dimiliki role ini' })
  @IsArray() @IsString({ each: true }) permissionIds!: string[];
}

class UpdateRoleDto {
  @ApiPropertyOptional({ type: String, description: 'Nama role' })
  @IsOptional() @IsString() name?: string;
  @ApiPropertyOptional({ type: String, description: 'Deskripsi role' })
  @IsOptional() @IsString() description?: string;
  @ApiPropertyOptional({ type: [String], description: 'Daftar ID permission yang dimiliki role ini' })
  @IsOptional() @IsArray() @IsString({ each: true }) permissionIds?: string[];
}

/**
 * Halaman Role & Permission. Akses baca (`GET`) tetap di-gate by permission
 * `role.view` (supaya admin bisa lihat permission apa saja yang ada), tapi
 * SETIAP endpoint MUTATOR (POST/PATCH/DELETE) DIBATASI hanya untuk user
 * dengan role "Superadmin" (case-insensitive).
 *
 * Rationale: permission `role.manage` bisa di-toggle oleh siapapun yang punya
 * akses ke halaman ini — kalau Admin bisa di-give `role.manage`, dia bisa
 * self-promote jadi Superadmin. Dengan @RolesOnly('Superadmin'), pengecekan
 * pakai ROLE NAME yang ada di JWT payload, tidak bisa di-bypass dari UI.
 */
@ApiTags('roles')
@ApiBearerAuth('bearer')
@Controller('roles')
@UseGuards(RolesOnlyGuard)
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
  @RolesOnly('Superadmin')
  create(
    @Body() dto: CreateRoleDto,
    @CurrentUser() user: JwtUserPayload,
    @Req() req: Request,
  ) {
    return this.roles.create(dto, user, req);
  }

  @Patch(':id')
  @Permissions('role.manage')
  @RolesOnly('Superadmin')
  update(
    @Param('id') id: string,
    @Body() dto: UpdateRoleDto,
    @CurrentUser() user: JwtUserPayload,
    @Req() req: Request,
  ) {
    return this.roles.update(id, dto, user, req);
  }

  @Delete(':id')
  @Permissions('role.manage')
  @RolesOnly('Superadmin')
  remove(
    @Param('id') id: string,
    @CurrentUser() user: JwtUserPayload,
    @Req() req: Request,
  ) {
    return this.roles.remove(id, user, req);
  }
}
