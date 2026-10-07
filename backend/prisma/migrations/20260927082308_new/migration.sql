-- CreateEnum
CREATE TYPE "Agama" AS ENUM ('ISLAM', 'KRISTEN', 'KATOLIK', 'HINDU', 'BUDDHA', 'KHONGHUCU');

-- DropIndex
DROP INDEX "pendaftar_spmb_dibayarOlehUserId_idx";

-- DropIndex
DROP INDEX "pendaftar_spmb_statusPembayaran_idx";

-- DropIndex
DROP INDEX "pendaftar_spmb_ukuranBajuDisetOlehUserId_idx";

-- AlterTable
ALTER TABLE "pendaftar_spmb" ADD COLUMN     "agama" "Agama";

-- AlterTable
ALTER TABLE "pengumuman" ADD COLUMN     "tanggalMulai" TIMESTAMP(3),
ADD COLUMN     "tanggalSelesai" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "seragam_item_master" (
    "id" TEXT NOT NULL,
    "nama" TEXT NOT NULL,
    "urutan" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "seragam_item_master_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "seragam_checklist" (
    "id" TEXT NOT NULL,
    "pendaftarId" TEXT NOT NULL,
    "ukuran" TEXT NOT NULL,
    "tanggalPengambilan" TIMESTAMP(3) NOT NULL,
    "penerimaNama" TEXT,
    "petugasId" TEXT,
    "petugasNama" TEXT,
    "petugasEmail" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "seragam_checklist_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "seragam_checklist_item" (
    "id" TEXT NOT NULL,
    "checklistId" TEXT NOT NULL,
    "itemMasterId" TEXT NOT NULL,
    "sudahDidapat" BOOLEAN NOT NULL DEFAULT false,
    "keterangan" TEXT,

    CONSTRAINT "seragam_checklist_item_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "seragam_item_master_isActive_urutan_idx" ON "seragam_item_master"("isActive", "urutan");

-- CreateIndex
CREATE UNIQUE INDEX "seragam_checklist_pendaftarId_key" ON "seragam_checklist"("pendaftarId");

-- CreateIndex
CREATE INDEX "seragam_checklist_item_itemMasterId_idx" ON "seragam_checklist_item"("itemMasterId");

-- CreateIndex
CREATE UNIQUE INDEX "seragam_checklist_item_checklistId_itemMasterId_key" ON "seragam_checklist_item"("checklistId", "itemMasterId");

-- CreateIndex
CREATE INDEX "pengumuman_tanggalMulai_tanggalSelesai_idx" ON "pengumuman"("tanggalMulai", "tanggalSelesai");

-- AddForeignKey
ALTER TABLE "seragam_checklist" ADD CONSTRAINT "seragam_checklist_pendaftarId_fkey" FOREIGN KEY ("pendaftarId") REFERENCES "pendaftar_spmb"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "seragam_checklist" ADD CONSTRAINT "seragam_checklist_petugasId_fkey" FOREIGN KEY ("petugasId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "seragam_checklist_item" ADD CONSTRAINT "seragam_checklist_item_checklistId_fkey" FOREIGN KEY ("checklistId") REFERENCES "seragam_checklist"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "seragam_checklist_item" ADD CONSTRAINT "seragam_checklist_item_itemMasterId_fkey" FOREIGN KEY ("itemMasterId") REFERENCES "seragam_item_master"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
