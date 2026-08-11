import {
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import * as bcrypt from 'bcrypt';
import { Throttle } from '@nestjs/throttler';

import { PrismaService } from '../prisma/prisma.service';
import { JwtUserPayload } from '../common/decorators/current-user.decorator';

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
  ) {}

  /**
   * Login admin/TU/superadmin. Pemblokiran brute force dilakukan via Throttle di controller.
   */
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  async login(email: string, password: string) {
    const user = await this.prisma.user.findUnique({
      where: { email },
      include: {
        roles: {
          include: {
            role: {
              include: {
                permissions: {
                  include: { permission: true },
                },
              },
            },
          },
        },
      },
    });

    if (!user || !user.isActive) {
      throw new UnauthorizedException('Email atau password salah');
    }

    const ok = await bcrypt.compare(password, user.password);
    if (!ok) {
      throw new UnauthorizedException('Email atau password salah');
    }

    const permissions = new Set<string>();
    const roles: string[] = [];
    for (const ur of user.roles) {
      roles.push(ur.role.name);
      for (const rp of ur.role.permissions) {
        permissions.add(rp.permission.code);
      }
    }

    const payload: JwtUserPayload = {
      sub: user.id,
      email: user.email,
      name: user.name,
      permissions: Array.from(permissions),
    };

    const token = await this.jwt.signAsync(payload);
    const expiresIn = this.config.get<string>('JWT_EXPIRES_IN', '8h');

    return {
      access_token: token,
      token_type: 'Bearer',
      expires_in: expiresIn,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        roles,
        permissions: Array.from(permissions),
      },
    };
  }

  async me(userId: string) {
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
    if (!user) throw new UnauthorizedException();

    const permissions = new Set<string>();
    const roles: string[] = [];
    for (const ur of user.roles) {
      roles.push(ur.role.name);
      for (const rp of ur.role.permissions) {
        permissions.add(rp.permission.code);
      }
    }

    return {
      id: user.id,
      email: user.email,
      name: user.name,
      isActive: user.isActive,
      roles,
      permissions: Array.from(permissions),
    };
  }
}
