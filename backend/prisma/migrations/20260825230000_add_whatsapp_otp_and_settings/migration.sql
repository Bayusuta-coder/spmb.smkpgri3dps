-- WhatsApp OTP verification + laporan harian
-- BACKWARD-COMPATIBLE: semua kolom/tabel baru nullable / tidak ada default
-- yang menandai user lama sebagai verified. User existing tanpa nomor
-- WhatsApp tetap bisa login; status verifikasi tetap null sampai mereka
-- tambahkan & verifikasi nomor sendiri lewat halaman profile.

-- AlterTable: tambah kolom WhatsApp ke users
ALTER TABLE "users" ADD COLUMN "whatsappNumber" TEXT;
ALTER TABLE "users" ADD COLUMN "whatsappVerifiedAt" TIMESTAMP(3);

-- CreateIndex
CREATE INDEX "users_whatsappNumber_idx" ON "users"("whatsappNumber");

-- CreateTable: WhatsAppOtp (OTP challenges, hashed)
CREATE TABLE "whatsapp_otps" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "phoneNumber" TEXT NOT NULL,
    "codeHash" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "maxAttempts" INTEGER NOT NULL DEFAULT 5,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "verifiedAt" TIMESTAMP(3),
    "cancelledAt" TIMESTAMP(3),
    "ipAddress" TEXT,
    "userAgent" TEXT,
    "meta" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "whatsapp_otps_pkey" PRIMARY KEY ("id")
);

-- CreateTable: WhatsAppSetting (konfigurasi laporan, non-credential)
CREATE TABLE "whatsapp_settings" (
    "key" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "description" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "whatsapp_settings_pkey" PRIMARY KEY ("key")
);

-- CreateIndex
CREATE INDEX "whatsapp_otps_userId_idx" ON "whatsapp_otps"("userId");
CREATE INDEX "whatsapp_otps_phoneNumber_idx" ON "whatsapp_otps"("phoneNumber");
CREATE INDEX "whatsapp_otps_status_expiresAt_idx" ON "whatsapp_otps"("status", "expiresAt");

-- AddForeignKey: WhatsAppOtp.user → users.id (CASCADE: kalau user dihapus,
-- OTP challenge hilang — tidak ada gunanya orphaned)
ALTER TABLE "whatsapp_otps" ADD CONSTRAINT "whatsapp_otps_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;