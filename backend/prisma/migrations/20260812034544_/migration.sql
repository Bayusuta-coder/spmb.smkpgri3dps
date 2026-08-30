-- CreateEnum
CREATE TYPE "StatusPendaftar" AS ENUM ('MENUNGGU_PERSETUJUAN', 'DITOLAK', 'SISWA_AKTIF');

-- CreateEnum
CREATE TYPE "JenisKelamin" AS ENUM ('L', 'P');

-- CreateEnum
CREATE TYPE "StatusBerita" AS ENUM ('DRAFT', 'PUBLISHED');

-- CreateTable
CREATE TABLE "users" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "password" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "roles" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "isSystem" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "roles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "permissions" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "module" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "description" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "permissions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_roles" (
    "userId" TEXT NOT NULL,
    "roleId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "user_roles_pkey" PRIMARY KEY ("userId","roleId")
);

-- CreateTable
CREATE TABLE "role_permissions" (
    "roleId" TEXT NOT NULL,
    "permissionId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "role_permissions_pkey" PRIMARY KEY ("roleId","permissionId")
);

-- CreateTable
CREATE TABLE "audit_logs" (
    "id" TEXT NOT NULL,
    "userId" TEXT,
    "action" TEXT NOT NULL,
    "module" TEXT NOT NULL,
    "entityType" TEXT,
    "entityId" TEXT,
    "ipAddress" TEXT,
    "userAgent" TEXT,
    "meta" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "jurusan" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),
    "deletedByUserId" TEXT,

    CONSTRAINT "jurusan_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "gelombang_spmb" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "startDate" TIMESTAMP(3) NOT NULL,
    "endDate" TIMESTAMP(3),
    "isActive" BOOLEAN NOT NULL DEFAULT false,
    "tanggalDaftarUlang" TIMESTAMP(3),
    "jamDaftarUlang" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "gelombang_spmb_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "kuota_gelombang" (
    "id" TEXT NOT NULL,
    "gelombangId" TEXT NOT NULL,
    "jurusanId" TEXT NOT NULL,
    "quota" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "kuota_gelombang_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pendaftar_spmb" (
    "id" TEXT NOT NULL,
    "registrationNumber" TEXT NOT NULL,
    "namaLengkap" TEXT NOT NULL,
    "jenisKelamin" "JenisKelamin" NOT NULL,
    "tempatLahir" TEXT NOT NULL,
    "tanggalLahir" TIMESTAMP(3) NOT NULL,
    "nisn" TEXT NOT NULL,
    "sekolahAsal" TEXT NOT NULL,
    "alamat" TEXT NOT NULL,
    "noTelp" TEXT NOT NULL,
    "email" TEXT,
    "jumlahNilaiUn" DECIMAL(6,2) NOT NULL,
    "prestasi" TEXT,
    "namaIbu" TEXT NOT NULL,
    "noTelpOrtu" TEXT NOT NULL,
    "jurusanId" TEXT NOT NULL,
    "gelombangId" TEXT NOT NULL,
    "status" "StatusPendaftar" NOT NULL DEFAULT 'MENUNGGU_PERSETUJUAN',
    "verifiedById" TEXT,
    "verifiedAt" TIMESTAMP(3),
    "rejectionNote" TEXT,
    "approvedById" TEXT,
    "approvedAt" TIMESTAMP(3),
    "pdfPath" TEXT,
    "pdfGeneratedAt" TIMESTAMP(3),
    "pdfSignature" TEXT,
    "daftarUlangConfirmedAt" TIMESTAMP(3),
    "daftarUlangConfirmedByUserId" TEXT,
    "userId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "pendaftar_spmb_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "email_logs" (
    "id" TEXT NOT NULL,
    "to" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "error" TEXT,
    "relatedType" TEXT,
    "relatedId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "email_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "berita" (
    "id" TEXT NOT NULL,
    "judul" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "foto" TEXT NOT NULL,
    "isi" TEXT NOT NULL,
    "hashtag" TEXT[],
    "status" "StatusBerita" NOT NULL DEFAULT 'DRAFT',
    "publishedAt" TIMESTAMP(3),
    "createdByUserId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "berita_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pengumuman" (
    "id" TEXT NOT NULL,
    "judul" TEXT NOT NULL,
    "foto" TEXT NOT NULL,
    "aktif" BOOLEAN NOT NULL DEFAULT true,
    "urutan" INTEGER NOT NULL DEFAULT 0,
    "createdByUserId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "pengumuman_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "roles_name_key" ON "roles"("name");

-- CreateIndex
CREATE UNIQUE INDEX "permissions_code_key" ON "permissions"("code");

-- CreateIndex
CREATE INDEX "audit_logs_userId_idx" ON "audit_logs"("userId");

-- CreateIndex
CREATE INDEX "audit_logs_module_idx" ON "audit_logs"("module");

-- CreateIndex
CREATE INDEX "audit_logs_createdAt_idx" ON "audit_logs"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "jurusan_code_key" ON "jurusan"("code");

-- CreateIndex
CREATE INDEX "jurusan_deletedAt_idx" ON "jurusan"("deletedAt");

-- CreateIndex
CREATE INDEX "gelombang_spmb_isActive_idx" ON "gelombang_spmb"("isActive");

-- CreateIndex
CREATE INDEX "gelombang_spmb_startDate_idx" ON "gelombang_spmb"("startDate");

-- CreateIndex
CREATE UNIQUE INDEX "kuota_gelombang_gelombangId_jurusanId_key" ON "kuota_gelombang"("gelombangId", "jurusanId");

-- CreateIndex
CREATE UNIQUE INDEX "pendaftar_spmb_registrationNumber_key" ON "pendaftar_spmb"("registrationNumber");

-- CreateIndex
CREATE UNIQUE INDEX "pendaftar_spmb_pdfSignature_key" ON "pendaftar_spmb"("pdfSignature");

-- CreateIndex
CREATE UNIQUE INDEX "pendaftar_spmb_userId_key" ON "pendaftar_spmb"("userId");

-- CreateIndex
CREATE INDEX "pendaftar_spmb_status_idx" ON "pendaftar_spmb"("status");

-- CreateIndex
CREATE INDEX "pendaftar_spmb_jurusanId_idx" ON "pendaftar_spmb"("jurusanId");

-- CreateIndex
CREATE INDEX "pendaftar_spmb_gelombangId_idx" ON "pendaftar_spmb"("gelombangId");

-- CreateIndex
CREATE INDEX "pendaftar_spmb_nisn_idx" ON "pendaftar_spmb"("nisn");

-- CreateIndex
CREATE INDEX "pendaftar_spmb_email_idx" ON "pendaftar_spmb"("email");

-- CreateIndex
CREATE INDEX "pendaftar_spmb_pdfSignature_idx" ON "pendaftar_spmb"("pdfSignature");

-- CreateIndex
CREATE INDEX "email_logs_to_idx" ON "email_logs"("to");

-- CreateIndex
CREATE INDEX "email_logs_relatedType_relatedId_idx" ON "email_logs"("relatedType", "relatedId");

-- CreateIndex
CREATE UNIQUE INDEX "berita_slug_key" ON "berita"("slug");

-- CreateIndex
CREATE INDEX "berita_status_publishedAt_idx" ON "berita"("status", "publishedAt");

-- CreateIndex
CREATE INDEX "berita_deletedAt_idx" ON "berita"("deletedAt");

-- CreateIndex
CREATE INDEX "pengumuman_aktif_urutan_idx" ON "pengumuman"("aktif", "urutan");

-- CreateIndex
CREATE INDEX "pengumuman_deletedAt_idx" ON "pengumuman"("deletedAt");

-- AddForeignKey
ALTER TABLE "user_roles" ADD CONSTRAINT "user_roles_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_roles" ADD CONSTRAINT "user_roles_roleId_fkey" FOREIGN KEY ("roleId") REFERENCES "roles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "role_permissions" ADD CONSTRAINT "role_permissions_roleId_fkey" FOREIGN KEY ("roleId") REFERENCES "roles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "role_permissions" ADD CONSTRAINT "role_permissions_permissionId_fkey" FOREIGN KEY ("permissionId") REFERENCES "permissions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "jurusan" ADD CONSTRAINT "jurusan_deletedByUserId_fkey" FOREIGN KEY ("deletedByUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "kuota_gelombang" ADD CONSTRAINT "kuota_gelombang_gelombangId_fkey" FOREIGN KEY ("gelombangId") REFERENCES "gelombang_spmb"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "kuota_gelombang" ADD CONSTRAINT "kuota_gelombang_jurusanId_fkey" FOREIGN KEY ("jurusanId") REFERENCES "jurusan"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pendaftar_spmb" ADD CONSTRAINT "pendaftar_spmb_jurusanId_fkey" FOREIGN KEY ("jurusanId") REFERENCES "jurusan"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pendaftar_spmb" ADD CONSTRAINT "pendaftar_spmb_gelombangId_fkey" FOREIGN KEY ("gelombangId") REFERENCES "gelombang_spmb"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pendaftar_spmb" ADD CONSTRAINT "pendaftar_spmb_verifiedById_fkey" FOREIGN KEY ("verifiedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pendaftar_spmb" ADD CONSTRAINT "pendaftar_spmb_approvedById_fkey" FOREIGN KEY ("approvedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pendaftar_spmb" ADD CONSTRAINT "pendaftar_spmb_daftarUlangConfirmedByUserId_fkey" FOREIGN KEY ("daftarUlangConfirmedByUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pendaftar_spmb" ADD CONSTRAINT "pendaftar_spmb_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "berita" ADD CONSTRAINT "berita_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pengumuman" ADD CONSTRAINT "pengumuman_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
