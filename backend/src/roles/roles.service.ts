import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class RolesService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll() {
    const roles = await this.prisma.role.findMany({
      orderBy: { name: 'asc' },
      include: {
        permissions: {
          include: { permission: true },
        },
        _count: { select: { users: true } },
      },
    });
    return roles.map((r) => ({
      id: r.id,
      name: r.name,
      description: r.description,
      isSystem: r.isSystem,
      userCount: r._count.users,
      permissions: r.permissions.map((rp) => ({
        id: rp.permission.id,
        code: rp.permission.code,
        module: rp.permission.module,
        action: rp.permission.action,
        description: rp.permission.description,
      })),
      createdAt: r.createdAt,
    }));
  }

  async findOne(id: string) {
    const r = await this.prisma.role.findUnique({
      where: { id },
      include: { permissions: { include: { permission: true } } },
    });
    if (!r) throw new NotFoundException('Role tidak ditemukan');
    return r;
  }

  async create(opts: { name: string; description?: string; permissionIds: string[] }) {
    const exists = await this.prisma.role.findUnique({ where: { name: opts.name } });
    if (exists) throw new ConflictException('Nama role sudah digunakan');

    const role = await this.prisma.role.create({
      data: {
        name: opts.name,
        description: opts.description,
        permissions: {
          create: opts.permissionIds.map((permissionId) => ({ permissionId })),
        },
      },
      include: { permissions: { include: { permission: true } } },
    });
    return role;
  }

  async update(id: string, opts: { name?: string; description?: string; permissionIds?: string[] }) {
    const existing = await this.prisma.role.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('Role tidak ditemukan');
    if (existing.isSystem && opts.name && opts.name !== existing.name) {
      throw new BadRequestException('Role sistem tidak boleh diubah namanya');
    }

    return this.prisma.$transaction(async (tx) => {
      await tx.role.update({
        where: { id },
        data: {
          ...(opts.name !== undefined ? { name: opts.name } : {}),
          ...(opts.description !== undefined ? { description: opts.description } : {}),
        },
      });
      if (opts.permissionIds) {
        await tx.rolePermission.deleteMany({ where: { roleId: id } });
        if (opts.permissionIds.length) {
          await tx.rolePermission.createMany({
            data: opts.permissionIds.map((permissionId) => ({ roleId: id, permissionId })),
          });
        }
      }
      return tx.role.findUnique({
        where: { id },
        include: { permissions: { include: { permission: true } } },
      });
    });
  }

  async remove(id: string) {
    const existing = await this.prisma.role.findUnique({
      where: { id },
      include: { _count: { select: { users: true } } },
    });
    if (!existing) throw new NotFoundException('Role tidak ditemukan');
    if (existing.isSystem) throw new BadRequestException('Role sistem tidak boleh dihapus');
    if (existing._count.users > 0) {
      throw new BadRequestException(
        `Role masih dipakai oleh ${existing._count.users} user. Pindahkan dulu user ke role lain.`,
      );
    }
    await this.prisma.role.delete({ where: { id } });
    return { ok: true };
  }
}
