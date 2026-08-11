/**
 * Audit Log Interceptor.
 *
 * Cara pakai: pasang interceptor ini secara global atau per-route, dan di
 * controller berikan metadata lewat `Reflector` dengan key `AUDIT_KEY`.
 *
 * Saat ini audit log ditulis secara eksplisit lewat service (lihat
 * PendaftarService, PembayaranService, UsersService, RolesService).
 * File ini tetap ada untuk konsistensi & bisa diaktifkan nanti
 * dengan menambahkan @SetMetadata('audit', {...}) di handler.
 */
import {
  CallHandler,
  ExecutionContext,
  Injectable,
  Logger,
  NestInterceptor,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Observable, tap } from 'rxjs';
import { PrismaService } from '../../prisma/prisma.service';
import { JwtUserPayload } from '../decorators/current-user.decorator';

export const AUDIT_KEY = 'audit';
export interface AuditOptions {
  action: string;
  module: string;
  entityType?: string;
}

@Injectable()
export class AuditLogInterceptor implements NestInterceptor {
  private readonly logger = new Logger(AuditLogInterceptor.name);

  constructor(
    private readonly reflector: Reflector,
    private readonly prisma: PrismaService,
  ) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const options = this.reflector.get<AuditOptions | undefined>(
      AUDIT_KEY,
      context.getHandler(),
    );
    if (!options) return next.handle();

    const req = context.switchToHttp().getRequest();
    const user = req.user as JwtUserPayload | undefined;
    const ip =
      (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() ||
      req.socket?.remoteAddress ||
      null;
    const userAgent = req.headers['user-agent'] || null;
    const entityId = req.params?.id || req.body?.id || null;

    return next.handle().pipe(
      tap(async () => {
        try {
          await this.prisma.auditLog.create({
            data: {
              userId: user?.sub || null,
              action: options.action,
              module: options.module,
              entityType: options.entityType || null,
              entityId: entityId ? String(entityId) : null,
              ipAddress: ip,
              userAgent,
            },
          });
        } catch (e: any) {
          this.logger.error(`Gagal tulis audit log: ${e.message}`);
        }
      }),
    );
  }
}
