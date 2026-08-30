-- Snapshot nama/email actor di semua tabel user FK
-- Tujuan: kalau user di-hard-delete, relasi di-set NULL tapi data readable.

-- ============================================================================
-- AuditLog: userName + userEmail snapshot
-- ============================================================================
ALTER TABLE "audit_logs" ADD COLUMN "userName"  TEXT;
ALTER TABLE "audit_logs" ADD COLUMN "userEmail" TEXT;

-- ============================================================================
-- Jurusan: deletedByNama + deletedByEmail
-- ============================================================================
ALTER TABLE "jurusan" ADD COLUMN "deletedByNama"  TEXT;
ALTER TABLE "jurusan" ADD COLUMN "deletedByEmail" TEXT;

-- ============================================================================
-- Pendaftar: snapshot di 5 kolom user FK
-- verifiedBy, approvedBy, daftarUlangConfirmedBy, dibayarOleh, ukuranBajuDisetOleh
-- ============================================================================
ALTER TABLE "pendaftar_spmb" ADD COLUMN "verifiedByNama"            TEXT;
ALTER TABLE "pendaftar_spmb" ADD COLUMN "verifiedByEmail"           TEXT;
ALTER TABLE "pendaftar_spmb" ADD COLUMN "approvedByNama"            TEXT;
ALTER TABLE "pendaftar_spmb" ADD COLUMN "approvedByEmail"           TEXT;
ALTER TABLE "pendaftar_spmb" ADD COLUMN "dibayarOlehNama"           TEXT;
ALTER TABLE "pendaftar_spmb" ADD COLUMN "dibayarOlehEmail"          TEXT;
ALTER TABLE "pendaftar_spmb" ADD COLUMN "ukuranBajuDisetOlehNama"   TEXT;
ALTER TABLE "pendaftar_spmb" ADD COLUMN "ukuranBajuDisetOlehEmail"  TEXT;
ALTER TABLE "pendaftar_spmb" ADD COLUMN "daftarUlangConfirmedByNama"  TEXT;
ALTER TABLE "pendaftar_spmb" ADD COLUMN "daftarUlangConfirmedByEmail" TEXT;

-- Drop & recreate FK Pendaftar→User dengan ON DELETE SET NULL.
-- Default ON DELETE sebelumnya NoAction (= Restrict di Postgres), yang akan
-- MENCEGAH hard-delete user kalau masih ada Pendaftar terkait.
ALTER TABLE "pendaftar_spmb" DROP CONSTRAINT IF EXISTS "pendaftar_spmb_verifiedById_fkey";
ALTER TABLE "pendaftar_spmb" ADD CONSTRAINT "pendaftar_spmb_verifiedById_fkey"
  FOREIGN KEY ("verifiedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "pendaftar_spmb" DROP CONSTRAINT IF EXISTS "pendaftar_spmb_approvedById_fkey";
ALTER TABLE "pendaftar_spmb" ADD CONSTRAINT "pendaftar_spmb_approvedById_fkey"
  FOREIGN KEY ("approvedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "pendaftar_spmb" DROP CONSTRAINT IF EXISTS "pendaftar_spmb_dibayarOlehUserId_fkey";
ALTER TABLE "pendaftar_spmb" ADD CONSTRAINT "pendaftar_spmb_dibayarOlehUserId_fkey"
  FOREIGN KEY ("dibayarOlehUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "pendaftar_spmb" DROP CONSTRAINT IF EXISTS "pendaftar_spmb_ukuranBajuDisetOlehUserId_fkey";
ALTER TABLE "pendaftar_spmb" ADD CONSTRAINT "pendaftar_spmb_ukuranBajuDisetOlehUserId_fkey"
  FOREIGN KEY ("ukuranBajuDisetOlehUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "pendaftar_spmb" DROP CONSTRAINT IF EXISTS "pendaftar_spmb_daftarUlangConfirmedByUserId_fkey";
ALTER TABLE "pendaftar_spmb" ADD CONSTRAINT "pendaftar_spmb_daftarUlangConfirmedByUserId_fkey"
  FOREIGN KEY ("daftarUlangConfirmedByUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- ============================================================================
-- Setting: updatedByNama + updatedByEmail
-- (FK ON DELETE SET NULL sudah ada sejak awal)
-- ============================================================================
ALTER TABLE "settings" ADD COLUMN "updatedByNama"  TEXT;
ALTER TABLE "settings" ADD COLUMN "updatedByEmail" TEXT;

-- ============================================================================
-- Berita: createdByUserId jadi nullable (snapshot yang pegang data), SetNull FK
-- ============================================================================
ALTER TABLE "berita" ALTER COLUMN "createdByUserId" DROP NOT NULL;
ALTER TABLE "berita" ADD COLUMN     "createdByNama"  TEXT;
ALTER TABLE "berita" ADD COLUMN     "createdByEmail" TEXT;

ALTER TABLE "berita" DROP CONSTRAINT IF EXISTS "berita_createdByUserId_fkey";
ALTER TABLE "berita" ADD CONSTRAINT  "berita_createdByUserId_fkey"
  FOREIGN KEY ("createdByUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- ============================================================================
-- Pengumuman: sama seperti Berita
-- ============================================================================
ALTER TABLE "pengumuman" ALTER COLUMN "createdByUserId" DROP NOT NULL;
ALTER TABLE "pengumuman" ADD COLUMN     "createdByNama"  TEXT;
ALTER TABLE "pengumuman" ADD COLUMN     "createdByEmail" TEXT;

ALTER TABLE "pengumuman" DROP CONSTRAINT IF EXISTS "pengumuman_createdByUserId_fkey";
ALTER TABLE "pengumuman" ADD CONSTRAINT  "pengumuman_createdByUserId_fkey"
  FOREIGN KEY ("createdByUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;