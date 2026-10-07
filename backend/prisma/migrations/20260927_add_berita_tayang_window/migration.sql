-- AlterTable
ALTER TABLE "berita"
  ADD COLUMN "tayangDari" TIMESTAMP(3),
  ADD COLUMN "tayangSampai" TIMESTAMP(3);

-- CreateIndex
CREATE INDEX "berita_status_tayangDari_tayangSampai_idx"
  ON "berita"("status", "tayangDari", "tayangSampai");
