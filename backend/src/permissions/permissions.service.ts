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
}
