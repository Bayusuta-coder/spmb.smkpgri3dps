-- AlterTable
ALTER TABLE "users"
  ADD COLUMN "resetTokenHash"    TEXT,
  ADD COLUMN "resetTokenExpires" TIMESTAMP(3);

-- CreateIndex
CREATE INDEX "users_resetTokenHash_idx" ON "users"("resetTokenHash");
