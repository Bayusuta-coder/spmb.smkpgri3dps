import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { IsArray, IsBoolean, IsEmail, IsNotEmpty, IsOptional, IsString, MinLength } from 'class-validator';
import { UsersService } from './users.service';
import { Permissions } from '../common/decorators/permissions.decorator';

class CreateUserDto {
  @IsEmail()
  email!: string;

  @IsString()
  @IsNotEmpty()
  name!: string;

  @IsString()
  @MinLength(8, { message: 'Password minimal 8 karakter' })
  password!: string;

  @IsArray()
  @IsString({ each: true })
  roleIds!: string[];
}

class UpdateUserDto {
  @IsOptional() @IsString() @IsNotEmpty()
  name?: string;

  @IsOptional() @IsBoolean()
  isActive?: boolean;

  @IsOptional() @IsArray() @IsString({ each: true })
  roleIds?: string[];
}

class ResetPasswordDto {
  @IsString() @MinLength(8)
  newPassword!: string;
}

@Controller('users')
export class UsersController {
  constructor(private readonly users: UsersService) {}

  @Get()
  @Permissions('user.view')
  list(
    @Query('search') search?: string,
    @Query('roleId') roleId?: string,
    @Query('isActive') isActive?: string,
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
  ) {
    return this.users.findAll({
      search,
      roleId,
      isActive: isActive === undefined ? undefined : isActive === 'true',
      page: page ? Number(page) : undefined,
      pageSize: pageSize ? Number(pageSize) : undefined,
    });
  }

  @Post()
  @Permissions('user.manage')
  create(@Body() dto: CreateUserDto) {
    return this.users.create(dto);
  }

  @Patch(':id')
  @Permissions('user.manage')
  update(@Param('id') id: string, @Body() dto: UpdateUserDto) {
    return this.users.update(id, dto);
  }

  @Patch(':id/reset-password')
  @Permissions('user.manage')
  resetPassword(@Param('id') id: string, @Body() dto: ResetPasswordDto) {
    return this.users.resetPassword(id, dto.newPassword);
  }

  @Delete(':id')
  @Permissions('user.manage')
  remove(@Param('id') id: string) {
    return this.users.remove(id);
  }
}
