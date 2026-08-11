import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(opts: { search?: string; roleId?: string; isActive?: boolean; page?: number; pageSize?: number }) {
    const page = Math.max(1, opts.page ?? 1);
    const pageSize = Math.min(100, Math.max(1, opts.pageSize ?? 20));
    const where: any = {};
    if (opts.search) {
      where.OR = [
        { email: { contains: opts.search, mode: 'insensitive' } },
        { name: { contains: opts.search, mode: 'insensitive' } },
      ];
    }
    if (typeof opts.isActive === 'boolean') where.isActive = opts.isActive;
    if (opts.roleId) where.roles = { some: { roleId: opts.roleId } };

    const [items, total] = await this.prisma.$transaction([
      this.prisma.user.findMany({
        where,
        include: { roles: { include: { role: true } } },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.user.count({ where }),
    ]);

    return {
      items: items.map((u) => ({
        id: u.id,
        email: u.email,
        name: u.name,
        isActive: u.isActive,
        roles: u.roles.map((r) => ({ id: r.role.id, name: r.role.name })),
        createdAt: u.createdAt,
      })),
      total,
      page,
      pageSize,
    };
  }

  async create(opts: { email: string; name: string; password: string; roleIds: string[] }) {
    const exists = await this.prisma.user.findUnique({ where: { email: opts.email } });
    if (exists) throw new ConflictException('Email sudah digunakan');

    const hashed = await bcrypt.hash(opts.password, 12);
    const user = await this.prisma.user.create({
      data: {
        email: opts.email,
        name: opts.name,
        password: hashed,
        roles: {
          create: opts.roleIds.map((roleId) => ({ roleId })),
        },
      },
      include: { roles: { include: { role: true } } },
    });

    return {
      id: user.id,
      email: user.email,
      name: user.name,
      isActive: user.isActive,
      roles: user.roles.map((r) => ({ id: r.role.id, name: r.role.name })),
    };
  }

  async update(id: string, opts: { name?: string; isActive?: boolean; roleIds?: string[] }) {
    const exists = await this.prisma.user.findUnique({ where: { id } });
    if (!exists) throw new NotFoundException('User tidak ditemukan');

    return this.prisma.$transaction(async (tx) => {
      await tx.user.update({
        where: { id },
        data: {
          ...(opts.name !== undefined ? { name: opts.name } : {}),
          ...(opts.isActive !== undefined ? { isActive: opts.isActive } : {}),
        },
      });
      if (opts.roleIds) {
        await tx.userRole.deleteMany({ where: { userId: id } });
        if (opts.roleIds.length) {
          await tx.userRole.createMany({
            data: opts.roleIds.map((roleId) => ({ userId: id, roleId })),
          });
        }
      }
      const user = await tx.user.findUnique({
        where: { id },
        include: { roles: { include: { role: true } } },
      });
      return {
        id: user!.id,
        email: user!.email,
        name: user!.name,
        isActive: user!.isActive,
        roles: user!.roles.map((r) => ({ id: r.role.id, name: r.role.name })),
      };
    });
  }

  async resetPassword(id: string, newPassword: string) {
    const exists = await this.prisma.user.findUnique({ where: { id } });
    if (!exists) throw new NotFoundException('User tidak ditemukan');
    const hashed = await bcrypt.hash(newPassword, 12);
    await this.prisma.user.update({ where: { id }, data: { password: hashed } });
    return { ok: true };
  }

  async remove(id: string) {
    const exists = await this.prisma.user.findUnique({ where: { id } });
    if (!exists) throw new NotFoundException('User tidak ditemukan');
    // Nonaktifkan user (jangan hard delete untuk menjaga audit trail)
    await this.prisma.user.update({ where: { id }, data: { isActive: false } });
    return { ok: true };
  }
}
