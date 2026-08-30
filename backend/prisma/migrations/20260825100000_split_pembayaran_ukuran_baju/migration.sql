-- Split approval flow: pisahkan pembayaran (Bendahara) dari ukuran baju (TU)
--
-- Sebelumnya `pendaftar_spmb.status` di-set manual jadi SISWA_AKTIF dalam satu
-- step approve (admin isi ukuran baju + nominal bayar + status sekaligus).
-- Ini mengkonflasi 2 business responsibility yang harusnya dilakukan oleh role
-- BERBEDA (Bendahara + TU) di waktu BEBAS (siapa dulu).
--
-- Setelah perubahan ini:
--   - Ada 6 kolom tracking terpisah di pendaftar_spmb (4 nullable, 2 required).
--   - `statusPembayaran` + `metodePembayaran` → dicatat Bendahara.
--   - `ukuranBaju` (existing) + `tanggalUkuranBaju` → dicatat TU.
--   - `nominalPembayaran` (existing) tetap disimpan sebagai SNAPSHOT harga
--     global saat Bendahara submit (bukan saat status berubah) supaya PDF
--     historical konsisten walau setting harga global berubah di kemudian hari.
--   - `status` (enum) sekarang AUTO-COMPUTED dari kombinasi 2 field di atas,
--     ditrigger di service layer (`computeAndUpdateStatus()`). Lihat:
--       BELUM  + null  → MENUNGGU_PERSETUJUAN (label: "Menunggu Daftar Ulang")
--       LUNAS  + null  → MENUNGGU_UKURAN_BAJU (label: "Menunggu Ukuran Baju")
--       BELUM  + "M"   → MENUNGGU_PEMBAYARAN (label: "Menunggu Pembayaran")
--       LUNAS  + "M"   → SISWA_AKTIF (auto: generate Tahap 2 PDF + email)
--
-- Tambah 2 enum baru
CREATE TYPE "StatusPembayaran" AS ENUM ('BELUM', 'LUNAS');
CREATE TYPE "MetodePembayaran" AS ENUM ('CASH', 'TRANSFER');

-- Tambah 2 nilai baru ke enum StatusPendaftar
ALTER TYPE "StatusPendaftar" ADD VALUE 'MENUNGGU_PEMBAYARAN';
ALTER TYPE "StatusPendaftar" ADD VALUE 'MENUNGGU_UKURAN_BAJU';

-- Tambah 6 kolom baru ke pendaftar_spmb
ALTER TABLE "pendaftar_spmb"
  ADD COLUMN "statusPembayaran"          "StatusPembayaran" NOT NULL DEFAULT 'BELUM',
  ADD COLUMN "metodePembayaran"          "MetodePembayaran",
  ADD COLUMN "tanggalBayar"              TIMESTAMP(3),
  ADD COLUMN "dibayarOlehUserId"         TEXT,
  ADD COLUMN "tanggalUkuranBaju"         TIMESTAMP(3),
  ADD COLUMN "ukuranBajuDisetOlehUserId" TEXT;

-- Backfill untuk data existing (legacy rows yang sudah SISWA_AKTIF):
-- anggap pembayaran sudah LUNAS dan ukuran baju sudah ter-isi (di-copy dari
-- ukuranBaju). nominalPembayaran & ukuranBaju sendiri sudah ada di schema lama
-- jadi tidak perlu di-backfill. Ini memastikan status auto-compute lama-lama
-- akan stabilize.
--
-- NOTE: tidak ada legacy data di production saat migration ini dibuat (deploy
-- hijau ke env fresh), tapi baris ini safety net untuk robustness.
UPDATE "pendaftar_spmb"
SET "statusPembayaran" = 'LUNAS',
    "tanggalBayar"     = "approvedAt",
    "dibayarOlehUserId"= "approvedById",
    "tanggalUkuranBaju"= "approvedAt",
    "ukuranBajuDisetOlehUserId" = "approvedById"
WHERE "status" = 'SISWA_AKTIF';

-- Tambah FK constraints ke users untuk audit trail Bendahara & TU
ALTER TABLE "pendaftar_spmb"
  ADD CONSTRAINT "pendaftar_spmb_dibayarOlehUserId_fkey"
  FOREIGN KEY ("dibayarOlehUserId") REFERENCES "users"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "pendaftar_spmb"
  ADD CONSTRAINT "pendaftar_spmb_ukuranBajuDisetOlehUserId_fkey"
  FOREIGN KEY ("ukuranBajuDisetOlehUserId") REFERENCES "users"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

-- Index untuk query yang sering filter by status (mis. "belum bayar berapa
-- orang?" oleh Bendahara di dashboard). createdAt DESC untuk sort natural.
CREATE INDEX "pendaftar_spmb_statusPembayaran_idx" ON "pendaftar_spmb"("statusPembayaran");
CREATE INDEX "pendaftar_spmb_dibayarOlehUserId_idx" ON "pendaftar_spmb"("dibayarOlehUserId");
CREATE INDEX "pendaftar_spmb_ukuranBajuDisetOlehUserId_idx" ON "pendaftar_spmb"("ukuranBajuDisetOlehUserId");