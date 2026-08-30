import { Module } from '@nestjs/common';
import { WhatsappService } from './whatsapp.service';
import { WhatsappOtpService } from './whatsapp-otp.service';
import { WhatsappController } from './whatsapp.controller';
import { UsersModule } from '../users/users.module';
import { AuditLogModule } from '../audit-log/audit-log.module';

@Module({
  imports: [UsersModule, AuditLogModule],
  controllers: [WhatsappController],
  providers: [WhatsappService, WhatsappOtpService],
  exports: [WhatsappService, WhatsappOtpService],
})
export class WhatsappModule {}