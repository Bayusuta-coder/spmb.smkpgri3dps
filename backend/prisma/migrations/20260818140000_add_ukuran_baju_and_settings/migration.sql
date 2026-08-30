-- AlterTable: tambah ukuranBaju + nominalPembayaran di pendaftar_spmb
ALTER TABLE "pendaftar_spmb"
  ADD COLUMN "ukuranBaju"        TEXT,
  ADD COLUMN "nominalPembayaran" DECIMAL(12, 2);

-- CreateTable: settings (key-value config global)
CREATE TABLE "settings" (
  "key"             TEXT NOT NULL,
  "value"           TEXT NOT NULL,
  "description"     TEXT,
  "updatedByUserId" TEXT,
  "updatedAt"       TIMESTAMP(3) NOT NULL,
  "createdAt"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "settings_pkey" PRIMARY KEY ("key")
);

-- AddForeignKey
ALTER TABLE "settings"
  ADD CONSTRAINT "settings_updatedByUserId_fkey"
  FOREIGN KEY ("updatedByUserId") REFERENCES "users"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

-- Seed: harga_daftar_ulang default 350000 (override via menu Bendahara nanti)
INSERT INTO "settings" ("key", "value", "description", "updatedAt", "createdAt")
VALUES (
  'harga_daftar_ulang',
  '350000',
  'Harga daftar ulang yang harus dibayar siswa saat approve. Snapshot ke pendaftar_spmb.nominalPembayaran saat approve supaya PDF historical konsisten walau harga berubah.',
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
);

-- Seed: pilihan ukuran baju (CSV)
INSERT INTO "settings" ("key", "value", "description", "updatedAt", "createdAt")
VALUES (
  'ukuran_baju_options',
  'XS,S,M,L,XL,XXL,XXXL',
  'Daftar pilihan ukuran baju untuk form approve (CSV).',
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
);