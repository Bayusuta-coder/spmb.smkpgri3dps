import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class PermissionsService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll() {
    const perms = await this.prisma.permission.findMany({
      orderBy: [{ module: 'asc' }, { action: 'asc' }],
    });
    return perms;
  }

  async grouped() {
    const all = await this.findAll();
    const map = new Map<string, typeof all>();
    for (const p of all) {
      const arr = map.get(p.module) || [];
      arr.push(p);
      map.set(p.module, arr);
    }
    return Array.from(map.entries()).map(([module, permissions]) => ({ module, permissions }));
  }

  /**
   * Resolve permission codes FRESH dari DB untuk seorang user. Dipakai oleh
   * PermissionsGuard pada setiap request supaya perubahan permission role
   * (toggle off di halaman Role & Permission) berlaku SEGERA — tanpa harus
   * tunggu user logout/login lagi (token JWT expired).
   *
   * Performance: 1 query kecil dengan include role.permissions → acceptable
   * untuk skala SPMB (ratusan admin, request rate rendah).
   *
   * Return: array of permission codes (string[]). Kalau user tidak ditemukan
   * atau tidak punya role → return [].
   */
  async resolveForUser(userId: string): Promise<string[]> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: {
        roles: {
          include: {
            role: {
              include: {
                permissions: { include: { permission: true } },
              },
            },
          },
        },
      },
    });
    if (!user || !user.isActive) return [];

    const codes = new Set<string>();
    for (const ur of user.roles) {
      for (const rp of ur.role.permissions) {
        codes.add(rp.permission.code);
      }
    }
    return Array.from(codes);
  }
}
