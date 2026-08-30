import { Module } from '@nestjs/common';
import { FonnteService } from './fonnte.service';

/**
 * FonnteModule — module standalone untuk provider Fonnte.
 *
 * TIDAK import WhatsappModule — sengaja dipisah untuk menghindari
 * coupling dengan flow OTP. Service ini reusable oleh module manapun
 * (mis. RekapHarianModule) yang butuh kirim pesan WhatsApp via Fonnte.
 */
@Module({
  providers: [FonnteService],
  exports: [FonnteService],
})
export class FonnteModule {}
