-- Make NISN field optional
--
-- Sebelumnya NISN WAJIB diisi karena sistem menggunakan filter NISN
-- untuk deteksi pendaftar duplikat. Namun banyak calon pendaftar (terutama
-- yang dari homeschooling atau pindahan dari luar daerah) belum punya
-- NISN saat mendaftar. Setelah perubahan ini:
--   - NISN menjadi opsional (boleh kosong)
--   - Kalau diisi, harus 10 digit angka dan tetap dicek duplikat per gelombang
--   - Kalau kosong, disimpan sebagai NULL (bukan empty string) supaya
--     query `where: { nisn: null }` bisa dipakai dengan benar
--
-- Lihat perubahan terkait di:
--   - backend/src/pendaftar/pendaftar.controller.ts (RegisterPendaftarDto)
--   - backend/src/pendaftar/pendaftar.service.ts (skip duplikat check kalau kosong)
--   - frontend-user/src/pages/RegisterPage.tsx (form: NISN opsional)

-- AlterTable
ALTER TABLE "pendaftar_spmb" ALTER COLUMN "nisn" DROP NOT NULL;

-- Data cleanup: konversi empty string ke NULL supaya konsisten
UPDATE "pendaftar_spmb" SET "nisn" = NULL WHERE "nisn" = '';