--
-- PostgreSQL database dump
--

\restrict 2GHhDVwZwNzSMWQGAM9bwTPsHm6K9FVpSdIG1XW82puyORHkRGlIDuGLPQ4nlXa

-- Dumped from database version 16.14
-- Dumped by pg_dump version 16.14

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

ALTER TABLE IF EXISTS ONLY public.user_roles DROP CONSTRAINT IF EXISTS "user_roles_userId_fkey";
ALTER TABLE IF EXISTS ONLY public.user_roles DROP CONSTRAINT IF EXISTS "user_roles_roleId_fkey";
ALTER TABLE IF EXISTS ONLY public.settings DROP CONSTRAINT IF EXISTS "settings_updatedByUserId_fkey";
ALTER TABLE IF EXISTS ONLY public.role_permissions DROP CONSTRAINT IF EXISTS "role_permissions_roleId_fkey";
ALTER TABLE IF EXISTS ONLY public.role_permissions DROP CONSTRAINT IF EXISTS "role_permissions_permissionId_fkey";
ALTER TABLE IF EXISTS ONLY public.pengumuman DROP CONSTRAINT IF EXISTS "pengumuman_createdByUserId_fkey";
ALTER TABLE IF EXISTS ONLY public.pendaftar_spmb DROP CONSTRAINT IF EXISTS "pendaftar_spmb_verifiedById_fkey";
ALTER TABLE IF EXISTS ONLY public.pendaftar_spmb DROP CONSTRAINT IF EXISTS "pendaftar_spmb_userId_fkey";
ALTER TABLE IF EXISTS ONLY public.pendaftar_spmb DROP CONSTRAINT IF EXISTS "pendaftar_spmb_ukuranBajuDisetOlehUserId_fkey";
ALTER TABLE IF EXISTS ONLY public.pendaftar_spmb DROP CONSTRAINT IF EXISTS "pendaftar_spmb_jurusanId_fkey";
ALTER TABLE IF EXISTS ONLY public.pendaftar_spmb DROP CONSTRAINT IF EXISTS "pendaftar_spmb_gelombangId_fkey";
ALTER TABLE IF EXISTS ONLY public.pendaftar_spmb DROP CONSTRAINT IF EXISTS "pendaftar_spmb_dibayarOlehUserId_fkey";
ALTER TABLE IF EXISTS ONLY public.pendaftar_spmb DROP CONSTRAINT IF EXISTS "pendaftar_spmb_daftarUlangConfirmedByUserId_fkey";
ALTER TABLE IF EXISTS ONLY public.pendaftar_spmb DROP CONSTRAINT IF EXISTS "pendaftar_spmb_approvedById_fkey";
ALTER TABLE IF EXISTS ONLY public.kuota_gelombang DROP CONSTRAINT IF EXISTS "kuota_gelombang_jurusanId_fkey";
ALTER TABLE IF EXISTS ONLY public.kuota_gelombang DROP CONSTRAINT IF EXISTS "kuota_gelombang_gelombangId_fkey";
ALTER TABLE IF EXISTS ONLY public.jurusan DROP CONSTRAINT IF EXISTS "jurusan_deletedByUserId_fkey";
ALTER TABLE IF EXISTS ONLY public.berita DROP CONSTRAINT IF EXISTS "berita_createdByUserId_fkey";
ALTER TABLE IF EXISTS ONLY public.audit_logs DROP CONSTRAINT IF EXISTS "audit_logs_userId_fkey";
DROP INDEX IF EXISTS public."users_resetTokenHash_idx";
DROP INDEX IF EXISTS public.users_email_key;
DROP INDEX IF EXISTS public.roles_name_key;
DROP INDEX IF EXISTS public.permissions_code_key;
DROP INDEX IF EXISTS public."pengumuman_tanggalMulai_tanggalSelesai_idx";
DROP INDEX IF EXISTS public."pengumuman_deletedAt_idx";
DROP INDEX IF EXISTS public.pengumuman_aktif_urutan_idx;
DROP INDEX IF EXISTS public."pendaftar_spmb_userId_key";
DROP INDEX IF EXISTS public."pendaftar_spmb_ukuranBajuDisetOlehUserId_idx";
DROP INDEX IF EXISTS public.pendaftar_spmb_status_idx;
DROP INDEX IF EXISTS public."pendaftar_spmb_statusPembayaran_idx";
DROP INDEX IF EXISTS public."pendaftar_spmb_registrationNumber_key";
DROP INDEX IF EXISTS public."pendaftar_spmb_pdfSignature_key";
DROP INDEX IF EXISTS public."pendaftar_spmb_pdfSignature_idx";
DROP INDEX IF EXISTS public.pendaftar_spmb_nisn_idx;
DROP INDEX IF EXISTS public."pendaftar_spmb_jurusanId_idx";
DROP INDEX IF EXISTS public."pendaftar_spmb_gelombangId_idx";
DROP INDEX IF EXISTS public.pendaftar_spmb_email_idx;
DROP INDEX IF EXISTS public."pendaftar_spmb_dibayarOlehUserId_idx";
DROP INDEX IF EXISTS public."kuota_gelombang_gelombangId_jurusanId_key";
DROP INDEX IF EXISTS public."jurusan_deletedAt_idx";
DROP INDEX IF EXISTS public.jurusan_code_key;
DROP INDEX IF EXISTS public."gelombang_spmb_startDate_idx";
DROP INDEX IF EXISTS public."gelombang_spmb_isActive_idx";
DROP INDEX IF EXISTS public.email_logs_to_idx;
DROP INDEX IF EXISTS public."email_logs_relatedType_relatedId_idx";
DROP INDEX IF EXISTS public."berita_status_publishedAt_idx";
DROP INDEX IF EXISTS public.berita_slug_key;
DROP INDEX IF EXISTS public."berita_deletedAt_idx";
DROP INDEX IF EXISTS public."audit_logs_userId_idx";
DROP INDEX IF EXISTS public.audit_logs_module_idx;
DROP INDEX IF EXISTS public."audit_logs_createdAt_idx";
ALTER TABLE IF EXISTS ONLY public.users DROP CONSTRAINT IF EXISTS users_pkey;
ALTER TABLE IF EXISTS ONLY public.user_roles DROP CONSTRAINT IF EXISTS user_roles_pkey;
ALTER TABLE IF EXISTS ONLY public.settings DROP CONSTRAINT IF EXISTS settings_pkey;
ALTER TABLE IF EXISTS ONLY public.roles DROP CONSTRAINT IF EXISTS roles_pkey;
ALTER TABLE IF EXISTS ONLY public.role_permissions DROP CONSTRAINT IF EXISTS role_permissions_pkey;
ALTER TABLE IF EXISTS ONLY public.permissions DROP CONSTRAINT IF EXISTS permissions_pkey;
ALTER TABLE IF EXISTS ONLY public.pengumuman DROP CONSTRAINT IF EXISTS pengumuman_pkey;
ALTER TABLE IF EXISTS ONLY public.pendaftar_spmb DROP CONSTRAINT IF EXISTS pendaftar_spmb_pkey;
ALTER TABLE IF EXISTS ONLY public.kuota_gelombang DROP CONSTRAINT IF EXISTS kuota_gelombang_pkey;
ALTER TABLE IF EXISTS ONLY public.jurusan DROP CONSTRAINT IF EXISTS jurusan_pkey;
ALTER TABLE IF EXISTS ONLY public.gelombang_spmb DROP CONSTRAINT IF EXISTS gelombang_spmb_pkey;
ALTER TABLE IF EXISTS ONLY public.email_logs DROP CONSTRAINT IF EXISTS email_logs_pkey;
ALTER TABLE IF EXISTS ONLY public.berita DROP CONSTRAINT IF EXISTS berita_pkey;
ALTER TABLE IF EXISTS ONLY public.audit_logs DROP CONSTRAINT IF EXISTS audit_logs_pkey;
ALTER TABLE IF EXISTS ONLY public._prisma_migrations DROP CONSTRAINT IF EXISTS _prisma_migrations_pkey;
DROP TABLE IF EXISTS public.users;
DROP TABLE IF EXISTS public.user_roles;
DROP TABLE IF EXISTS public.settings;
DROP TABLE IF EXISTS public.roles;
DROP TABLE IF EXISTS public.role_permissions;
DROP TABLE IF EXISTS public.permissions;
DROP TABLE IF EXISTS public.pengumuman;
DROP TABLE IF EXISTS public.pendaftar_spmb;
DROP TABLE IF EXISTS public.kuota_gelombang;
DROP TABLE IF EXISTS public.jurusan;
DROP TABLE IF EXISTS public.gelombang_spmb;
DROP TABLE IF EXISTS public.email_logs;
DROP TABLE IF EXISTS public.berita;
DROP TABLE IF EXISTS public.audit_logs;
DROP TABLE IF EXISTS public._prisma_migrations;
DROP TYPE IF EXISTS public."StatusPendaftar";
DROP TYPE IF EXISTS public."StatusPembayaran";
DROP TYPE IF EXISTS public."StatusBerita";
DROP TYPE IF EXISTS public."MetodePembayaran";
DROP TYPE IF EXISTS public."JenisKelamin";
DROP TYPE IF EXISTS public."Agama";
-- *not* dropping schema, since initdb creates it
--
-- Name: public; Type: SCHEMA; Schema: -; Owner: -
--

-- *not* creating schema, since initdb creates it


--
-- Name: SCHEMA public; Type: COMMENT; Schema: -; Owner: -
--

COMMENT ON SCHEMA public IS '';


--
-- Name: Agama; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public."Agama" AS ENUM (
    'ISLAM',
    'KRISTEN',
    'KATOLIK',
    'HINDU',
    'BUDDHA',
    'KHONGHUCU'
);


--
-- Name: JenisKelamin; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public."JenisKelamin" AS ENUM (
    'L',
    'P'
);


--
-- Name: MetodePembayaran; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public."MetodePembayaran" AS ENUM (
    'CASH',
    'TRANSFER'
);


--
-- Name: StatusBerita; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public."StatusBerita" AS ENUM (
    'DRAFT',
    'PUBLISHED'
);


--
-- Name: StatusPembayaran; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public."StatusPembayaran" AS ENUM (
    'BELUM',
    'LUNAS'
);


--
-- Name: StatusPendaftar; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public."StatusPendaftar" AS ENUM (
    'MENUNGGU_PERSETUJUAN',
    'DITOLAK',
    'SISWA_AKTIF',
    'MENUNGGU_PEMBAYARAN',
    'MENUNGGU_UKURAN_BAJU'
);


SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- Name: _prisma_migrations; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public._prisma_migrations (
    id character varying(36) NOT NULL,
    checksum character varying(64) NOT NULL,
    finished_at timestamp with time zone,
    migration_name character varying(255) NOT NULL,
    logs text,
    rolled_back_at timestamp with time zone,
    started_at timestamp with time zone DEFAULT now() NOT NULL,
    applied_steps_count integer DEFAULT 0 NOT NULL
);


--
-- Name: audit_logs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.audit_logs (
    id text NOT NULL,
    "userId" text,
    action text NOT NULL,
    module text NOT NULL,
    "entityType" text,
    "entityId" text,
    "ipAddress" text,
    "userAgent" text,
    meta jsonb,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


--
-- Name: berita; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.berita (
    id text NOT NULL,
    judul text NOT NULL,
    slug text NOT NULL,
    foto text NOT NULL,
    isi text NOT NULL,
    hashtag text[],
    status public."StatusBerita" DEFAULT 'DRAFT'::public."StatusBerita" NOT NULL,
    "publishedAt" timestamp(3) without time zone,
    "createdByUserId" text NOT NULL,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone NOT NULL,
    "deletedAt" timestamp(3) without time zone
);


--
-- Name: email_logs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.email_logs (
    id text NOT NULL,
    "to" text NOT NULL,
    subject text NOT NULL,
    body text NOT NULL,
    status text NOT NULL,
    error text,
    "relatedType" text,
    "relatedId" text,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


--
-- Name: gelombang_spmb; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.gelombang_spmb (
    id text NOT NULL,
    name text NOT NULL,
    "startDate" timestamp(3) without time zone NOT NULL,
    "endDate" timestamp(3) without time zone,
    "isActive" boolean DEFAULT false NOT NULL,
    "tanggalDaftarUlang" timestamp(3) without time zone,
    "jamDaftarUlang" text,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone NOT NULL
);


--
-- Name: jurusan; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.jurusan (
    id text NOT NULL,
    code text NOT NULL,
    name text NOT NULL,
    "isActive" boolean DEFAULT true NOT NULL,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone NOT NULL,
    "deletedAt" timestamp(3) without time zone,
    "deletedByUserId" text
);


--
-- Name: kuota_gelombang; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.kuota_gelombang (
    id text NOT NULL,
    "gelombangId" text NOT NULL,
    "jurusanId" text NOT NULL,
    quota integer DEFAULT 0 NOT NULL
);


--
-- Name: pendaftar_spmb; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.pendaftar_spmb (
    id text NOT NULL,
    "registrationNumber" text NOT NULL,
    "namaLengkap" text NOT NULL,
    "jenisKelamin" public."JenisKelamin" NOT NULL,
    "tempatLahir" text NOT NULL,
    "tanggalLahir" timestamp(3) without time zone NOT NULL,
    nisn text,
    "sekolahAsal" text NOT NULL,
    alamat text NOT NULL,
    "noTelp" text NOT NULL,
    email text,
    "jumlahNilaiUn" numeric(6,2),
    prestasi text,
    "namaIbu" text NOT NULL,
    "noTelpOrtu" text NOT NULL,
    "jurusanId" text NOT NULL,
    "gelombangId" text NOT NULL,
    status public."StatusPendaftar" DEFAULT 'MENUNGGU_PERSETUJUAN'::public."StatusPendaftar" NOT NULL,
    "verifiedById" text,
    "verifiedAt" timestamp(3) without time zone,
    "rejectionNote" text,
    "approvedById" text,
    "approvedAt" timestamp(3) without time zone,
    "pdfPath" text,
    "pdfGeneratedAt" timestamp(3) without time zone,
    "pdfSignature" text,
    "daftarUlangConfirmedAt" timestamp(3) without time zone,
    "daftarUlangConfirmedByUserId" text,
    "userId" text,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone NOT NULL,
    agama public."Agama",
    "ukuranBaju" text,
    "nominalPembayaran" numeric(12,2),
    "statusPembayaran" public."StatusPembayaran" DEFAULT 'BELUM'::public."StatusPembayaran" NOT NULL,
    "metodePembayaran" public."MetodePembayaran",
    "tanggalBayar" timestamp(3) without time zone,
    "dibayarOlehUserId" text,
    "tanggalUkuranBaju" timestamp(3) without time zone,
    "ukuranBajuDisetOlehUserId" text
);


--
-- Name: pengumuman; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.pengumuman (
    id text NOT NULL,
    judul text NOT NULL,
    foto text NOT NULL,
    aktif boolean DEFAULT true NOT NULL,
    urutan integer DEFAULT 0 NOT NULL,
    "createdByUserId" text NOT NULL,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone NOT NULL,
    "deletedAt" timestamp(3) without time zone,
    "tanggalMulai" timestamp(3) without time zone,
    "tanggalSelesai" timestamp(3) without time zone
);


--
-- Name: permissions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.permissions (
    id text NOT NULL,
    code text NOT NULL,
    module text NOT NULL,
    action text NOT NULL,
    description text,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


--
-- Name: role_permissions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.role_permissions (
    "roleId" text NOT NULL,
    "permissionId" text NOT NULL,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


--
-- Name: roles; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.roles (
    id text NOT NULL,
    name text NOT NULL,
    description text,
    "isSystem" boolean DEFAULT false NOT NULL,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone NOT NULL
);


--
-- Name: settings; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.settings (
    key text NOT NULL,
    value text NOT NULL,
    description text,
    "updatedByUserId" text,
    "updatedAt" timestamp(3) without time zone NOT NULL,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


--
-- Name: user_roles; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.user_roles (
    "userId" text NOT NULL,
    "roleId" text NOT NULL,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


--
-- Name: users; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.users (
    id text NOT NULL,
    email text NOT NULL,
    password text NOT NULL,
    name text NOT NULL,
    "isActive" boolean DEFAULT true NOT NULL,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone NOT NULL,
    "resetTokenHash" text,
    "resetTokenExpires" timestamp(3) without time zone
);


--
-- Data for Name: _prisma_migrations; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public._prisma_migrations (id, checksum, finished_at, migration_name, logs, rolled_back_at, started_at, applied_steps_count) FROM stdin;
0967857d-a979-4b9d-b56e-281dee40b513	f86b5e3087528f64f281de27f8bbe645ea9cfdc3dcd0aa05b92f5ce89707a350	2026-08-12 03:45:45.392616+00	20260812034544_	\N	\N	2026-08-12 03:45:44.719448+00	1
a99152ad-6c7d-4574-bdd5-95dccd2616b4	78a098a596557085b296d734ee1febe1c3535ea1467eeb0d308de6a7c88ed689	2026-08-18 03:57:38.560669+00	20260818120000_add_password_reset_fields	\N	\N	2026-08-18 03:57:38.513467+00	1
d5a20d63-9e83-4a5e-b89b-27e04dcc0906	cd2236650b1c8289d79792241c110e05037422fb1446a1e1567b49d5f696c8c9	2026-08-23 12:58:07.494137+00	20260818140000_add_ukuran_baju_and_settings	\N	\N	2026-08-23 12:58:07.396668+00	1
84dc732f-1c90-4864-ab97-e03f40e0fa70	d3608fcff05305a002ad333c1172699bdc2b79707e18c50d2b1cd5a5fbb64eb8	2026-08-23 13:43:07.103049+00	20260823000000_make_nisn_optional	\N	\N	2026-08-23 13:43:07.085326+00	1
ec49f3bf-e53b-4df6-8944-edcf5319c953	96d0e23ca0fc2806327e750a1294afd94a59c3a75379424edf64bf84ae3e7657	2026-08-23 14:15:07.918322+00	20260823100000_make_jumlah_nilai_un_optional	\N	\N	2026-08-23 14:15:07.697934+00	1
965d30ea-e10f-4ed3-9847-444bcb132c5c	eecb42eeedd93f0ea5220415a252e6400f51f663861e4acf8d093a9ecb90bfaa	2026-08-25 04:55:02.184178+00	20260825100000_split_pembayaran_ukuran_baju	\N	\N	2026-08-25 04:55:02.092102+00	1
\.


--
-- Data for Name: audit_logs; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.audit_logs (id, "userId", action, module, "entityType", "entityId", "ipAddress", "userAgent", meta, "createdAt") FROM stdin;
cmt8b1scz000ac2nqmfen6rs5	cmspjr5vk000m3ddgoi9d7a7y	gelombang.deleted	gelombang	Gelombang	cmsrhm20w0003qdq74pvkwcku	\N	\N	{"name": "PENDAFTARAN DIBUKA !!!", "endDate": "2026-08-14T00:00:00.000Z", "isActive": false, "startDate": "2026-08-13T00:00:00.000Z"}	2026-08-25 06:49:46.452
\.


--
-- Data for Name: berita; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.berita (id, judul, slug, foto, isi, hashtag, status, "publishedAt", "createdByUserId", "createdAt", "updatedAt", "deletedAt") FROM stdin;
cmsvpeh4m000b5dkzatr5gm0t	STOP PENGGUNAAN KNALPOT BRONG	stop-penggunaan-knalpot-brong	berita/5f1fb6e0fae623d5.jpg	Perihal: Larangan Penggunaan Knalpot Brong di Lingkungan Sekolah\n\nDiberitahukan kepada seluruh siswa-siswi SMK PGRI 3 Denpasar, sehubungan dengan upaya menjaga ketertiban, kenyamanan lingkungan belajar, serta menanamkan budaya disiplin berlalu lintas, maka dengan ini Guru Bimbingan Konseling (BK) bersama pihak manajemen sekolah menyampaikan hal-hal sebagai berikut:\n\nLarangan Penggunaan Knalpot Tidak Standar: Seluruh siswa dilarang keras menggunakan knalpot brong/bising pada kendaraan bermotor yang digunakan ke sekolah.\n\nKewajiban Standar Teknis: Kendaraan yang dibawa ke lingkungan sekolah wajib menggunakan knalpot standar pabrik dan memenuhi kelengkapan teknis lainnya (spion, plat nomor, dan lampu).\n\nTindakan Disiplin: Guru BK akan melakukan pemantauan dan penertiban secara berkala di area parkir sekolah. Bagi siswa yang kedapatan masih menggunakan knalpot brong, akan dikenakan tindakan berupa:\n\nPendataan dan teguran tertulis.\n\nKewajiban mengganti knalpot standar saat itu juga.\n\nPemanggilan orang tua/wali murid apabila pelanggaran dilakukan berulang.\n\nMari kita wujudkan lingkungan SMK PGRI 3 Denpasar yang disiplin, kondusif, dan menghargai kenyamanan masyarakat di sekitar sekolah.\n\nDemikian pemberitahuan ini disampaikan untuk dipatuhi oleh seluruh siswa-siswi SMK PGRI 3 Denpasar. Atas perhatian dan kerja samanya, kami ucapkan terima kasih.	{#SMKPGRI3DPS}	PUBLISHED	2026-08-16 11:10:42.584	cmspjr5vk000m3ddgoi9d7a7y	2026-08-16 11:10:32.758	2026-08-16 11:10:42.585	\N
\.


--
-- Data for Name: email_logs; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.email_logs (id, "to", subject, body, status, error, "relatedType", "relatedId", "createdAt") FROM stdin;
cmsrho8f3000bqdq7nbje1017	aryantara35@gmail.com	[SPMB] Pendaftaran diterima: REG-20260813-001	\n        Halo,\n        Pendaftaran Anda di SPMB SMK PGRI 3 Denpasar telah kami terima.\n        Nomor Pendaftaran: REG-20260813-001\n        Simpan nomor ini untuk mengecek status pendaftaran Anda.\n        Terima kasih.\n      	sent	\N	pendaftar	\N	2026-08-13 12:23:06.399
cmsrho8fg000cqdq72ednqk78	superadmin@smk-pgri3dps.sch.id	[SPMB] Pendaftar baru: REG-20260813-001 - Bayu Suta	\n        Halo Admin,\n        Ada pendaftar baru di SPMB SMK PGRI 3 Denpasar:\n        \n          No. Pendaftaran: REG-20260813-001\n          Nama: Bayu Suta\n        \n        Segera lakukan verifikasi di dashboard admin (menu Pendaftar).\n      	sent	\N	pendaftar	\N	2026-08-13 12:23:06.413
cmsrhpmw4000hqdq7lrd397ve	aryantara35@gmail.com	[SPMB] Selamat! Anda resmi menjadi Siswa SMK PGRI 3 Denpasar (REG-20260813-001)	\n        Selamat!\n        Pendaftaran Anda telah disetujui oleh panitia SPMB. Anda resmi terdaftar sebagai\n           Siswa Aktif SMK PGRI 3 Denpasar.\n        Nomor Pendaftaran: REG-20260813-001\n        Terlampir pada email ini adalah Bukti Pendaftaran Ulang dalam format PDF.\n           Bukti ini berisi QR Code yang akan di-scan oleh petugas saat Anda datang ke sekolah\n           untuk melakukan daftar ulang fisik.\n        Anda juga dapat mengunduh ulang bukti pendaftaran ulang di\n           halaman Cek Status (cukup masukkan nomor pendaftaran Anda).\n        Disetujui oleh: Superadmin (superadmin@smk-pgri3dps.sch.id)\n        Sampai jumpa di hari pertama sekolah!\n      	sent	\N	pendaftar	\N	2026-08-13 12:24:11.813
cmsxzqmar000b9f0r6itkavpt	aryantara35@gmail.com	[SPMB] Pendaftaran diterima: REG-20260818-001	\n        Halo,\n        Pendaftaran Anda di SPMB SMK PGRI 3 Denpasar telah kami terima.\n        Nomor Pendaftaran: REG-20260818-001\n        Simpan nomor ini untuk mengecek status pendaftaran Anda.\n        Terima kasih.\n      	sent	\N	pendaftar	\N	2026-08-18 01:35:27.843
cmsxzqmbj000c9f0rg7d10qb7	superadmin@smk-pgri3dps.sch.id,arnoldriko024@gmail.com	[SPMB] Pendaftar baru: REG-20260818-001 - Aryan Tara	\n        Halo Admin,\n        Ada pendaftar baru di SPMB SMK PGRI 3 Denpasar:\n        \n          No. Pendaftaran: REG-20260818-001\n          Nama: Aryan Tara\n        \n        Segera lakukan verifikasi di dashboard admin (menu Pendaftar).\n      	sent	\N	pendaftar	\N	2026-08-18 01:35:27.872
cmsxzzcy0000h9f0rid0itjaa	aryantara35@gmail.com	[SPMB] Selamat! Anda resmi menjadi Siswa SMK PGRI 3 Denpasar (REG-20260818-001)	\n        Selamat!\n        Pendaftaran Anda telah disetujui oleh panitia SPMB. Anda resmi terdaftar sebagai\n           Siswa Aktif SMK PGRI 3 Denpasar.\n        Nomor Pendaftaran: REG-20260818-001\n        Terlampir pada email ini adalah Bukti Pendaftaran Ulang dalam format PDF.\n           Bukti ini berisi QR Code yang akan di-scan oleh petugas saat Anda datang ke sekolah\n           untuk melakukan daftar ulang fisik.\n        Anda juga dapat mengunduh ulang bukti pendaftaran ulang di\n           halaman Cek Status (cukup masukkan nomor pendaftaran Anda).\n        Disetujui oleh: Superadmin (superadmin@smk-pgri3dps.sch.id)\n        Sampai jumpa di hari pertama sekolah!\n      	sent	\N	pendaftar	\N	2026-08-18 01:42:15.624
cmsy54ich0002wdm3gszdl44h	superadmin@smk-pgri3dps.sch.id	[SPMB SMK PGRI 3 Denpasar] Reset Password Admin	\n        Halo Superadmin,\n        Kami menerima permintaan reset password untuk akun admin Anda di\n           SPMB SMK PGRI 3 Denpasar.\n        Klik tombol di bawah untuk mengatur password baru.\n           Link ini berlaku selama 30 menit dan hanya bisa dipakai sekali.\n        \n          \n            Reset Password\n          \n        \n        Jika tombol di atas tidak berfungsi, salin URL ini ke browser Anda:\n        http://localhost:5174/reset-password/de20401b119915cc7c5cac5ed6e44f2624f50bb249f18321e791b135291fe1e6\n        Jika Anda tidak meminta reset password, abaikan email ini.\n           Password Anda tidak akan berubah sampai Anda mengklik link di atas dan membuat password baru.\n        \n        \n          Email ini dikirim otomatis oleh sistem. Jangan balas.\n        \n      	sent	\N	user	\N	2026-08-18 04:06:13.986
cmsy5cpqz0002e1xuf38kzxaz	superadmin@smk-pgri3dps.sch.id	[SPMB SMK PGRI 3 Denpasar] Reset Password Admin	\n        Halo Superadmin,\n        Kami menerima permintaan reset password untuk akun admin Anda di\n           SPMB SMK PGRI 3 Denpasar.\n        Klik tombol di bawah untuk mengatur password baru.\n           Link ini berlaku selama 30 menit dan hanya bisa dipakai sekali.\n        \n          \n            Reset Password\n          \n        \n        Jika tombol di atas tidak berfungsi, salin URL ini ke browser Anda:\n        http://localhost:5174/reset-password/4d019043d653b8932f502b2080695947812042e4e0d44c0c99f66968de23d0e6\n        Jika Anda tidak meminta reset password, abaikan email ini.\n           Password Anda tidak akan berubah sampai Anda mengklik link di atas dan membuat password baru.\n        \n        \n          Email ini dikirim otomatis oleh sistem. Jangan balas.\n        \n      	sent	\N	user	\N	2026-08-18 04:12:36.827
cmsy5ij8z0005e1xu00bjcvda	arnoldriko024@gmail.com	[SPMB SMK PGRI 3 Denpasar] Reset Password Admin	\n        Halo I Ketut Pasek Bayu Suta,\n        Kami menerima permintaan reset password untuk akun admin Anda di\n           SPMB SMK PGRI 3 Denpasar.\n        Klik tombol di bawah untuk mengatur password baru.\n           Link ini berlaku selama 30 menit dan hanya bisa dipakai sekali.\n        \n          \n            Reset Password\n          \n        \n        Jika tombol di atas tidak berfungsi, salin URL ini ke browser Anda:\n        http://localhost:5174/reset-password/7eae46cdb7d48d6791fd2445e36f35686de01a9479f6b0abcce7496c99316d42\n        Jika Anda tidak meminta reset password, abaikan email ini.\n           Password Anda tidak akan berubah sampai Anda mengklik link di atas dan membuat password baru.\n        \n        \n          Email ini dikirim otomatis oleh sistem. Jangan balas.\n        \n      	sent	\N	user	\N	2026-08-18 04:17:08.339
cmt10af520002g5wqjjagxt6l	aryantara35@gmail.com	[SPMB] Pendaftaran diterima: REG-20260820-001	\n        Halo,\n        Pendaftaran Anda di SPMB SMK PGRI 3 Denpasar telah kami terima.\n        Nomor Pendaftaran: REG-20260820-001\n        Simpan nomor ini untuk mengecek status pendaftaran Anda.\n        Terima kasih.\n      	sent	\N	pendaftar	\N	2026-08-20 04:14:10.214
cmt10af5d0003g5wq3tqyjoel	superadmin@smk-pgri3dps.sch.id,arnoldriko024@gmail.com	[SPMB] Pendaftar baru: REG-20260820-001 - RIKA 	\n        Halo Admin,\n        Ada pendaftar baru di SPMB SMK PGRI 3 Denpasar:\n        \n          No. Pendaftaran: REG-20260820-001\n          Nama: RIKA \n        \n        Segera lakukan verifikasi di dashboard admin (menu Pendaftar).\n      	sent	\N	pendaftar	\N	2026-08-20 04:14:10.226
cmt10bhzn0008g5wqz7zywne5	aryantara35@gmail.com	[SPMB] Selamat! Anda resmi menjadi Siswa SMK PGRI 3 Denpasar (REG-20260820-001)	\n        Selamat!\n        Pendaftaran Anda telah disetujui oleh panitia SPMB. Anda resmi terdaftar sebagai\n           Siswa Aktif SMK PGRI 3 Denpasar.\n        Nomor Pendaftaran: REG-20260820-001\n        Terlampir pada email ini adalah Bukti Pendaftaran Ulang dalam format PDF.\n           Bukti ini berisi QR Code yang akan di-scan oleh petugas saat Anda datang ke sekolah\n           untuk melakukan daftar ulang fisik.\n        Anda juga dapat mengunduh ulang bukti pendaftaran ulang di\n           halaman Cek Status (cukup masukkan nomor pendaftaran Anda).\n        Disetujui oleh: Superadmin (superadmin@smk-pgri3dps.sch.id)\n        Sampai jumpa di hari pertama sekolah!\n      	sent	\N	pendaftar	\N	2026-08-20 04:15:00.564
cmt5u87ha0004u5jk50q82ha8	aryantara35@gmail.com	[SPMB] Tanda Bukti Pendaftaran: REG-20260823-001	\n        Halo,\n        Terima kasih telah melakukan pendaftaran online di\n           SPMB SMK PGRI 3 Denpasar. Pendaftaran Anda telah kami terima.\n        Nomor Pendaftaran: REG-20260823-001\n        Status Anda saat ini: Menunggu Daftar Ulang. Silakan datang langsung\n           ke sekolah untuk melakukan daftar ulang fisik dengan membawa dokumen\n           identitas dan dokumen yang diperlukan.\n        Terlampir pada email ini adalah Tanda Bukti Pendaftaran dalam format PDF.\n           Bukti ini berisi QR Code yang dapat dipindai untuk verifikasi status pendaftaran\n           Anda sewaktu-waktu.\n        Anda juga dapat mengunduh ulang tanda bukti pendaftaran di\n           halaman Cek Status (cukup masukkan nomor pendaftaran Anda).\n        Informasi lebih lanjut terkait teknis pelaksanaan tahun ajaran baru akan\n           diinformasikan melalui pihak sekolah.\n        Terima kasih.\n      	sent	\N	pendaftar	\N	2026-08-23 13:23:20.158
cmt5u87hm0005u5jkgn245e0b	superadmin@smk-pgri3dps.sch.id,arnoldriko024@gmail.com	[SPMB] Pendaftar baru: REG-20260823-001 - ANANDA	\n        Halo Admin,\n        Ada pendaftar baru di SPMB SMK PGRI 3 Denpasar:\n        \n          No. Pendaftaran: REG-20260823-001\n          Nama: ANANDA\n        \n        Segera lakukan verifikasi di dashboard admin (menu Pendaftar).\n      	sent	\N	pendaftar	\N	2026-08-23 13:23:20.17
cmt5u9j2g000au5jky99g34x3	aryantara35@gmail.com	[SPMB] Selamat! Anda resmi menjadi Siswa SMK PGRI 3 Denpasar (REG-20260823-001)	\n        Selamat!\n        Pendaftaran Anda telah disetujui oleh panitia SPMB. Anda resmi terdaftar sebagai\n           Siswa Aktif SMK PGRI 3 Denpasar.\n        Nomor Pendaftaran: REG-20260823-001\n        Ukuran baju yang kami catat: L. Mohon gunakan ukuran ini saat pengambilan atribut sekolah.\n        Total pembayaran daftar ulang: Rp 350.000.\n        Terlampir pada email ini adalah Bukti Pendaftaran Ulang dalam format PDF.\n           Bukti ini berisi QR Code yang akan di-scan oleh petugas saat Anda datang ke sekolah\n           untuk melakukan daftar ulang fisik.\n        Anda juga dapat mengunduh ulang bukti pendaftaran ulang di\n           halaman Cek Status (cukup masukkan nomor pendaftaran Anda).\n        Disetujui oleh: Superadmin (superadmin@smk-pgri3dps.sch.id)\n        Informasi lebih lanjut terkait teknis pelaksanaan tahun ajaran baru akan\n           diinformasikan melalui pihak sekolah.\n        Sampai jumpa di hari pertama sekolah!\n      	sent	\N	pendaftar	\N	2026-08-23 13:24:21.833
cmt5uyvke0004op10ubb31r9s	aryantara35@gmail.com	[SPMB] Tanda Bukti Pendaftaran: REG-20260823-002	\n        Halo,\n        Terima kasih telah melakukan pendaftaran online di\n           SPMB SMK PGRI 3 Denpasar. Pendaftaran Anda telah kami terima.\n        Nomor Pendaftaran: REG-20260823-002\n        Status Anda saat ini: Menunggu Daftar Ulang. Silakan datang langsung\n           ke sekolah untuk melakukan daftar ulang fisik dengan membawa dokumen\n           identitas dan dokumen yang diperlukan.\n        Terlampir pada email ini adalah Tanda Bukti Pendaftaran dalam format PDF.\n           Bukti ini berisi QR Code yang dapat dipindai untuk verifikasi status pendaftaran\n           Anda sewaktu-waktu.\n        Anda juga dapat mengunduh ulang tanda bukti pendaftaran di\n           halaman Cek Status (cukup masukkan nomor pendaftaran Anda).\n        Informasi lebih lanjut terkait teknis pelaksanaan tahun ajaran baru akan\n           diinformasikan melalui pihak sekolah.\n        Terima kasih.\n      	sent	\N	pendaftar	\N	2026-08-23 13:44:04.431
cmt5uyvku0005op10sufv5jx7	superadmin@smk-pgri3dps.sch.id,arnoldriko024@gmail.com	[SPMB] Pendaftar baru: REG-20260823-002 - RISTA	\n        Halo Admin,\n        Ada pendaftar baru di SPMB SMK PGRI 3 Denpasar:\n        \n          No. Pendaftaran: REG-20260823-002\n          Nama: RISTA\n        \n        Segera lakukan verifikasi di dashboard admin (menu Pendaftar).\n      	sent	\N	pendaftar	\N	2026-08-23 13:44:04.447
cmt5vra400004jp1sa9b6fxrg	aryantara35@gmail.com	[SPMB] Tanda Bukti Pendaftaran: REG-20260823-003	\n        Halo,\n        Terima kasih telah melakukan pendaftaran online di\n           SPMB SMK PGRI 3 Denpasar. Pendaftaran Anda telah kami terima.\n        Nomor Pendaftaran: REG-20260823-003\n        Status Anda saat ini: Menunggu Daftar Ulang. Silakan datang langsung\n           ke sekolah untuk melakukan daftar ulang fisik dengan membawa dokumen\n           identitas dan dokumen yang diperlukan.\n        Terlampir pada email ini adalah Tanda Bukti Pendaftaran dalam format PDF.\n           Bukti ini berisi QR Code yang dapat dipindai untuk verifikasi status pendaftaran\n           Anda sewaktu-waktu.\n        Anda juga dapat mengunduh ulang tanda bukti pendaftaran di\n           halaman Cek Status (cukup masukkan nomor pendaftaran Anda).\n        Informasi lebih lanjut terkait teknis pelaksanaan tahun ajaran baru akan\n           diinformasikan melalui pihak sekolah.\n        Terima kasih.\n      	sent	\N	pendaftar	\N	2026-08-23 14:06:09.648
cmt5vra470005jp1sg3wzov2i	superadmin@smk-pgri3dps.sch.id,arnoldriko024@gmail.com	[SPMB] Pendaftar baru: REG-20260823-003 - NINI	\n        Halo Admin,\n        Ada pendaftar baru di SPMB SMK PGRI 3 Denpasar:\n        \n          No. Pendaftaran: REG-20260823-003\n          Nama: NINI\n        \n        Segera lakukan verifikasi di dashboard admin (menu Pendaftar).\n      	sent	\N	pendaftar	\N	2026-08-23 14:06:09.655
cmt5wehze0004uvsjskbgzcrs	aryantara35@gmail.com	[SPMB] Tanda Bukti Pendaftaran: REG-20260823-004	\n        Halo,\n        Terima kasih telah melakukan pendaftaran online di\n           SPMB SMK PGRI 3 Denpasar. Pendaftaran Anda telah kami terima.\n        Nomor Pendaftaran: REG-20260823-004\n        Status Anda saat ini: Menunggu Daftar Ulang. Silakan datang langsung\n           ke sekolah untuk melakukan daftar ulang fisik dengan membawa dokumen\n           identitas dan dokumen yang diperlukan.\n        Terlampir pada email ini adalah Tanda Bukti Pendaftaran dalam format PDF.\n           Bukti ini berisi QR Code yang dapat dipindai untuk verifikasi status pendaftaran\n           Anda sewaktu-waktu.\n        Anda juga dapat mengunduh ulang tanda bukti pendaftaran di\n           halaman Cek Status (cukup masukkan nomor pendaftaran Anda).\n        Informasi lebih lanjut terkait teknis pelaksanaan tahun ajaran baru akan\n           diinformasikan melalui pihak sekolah.\n        Terima kasih.\n      	sent	\N	pendaftar	\N	2026-08-23 14:24:12.939
cmt5wehzr0005uvsjrnte4v5s	superadmin@smk-pgri3dps.sch.id,arnoldriko024@gmail.com	[SPMB] Pendaftar baru: REG-20260823-004 - PANDU	\n        Halo Admin,\n        Ada pendaftar baru di SPMB SMK PGRI 3 Denpasar:\n        \n          No. Pendaftaran: REG-20260823-004\n          Nama: PANDU\n        \n        Segera lakukan verifikasi di dashboard admin (menu Pendaftar).\n      	sent	\N	pendaftar	\N	2026-08-23 14:24:12.951
cmt5wpqq40004vgjp38hwnqj9	aryantara35@gmail.com	[SPMB] Tanda Bukti Pendaftaran: REG-20260823-005	\n        Halo,\n        Terima kasih telah melakukan pendaftaran online di\n           SPMB SMK PGRI 3 Denpasar. Pendaftaran Anda telah kami terima.\n        Nomor Pendaftaran: REG-20260823-005\n        Status Anda saat ini: Menunggu Daftar Ulang. Silakan datang langsung\n           ke sekolah untuk melakukan daftar ulang fisik dengan membawa dokumen\n           identitas dan dokumen yang diperlukan.\n        Terlampir pada email ini adalah Tanda Bukti Pendaftaran dalam format PDF.\n           Bukti ini berisi QR Code yang dapat dipindai untuk verifikasi status pendaftaran\n           Anda sewaktu-waktu.\n        Anda juga dapat mengunduh ulang tanda bukti pendaftaran di\n           halaman Cek Status (cukup masukkan nomor pendaftaran Anda).\n        Informasi lebih lanjut terkait teknis pelaksanaan tahun ajaran baru akan\n           diinformasikan melalui pihak sekolah.\n        Terima kasih.\n      	sent	\N	pendaftar	\N	2026-08-23 14:32:57.485
cmt5wpqqg0005vgjpmets7zex	superadmin@smk-pgri3dps.sch.id,arnoldriko024@gmail.com	[SPMB] Pendaftar baru: REG-20260823-005 - NITA	\n        Halo Admin,\n        Ada pendaftar baru di SPMB SMK PGRI 3 Denpasar:\n        \n          No. Pendaftaran: REG-20260823-005\n          Nama: NITA\n        \n        Segera lakukan verifikasi di dashboard admin (menu Pendaftar).\n      	sent	\N	pendaftar	\N	2026-08-23 14:32:57.497
cmt5wr1kl000avgjp64xxxipx	aryantara35@gmail.com	[SPMB] Selamat! Anda resmi menjadi Siswa SMK PGRI 3 Denpasar (REG-20260823-002)	\n        Selamat!\n        Pendaftaran Anda telah disetujui oleh panitia SPMB. Anda resmi terdaftar sebagai\n           Siswa Aktif SMK PGRI 3 Denpasar.\n        Nomor Pendaftaran: REG-20260823-002\n        Ukuran baju yang kami catat: L. Mohon gunakan ukuran ini saat pengambilan atribut sekolah.\n        Total pembayaran daftar ulang: Rp 350.000.\n        Terlampir pada email ini adalah Bukti Pendaftaran Ulang dalam format PDF.\n           Bukti ini berisi QR Code yang akan di-scan oleh petugas saat Anda datang ke sekolah\n           untuk melakukan daftar ulang fisik.\n        Anda juga dapat mengunduh ulang bukti pendaftaran ulang di\n           halaman Cek Status (cukup masukkan nomor pendaftaran Anda).\n        Disetujui oleh: Superadmin (superadmin@smk-pgri3dps.sch.id)\n        Informasi lebih lanjut terkait teknis pelaksanaan tahun ajaran baru akan\n           diinformasikan melalui pihak sekolah.\n        Sampai jumpa di hari pertama sekolah!\n      	sent	\N	pendaftar	\N	2026-08-23 14:33:58.197
cmt879kz20004pc5dflqc82wo	test.desentralisasi@example.com	[SPMB] Tanda Bukti Pendaftaran: REG-20260825-001	\n        Halo,\n        Terima kasih telah melakukan pendaftaran online di\n           SPMB SMK PGRI 3 Denpasar. Pendaftaran Anda telah kami terima.\n        Nomor Pendaftaran: REG-20260825-001\n        Status Anda saat ini: Menunggu Daftar Ulang. Silakan datang langsung\n           ke sekolah untuk melakukan daftar ulang fisik dengan membawa dokumen\n           identitas dan dokumen yang diperlukan.\n        Terlampir pada email ini adalah Tanda Bukti Pendaftaran dalam format PDF.\n           Bukti ini berisi QR Code yang dapat dipindai untuk verifikasi status pendaftaran\n           Anda sewaktu-waktu.\n        Anda juga dapat mengunduh ulang tanda bukti pendaftaran di\n           halaman Cek Status (cukup masukkan nomor pendaftaran Anda).\n        Informasi lebih lanjut terkait teknis pelaksanaan tahun ajaran baru akan\n           diinformasikan melalui pihak sekolah.\n        Terima kasih.\n      	sent	\N	pendaftar	\N	2026-08-25 05:03:51.663
cmt879kzb0005pc5dkt83rt10	arnoldriko024@gmail.com,superadmin@smk-pgri3dps.sch.id	[SPMB] Pendaftar baru: REG-20260825-001 - I KADEK TEST DESENTRALISASI	\n        Halo Admin,\n        Ada pendaftar baru di SPMB SMK PGRI 3 Denpasar:\n        \n          No. Pendaftaran: REG-20260825-001\n          Nama: I KADEK TEST DESENTRALISASI\n        \n        Segera lakukan verifikasi di dashboard admin (menu Pendaftar).\n      	sent	\N	pendaftar	\N	2026-08-25 05:03:51.672
cmt879yv5000cpc5dka0vr0i8	test.desentralisasi@example.com	[SPMB] Selamat! Anda resmi menjadi Siswa SMK PGRI 3 Denpasar (REG-20260825-001)	\n        Selamat!\n        Pendaftaran Anda telah disetujui oleh panitia SPMB. Anda resmi terdaftar sebagai\n           Siswa Aktif SMK PGRI 3 Denpasar.\n        Nomor Pendaftaran: REG-20260825-001\n        Ukuran baju yang kami catat: M. Mohon gunakan ukuran ini saat pengambilan atribut sekolah.\n        Total pembayaran daftar ulang: Rp 350.000.\n        Terlampir pada email ini adalah Bukti Pendaftaran Ulang dalam format PDF.\n           Bukti ini berisi QR Code yang akan di-scan oleh petugas saat Anda datang ke sekolah\n           untuk melakukan daftar ulang fisik.\n        Anda juga dapat mengunduh ulang bukti pendaftaran ulang di\n           halaman Cek Status (cukup masukkan nomor pendaftaran Anda).\n        Disetujui oleh: Tata Usaha (tu@smk-pgri3dps.sch.id)\n        Informasi lebih lanjut terkait teknis pelaksanaan tahun ajaran baru akan\n           diinformasikan melalui pihak sekolah.\n        Sampai jumpa di hari pertama sekolah!\n      	sent	\N	pendaftar	\N	2026-08-25 05:04:09.665
cmt87a6n4000hpc5dfalbv67s	test.reverse@example.com	[SPMB] Tanda Bukti Pendaftaran: REG-20260825-002	\n        Halo,\n        Terima kasih telah melakukan pendaftaran online di\n           SPMB SMK PGRI 3 Denpasar. Pendaftaran Anda telah kami terima.\n        Nomor Pendaftaran: REG-20260825-002\n        Status Anda saat ini: Menunggu Daftar Ulang. Silakan datang langsung\n           ke sekolah untuk melakukan daftar ulang fisik dengan membawa dokumen\n           identitas dan dokumen yang diperlukan.\n        Terlampir pada email ini adalah Tanda Bukti Pendaftaran dalam format PDF.\n           Bukti ini berisi QR Code yang dapat dipindai untuk verifikasi status pendaftaran\n           Anda sewaktu-waktu.\n        Anda juga dapat mengunduh ulang tanda bukti pendaftaran di\n           halaman Cek Status (cukup masukkan nomor pendaftaran Anda).\n        Informasi lebih lanjut terkait teknis pelaksanaan tahun ajaran baru akan\n           diinformasikan melalui pihak sekolah.\n        Terima kasih.\n      	sent	\N	pendaftar	\N	2026-08-25 05:04:19.744
cmt87a6n7000ipc5dvz79fyxz	arnoldriko024@gmail.com,superadmin@smk-pgri3dps.sch.id	[SPMB] Pendaftar baru: REG-20260825-002 - NI PUTU TEST REVERSE	\n        Halo Admin,\n        Ada pendaftar baru di SPMB SMK PGRI 3 Denpasar:\n        \n          No. Pendaftaran: REG-20260825-002\n          Nama: NI PUTU TEST REVERSE\n        \n        Segera lakukan verifikasi di dashboard admin (menu Pendaftar).\n      	sent	\N	pendaftar	\N	2026-08-25 05:04:19.748
cmt87a7nb000ppc5dv172gbbc	test.reverse@example.com	[SPMB] Selamat! Anda resmi menjadi Siswa SMK PGRI 3 Denpasar (REG-20260825-002)	\n        Selamat!\n        Pendaftaran Anda telah disetujui oleh panitia SPMB. Anda resmi terdaftar sebagai\n           Siswa Aktif SMK PGRI 3 Denpasar.\n        Nomor Pendaftaran: REG-20260825-002\n        Ukuran baju yang kami catat: L. Mohon gunakan ukuran ini saat pengambilan atribut sekolah.\n        Total pembayaran daftar ulang: Rp 350.000.\n        Terlampir pada email ini adalah Bukti Pendaftaran Ulang dalam format PDF.\n           Bukti ini berisi QR Code yang akan di-scan oleh petugas saat Anda datang ke sekolah\n           untuk melakukan daftar ulang fisik.\n        Anda juga dapat mengunduh ulang bukti pendaftaran ulang di\n           halaman Cek Status (cukup masukkan nomor pendaftaran Anda).\n        Disetujui oleh: Bendahara (bendahara@smk-pgri3dps.sch.id)\n        Informasi lebih lanjut terkait teknis pelaksanaan tahun ajaran baru akan\n           diinformasikan melalui pihak sekolah.\n        Sampai jumpa di hari pertama sekolah!\n      	sent	\N	pendaftar	\N	2026-08-25 05:04:21.047
cmt87bq1b000upc5di0ds7r5j	reject@example.com	[SPMB] Tanda Bukti Pendaftaran: REG-20260825-003	\n        Halo,\n        Terima kasih telah melakukan pendaftaran online di\n           SPMB SMK PGRI 3 Denpasar. Pendaftaran Anda telah kami terima.\n        Nomor Pendaftaran: REG-20260825-003\n        Status Anda saat ini: Menunggu Daftar Ulang. Silakan datang langsung\n           ke sekolah untuk melakukan daftar ulang fisik dengan membawa dokumen\n           identitas dan dokumen yang diperlukan.\n        Terlampir pada email ini adalah Tanda Bukti Pendaftaran dalam format PDF.\n           Bukti ini berisi QR Code yang dapat dipindai untuk verifikasi status pendaftaran\n           Anda sewaktu-waktu.\n        Anda juga dapat mengunduh ulang tanda bukti pendaftaran di\n           halaman Cek Status (cukup masukkan nomor pendaftaran Anda).\n        Informasi lebih lanjut terkait teknis pelaksanaan tahun ajaran baru akan\n           diinformasikan melalui pihak sekolah.\n        Terima kasih.\n      	sent	\N	pendaftar	\N	2026-08-25 05:05:31.536
cmt87bq1f000vpc5d3iuv6zhq	arnoldriko024@gmail.com,superadmin@smk-pgri3dps.sch.id	[SPMB] Pendaftar baru: REG-20260825-003 - TEST REJECT TERMINAL	\n        Halo Admin,\n        Ada pendaftar baru di SPMB SMK PGRI 3 Denpasar:\n        \n          No. Pendaftaran: REG-20260825-003\n          Nama: TEST REJECT TERMINAL\n        \n        Segera lakukan verifikasi di dashboard admin (menu Pendaftar).\n      	sent	\N	pendaftar	\N	2026-08-25 05:05:31.539
cmt87bqtm0012pc5d9h9i2mdi	reject@example.com	[SPMB] Selamat! Anda resmi menjadi Siswa SMK PGRI 3 Denpasar (REG-20260825-003)	\n        Selamat!\n        Pendaftaran Anda telah disetujui oleh panitia SPMB. Anda resmi terdaftar sebagai\n           Siswa Aktif SMK PGRI 3 Denpasar.\n        Nomor Pendaftaran: REG-20260825-003\n        Ukuran baju yang kami catat: M. Mohon gunakan ukuran ini saat pengambilan atribut sekolah.\n        Total pembayaran daftar ulang: Rp 350.000.\n        Terlampir pada email ini adalah Bukti Pendaftaran Ulang dalam format PDF.\n           Bukti ini berisi QR Code yang akan di-scan oleh petugas saat Anda datang ke sekolah\n           untuk melakukan daftar ulang fisik.\n        Anda juga dapat mengunduh ulang bukti pendaftaran ulang di\n           halaman Cek Status (cukup masukkan nomor pendaftaran Anda).\n        Disetujui oleh: Tata Usaha (tu@smk-pgri3dps.sch.id)\n        Informasi lebih lanjut terkait teknis pelaksanaan tahun ajaran baru akan\n           diinformasikan melalui pihak sekolah.\n        Sampai jumpa di hari pertama sekolah!\n      	sent	\N	pendaftar	\N	2026-08-25 05:05:32.555
cmt87cdvl0018pc5d0nrvp98d	arnoldriko024@gmail.com,superadmin@smk-pgri3dps.sch.id	[SPMB] Pendaftar baru: REG-20260825-004 - TEST DEBUG	\n        Halo Admin,\n        Ada pendaftar baru di SPMB SMK PGRI 3 Denpasar:\n        \n          No. Pendaftaran: REG-20260825-004\n          Nama: TEST DEBUG\n        \n        Segera lakukan verifikasi di dashboard admin (menu Pendaftar).\n      	sent	\N	pendaftar	\N	2026-08-25 05:06:02.434
cmt87ev3v001epc5dmz9yw57r	arnoldriko024@gmail.com,superadmin@smk-pgri3dps.sch.id	[SPMB] Pendaftar baru: REG-20260825-005 - TEST REJECT FLOW	\n        Halo Admin,\n        Ada pendaftar baru di SPMB SMK PGRI 3 Denpasar:\n        \n          No. Pendaftaran: REG-20260825-005\n          Nama: TEST REJECT FLOW\n        \n        Segera lakukan verifikasi di dashboard admin (menu Pendaftar).\n      	sent	\N	pendaftar	\N	2026-08-25 05:07:58.075
cmt87evso001lpc5d4h8zg8yn	reject4477917@example.com	[SPMB] Selamat! Anda resmi menjadi Siswa SMK PGRI 3 Denpasar (REG-20260825-005)	\n        Selamat!\n        Pendaftaran Anda telah disetujui oleh panitia SPMB. Anda resmi terdaftar sebagai\n           Siswa Aktif SMK PGRI 3 Denpasar.\n        Nomor Pendaftaran: REG-20260825-005\n        Ukuran baju yang kami catat: M. Mohon gunakan ukuran ini saat pengambilan atribut sekolah.\n        Total pembayaran daftar ulang: Rp 350.000.\n        Terlampir pada email ini adalah Bukti Pendaftaran Ulang dalam format PDF.\n           Bukti ini berisi QR Code yang akan di-scan oleh petugas saat Anda datang ke sekolah\n           untuk melakukan daftar ulang fisik.\n        Anda juga dapat mengunduh ulang bukti pendaftaran ulang di\n           halaman Cek Status (cukup masukkan nomor pendaftaran Anda).\n        Disetujui oleh: Tata Usaha (tu@smk-pgri3dps.sch.id)\n        Informasi lebih lanjut terkait teknis pelaksanaan tahun ajaran baru akan\n           diinformasikan melalui pihak sekolah.\n        Sampai jumpa di hari pertama sekolah!\n      	sent	\N	pendaftar	\N	2026-08-25 05:07:58.968
cmt87cdvf0017pc5dimh7oi4q	debug@example.com	[SPMB] Tanda Bukti Pendaftaran: REG-20260825-004	\n        Halo,\n        Terima kasih telah melakukan pendaftaran online di\n           SPMB SMK PGRI 3 Denpasar. Pendaftaran Anda telah kami terima.\n        Nomor Pendaftaran: REG-20260825-004\n        Status Anda saat ini: Menunggu Daftar Ulang. Silakan datang langsung\n           ke sekolah untuk melakukan daftar ulang fisik dengan membawa dokumen\n           identitas dan dokumen yang diperlukan.\n        Terlampir pada email ini adalah Tanda Bukti Pendaftaran dalam format PDF.\n           Bukti ini berisi QR Code yang dapat dipindai untuk verifikasi status pendaftaran\n           Anda sewaktu-waktu.\n        Anda juga dapat mengunduh ulang tanda bukti pendaftaran di\n           halaman Cek Status (cukup masukkan nomor pendaftaran Anda).\n        Informasi lebih lanjut terkait teknis pelaksanaan tahun ajaran baru akan\n           diinformasikan melalui pihak sekolah.\n        Terima kasih.\n      	sent	\N	pendaftar	\N	2026-08-25 05:06:02.428
cmt87ev3r001dpc5dzim37yed	reject4477917@example.com	[SPMB] Tanda Bukti Pendaftaran: REG-20260825-005	\n        Halo,\n        Terima kasih telah melakukan pendaftaran online di\n           SPMB SMK PGRI 3 Denpasar. Pendaftaran Anda telah kami terima.\n        Nomor Pendaftaran: REG-20260825-005\n        Status Anda saat ini: Menunggu Daftar Ulang. Silakan datang langsung\n           ke sekolah untuk melakukan daftar ulang fisik dengan membawa dokumen\n           identitas dan dokumen yang diperlukan.\n        Terlampir pada email ini adalah Tanda Bukti Pendaftaran dalam format PDF.\n           Bukti ini berisi QR Code yang dapat dipindai untuk verifikasi status pendaftaran\n           Anda sewaktu-waktu.\n        Anda juga dapat mengunduh ulang tanda bukti pendaftaran di\n           halaman Cek Status (cukup masukkan nomor pendaftaran Anda).\n        Informasi lebih lanjut terkait teknis pelaksanaan tahun ajaran baru akan\n           diinformasikan melalui pihak sekolah.\n        Terima kasih.\n      	sent	\N	pendaftar	\N	2026-08-25 05:07:58.071
cmt87fowh00045t8x3e611kj1	rejonly34516488@example.com	[SPMB] Tanda Bukti Pendaftaran: REG-20260825-006	\n        Halo,\n        Terima kasih telah melakukan pendaftaran online di\n           SPMB SMK PGRI 3 Denpasar. Pendaftaran Anda telah kami terima.\n        Nomor Pendaftaran: REG-20260825-006\n        Status Anda saat ini: Menunggu Daftar Ulang. Silakan datang langsung\n           ke sekolah untuk melakukan daftar ulang fisik dengan membawa dokumen\n           identitas dan dokumen yang diperlukan.\n        Terlampir pada email ini adalah Tanda Bukti Pendaftaran dalam format PDF.\n           Bukti ini berisi QR Code yang dapat dipindai untuk verifikasi status pendaftaran\n           Anda sewaktu-waktu.\n        Anda juga dapat mengunduh ulang tanda bukti pendaftaran di\n           halaman Cek Status (cukup masukkan nomor pendaftaran Anda).\n        Informasi lebih lanjut terkait teknis pelaksanaan tahun ajaran baru akan\n           diinformasikan melalui pihak sekolah.\n        Terima kasih.\n      	sent	\N	pendaftar	\N	2026-08-25 05:08:36.69
cmt87fowv00055t8xglgvyeye	arnoldriko024@gmail.com,superadmin@smk-pgri3dps.sch.id	[SPMB] Pendaftar baru: REG-20260825-006 - TEST REJECT ONLY	\n        Halo Admin,\n        Ada pendaftar baru di SPMB SMK PGRI 3 Denpasar:\n        \n          No. Pendaftaran: REG-20260825-006\n          Nama: TEST REJECT ONLY\n        \n        Segera lakukan verifikasi di dashboard admin (menu Pendaftar).\n      	sent	\N	pendaftar	\N	2026-08-25 05:08:36.704
cmt87fp5300085t8xy4h1zwr3	rejonly34516488@example.com	[SPMB] Update status pendaftaran REG-20260825-006: Ditolak	\n        Halo,\n        Status pendaftaran Anda (REG-20260825-006) telah diperbarui menjadi:\n        Ditolak\n        Catatan: Test reject only\n        Cek detail di halaman cek status SPMB SMK PGRI 3 Denpasar.\n      	sent	\N	pendaftar	\N	2026-08-25 05:08:37
cmt87of080006dtxla9mu9d68	debug@example.com	[SPMB] Selamat! Anda resmi menjadi Siswa SMK PGRI 3 Denpasar (REG-20260825-004)	\n        Selamat!\n        Pendaftaran Anda telah disetujui oleh panitia SPMB. Anda resmi terdaftar sebagai\n           Siswa Aktif SMK PGRI 3 Denpasar.\n        Nomor Pendaftaran: REG-20260825-004\n        Ukuran baju yang kami catat: L. Mohon gunakan ukuran ini saat pengambilan atribut sekolah.\n        Total pembayaran daftar ulang: Rp 350.000.\n        Terlampir pada email ini adalah Bukti Pendaftaran Ulang dalam format PDF.\n           Bukti ini berisi QR Code yang akan di-scan oleh petugas saat Anda datang ke sekolah\n           untuk melakukan daftar ulang fisik.\n        Anda juga dapat mengunduh ulang bukti pendaftaran ulang di\n           halaman Cek Status (cukup masukkan nomor pendaftaran Anda).\n        Disetujui oleh: Superadmin (superadmin@smk-pgri3dps.sch.id)\n        Informasi lebih lanjut terkait teknis pelaksanaan tahun ajaran baru akan\n           diinformasikan melalui pihak sekolah.\n        Sampai jumpa di hari pertama sekolah!\n      	sent	\N	pendaftar	\N	2026-08-25 05:15:23.768
\.


--
-- Data for Name: gelombang_spmb; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.gelombang_spmb (id, name, "startDate", "endDate", "isActive", "tanggalDaftarUlang", "jamDaftarUlang", "createdAt", "updatedAt") FROM stdin;
cmsxzp58100039f0rftrl20l6	GELOMBANG 2	2026-08-18 00:00:00	2027-01-18 00:00:00	t	\N	\N	2026-08-18 01:34:19.057	2026-08-18 01:34:19.057
\.


--
-- Data for Name: jurusan; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.jurusan (id, code, name, "isActive", "createdAt", "updatedAt", "deletedAt", "deletedByUserId") FROM stdin;
cmspjvwcv000axxno3yring7f	KL	KULINER	t	2026-08-12 03:49:30.895	2026-08-12 03:49:30.895	\N	\N
cmspjwbeq000dxxnormdvtv2n	PH	PERHOTELAN	t	2026-08-12 03:49:50.403	2026-08-12 03:49:50.403	\N	\N
cmspjr5wb000n3ddgdrmybyel	TKJ	Teknik Komputer dan Jaringan	f	2026-08-12 03:45:49.979	2026-08-25 04:58:07.822	2026-08-12 03:48:27.178	cmspjr5vk000m3ddgoi9d7a7y
cmspjr5wj000o3ddger2rzxl9	MM	Multimedia	f	2026-08-12 03:45:49.987	2026-08-25 04:58:07.829	2026-08-12 03:48:23.464	cmspjr5vk000m3ddgoi9d7a7y
cmspjr5wn000p3ddgpjaeb9sr	AKL	Akuntansi dan Keuangan Lembaga	f	2026-08-12 03:45:49.991	2026-08-25 04:58:07.832	2026-08-12 03:48:17.848	cmspjr5vk000m3ddgoi9d7a7y
cmspjr5wr000q3ddgr7wazdb5	OTKP	Otomatisasi dan Tata Kelola Perkantoran	f	2026-08-12 03:45:49.995	2026-08-25 04:58:07.836	2026-08-12 03:48:25.265	cmspjr5vk000m3ddgoi9d7a7y
cmspjr5wv000r3ddgf56b2kwm	BDP	Bisnis Daring dan Pemasaran	f	2026-08-12 03:45:49.999	2026-08-25 04:58:07.839	2026-08-12 03:48:20.139	cmspjr5vk000m3ddgoi9d7a7y
\.


--
-- Data for Name: kuota_gelombang; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.kuota_gelombang (id, "gelombangId", "jurusanId", quota) FROM stdin;
cmsxzp58100059f0rwr0hx1kk	cmsxzp58100039f0rftrl20l6	cmspjvwcv000axxno3yring7f	200
cmsxzp58100069f0rsuqgmsfi	cmsxzp58100039f0rftrl20l6	cmspjwbeq000dxxnormdvtv2n	200
\.


--
-- Data for Name: pendaftar_spmb; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.pendaftar_spmb (id, "registrationNumber", "namaLengkap", "jenisKelamin", "tempatLahir", "tanggalLahir", nisn, "sekolahAsal", alamat, "noTelp", email, "jumlahNilaiUn", prestasi, "namaIbu", "noTelpOrtu", "jurusanId", "gelombangId", status, "verifiedById", "verifiedAt", "rejectionNote", "approvedById", "approvedAt", "pdfPath", "pdfGeneratedAt", "pdfSignature", "daftarUlangConfirmedAt", "daftarUlangConfirmedByUserId", "userId", "createdAt", "updatedAt", agama, "ukuranBaju", "nominalPembayaran", "statusPembayaran", "metodePembayaran", "tanggalBayar", "dibayarOlehUserId", "tanggalUkuranBaju", "ukuranBajuDisetOlehUserId") FROM stdin;
\.


--
-- Data for Name: pengumuman; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.pengumuman (id, judul, foto, aktif, urutan, "createdByUserId", "createdAt", "updatedAt", "deletedAt", "tanggalMulai", "tanggalSelesai") FROM stdin;
cmsvoo6o30001xk2g5bztg1d8	TEST: Aktif (no schedule)	pengumuman/1e5bd933c6600d39.png	f	1	cmspjr5vk000m3ddgoi9d7a7y	2026-08-16 10:50:06.146	2026-08-16 10:50:06.216	2026-08-16 10:50:06.213	\N	\N
cmsvoo6op0005xk2gr0xo4bg0	TEST: Terjadwal (mulai besok)	pengumuman/1e5bd933c6600d39.png	f	2	cmspjr5vk000m3ddgoi9d7a7y	2026-08-16 10:50:06.17	2026-08-16 10:50:06.232	2026-08-16 10:50:06.229	2026-08-17 00:00:00	2026-08-23 00:00:00
cmsvoo6p20009xk2g2yzirp3l	TEST: Berakhir (kemarin-kemarin)	pengumuman/1e5bd933c6600d39.png	f	3	cmspjr5vk000m3ddgoi9d7a7y	2026-08-16 10:50:06.182	2026-08-16 10:50:06.243	2026-08-16 10:50:06.241	2020-01-01 00:00:00	2020-12-31 00:00:00
cmsvoo6pd000dxk2gtl5oq58x	TEST: Unlimited (no akhir)	pengumuman/1e5bd933c6600d39.png	f	4	cmspjr5vk000m3ddgoi9d7a7y	2026-08-16 10:50:06.193	2026-08-16 10:50:06.255	2026-08-16 10:50:06.253	2026-08-15 00:00:00	\N
cmsvnwt790001p6dxi3gmqjap	SPMB 2027	pengumuman/1e5bd933c6600d39.png	f	1	cmspjr5vk000m3ddgoi9d7a7y	2026-08-16 10:28:48.977	2026-08-16 11:03:20.743	2026-08-16 11:03:20.742	\N	\N
cmsvp6cix00035dkzshikkpyc	STOP PENGGUNAAN KNALPOT BRONG	pengumuman/16c5080dcb87f24d.jpg	t	1	cmspjr5vk000m3ddgoi9d7a7y	2026-08-16 11:04:13.544	2026-08-16 11:04:13.544	\N	2026-08-16 00:00:00	\N
cmsvp6xmn00075dkz3mq6nfvz	PENGUMUMAN UNTUK SELURUH SISWA	pengumuman/945b6b3136a0435a.jpg	t	2	cmspjr5vk000m3ddgoi9d7a7y	2026-08-16 11:04:40.893	2026-08-16 11:04:40.893	\N	\N	\N
\.


--
-- Data for Name: permissions; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.permissions (id, code, module, action, description, "createdAt") FROM stdin;
cmspjr5ew00053ddg4ebwglnv	spmb.scan_daftar_ulang	spmb	scan	Scan QR pendaftar saat daftar ulang fisik	2026-08-12 03:45:49.352
cmspjr5f100063ddgiupcfsac	gelombang.view	gelombang	view	Lihat daftar gelombang	2026-08-12 03:45:49.357
cmspjr5f500073ddgh2c4456g	gelombang.manage	gelombang	manage	Buat/edit/nonaktifkan gelombang	2026-08-12 03:45:49.361
cmspjr5f900083ddgool4tedw	jurusan.view	jurusan	view	Lihat daftar jurusan	2026-08-12 03:45:49.366
cmspjr5fe00093ddgf9yj4da1	jurusan.manage	jurusan	manage	Kelola master jurusan	2026-08-12 03:45:49.371
cmspjr5fi000a3ddgtlqkkkej	user.view	user	view	Lihat daftar user	2026-08-12 03:45:49.375
cmspjr5fq000b3ddg9vc1wb13	user.manage	user	manage	Buat/edit/nonaktifkan user	2026-08-12 03:45:49.382
cmspjr5fv000c3ddgejslix4a	role.view	role	view	Lihat daftar role & permission	2026-08-12 03:45:49.387
cmspjr5fz000d3ddgofq8o4hp	role.manage	role	manage	Buat/edit role & atur permission	2026-08-12 03:45:49.391
cmspjr5g4000e3ddgbm3atzsv	statistik.view	statistik	view	Lihat dashboard statistik	2026-08-12 03:45:49.396
cmspjr5g8000f3ddgm0vceyu0	audit.view	audit	view	Lihat audit log	2026-08-12 03:45:49.401
cmspjr5gc000g3ddgfg0f1fcw	berita.view	berita	view	Lihat daftar berita	2026-08-12 03:45:49.405
cmspjr5gh000h3ddg36ikh2uh	berita.manage	berita	manage	Kelola berita (tulis, edit, publish, hapus)	2026-08-12 03:45:49.409
cmspjr5gl000i3ddgwrtdsevg	pengumuman.view	pengumuman	view	Lihat daftar pengumuman	2026-08-12 03:45:49.414
cmspjr5gq000j3ddgi7vl711m	pengumuman.manage	pengumuman	manage	Kelola pengumuman (tambah, edit, aktif/nonaktif, hapus)	2026-08-12 03:45:49.418
cmsrjrbl7000k1sc82suo0rqx	export.manage	export	manage	Export data agregat ke Excel/CSV (mis. daftar ulang multi-sheet)	2026-08-13 13:21:29.708
cmspjr5dz00003ddg68flufst	spmb.view	spmb	view	Lihat daftar pendaftar	2026-08-12 03:45:49.32
cmspjr5ed00013ddgg6wmshco	spmb.verify_berkas	spmb	verify	Verifikasi berkas pendaftar (admin)	2026-08-12 03:45:49.333
cmspjr5ei00023ddgmhzvpruw	spmb.approve	spmb	approve	Approve pendaftar (deprecated — pakai spmb.bayar + spmb.ukuran_baju)	2026-08-12 03:45:49.338
cmspjr5en00033ddguhve1812	spmb.reject	spmb	reject	Tolak pendaftar dengan alasan	2026-08-12 03:45:49.343
cmt871zzz0004zi4o0hd3kgit	spmb.bayar	spmb	pay	Catat pembayaran pendaftar (Bendahara)	2026-08-25 04:57:57.887
cmt8720020005zi4onv47b0bv	spmb.ukuran_baju	spmb	size	Input ukuran baju pendaftar (TU)	2026-08-25 04:57:57.891
cmspjr5er00043ddgw8wmuh9k	spmb.export	spmb	export	Export data Dapodik	2026-08-12 03:45:49.348
\.


--
-- Data for Name: role_permissions; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.role_permissions ("roleId", "permissionId", "createdAt") FROM stdin;
cmspjr5h2000k3ddg4p2hmh5p	cmspjr5dz00003ddg68flufst	2026-08-25 04:58:06.812
cmspjr5h2000k3ddg4p2hmh5p	cmspjr5ed00013ddgg6wmshco	2026-08-25 04:58:06.819
cmspjr5h2000k3ddg4p2hmh5p	cmspjr5ei00023ddgmhzvpruw	2026-08-25 04:58:06.823
cmspjr5h2000k3ddg4p2hmh5p	cmspjr5en00033ddguhve1812	2026-08-25 04:58:06.828
cmspjr5h2000k3ddg4p2hmh5p	cmt871zzz0004zi4o0hd3kgit	2026-08-25 04:58:06.835
cmspjr5h2000k3ddg4p2hmh5p	cmt8720020005zi4onv47b0bv	2026-08-25 04:58:06.84
cmspjr5h2000k3ddg4p2hmh5p	cmspjr5er00043ddgw8wmuh9k	2026-08-25 04:58:06.845
cmspjr5h2000k3ddg4p2hmh5p	cmspjr5ew00053ddg4ebwglnv	2026-08-25 04:58:06.849
cmspjr5h2000k3ddg4p2hmh5p	cmspjr5f100063ddgiupcfsac	2026-08-25 04:58:06.853
cmspjr5h2000k3ddg4p2hmh5p	cmspjr5f500073ddgh2c4456g	2026-08-25 04:58:06.857
cmspjr5h2000k3ddg4p2hmh5p	cmspjr5f900083ddgool4tedw	2026-08-25 04:58:06.861
cmspjr5h2000k3ddg4p2hmh5p	cmspjr5fe00093ddgf9yj4da1	2026-08-25 04:58:06.865
cmspjr5h2000k3ddg4p2hmh5p	cmspjr5fi000a3ddgtlqkkkej	2026-08-25 04:58:06.869
cmspjr5h2000k3ddg4p2hmh5p	cmspjr5fq000b3ddg9vc1wb13	2026-08-25 04:58:06.873
cmspjr5h2000k3ddg4p2hmh5p	cmspjr5fv000c3ddgejslix4a	2026-08-25 04:58:06.877
cmspjr5h2000k3ddg4p2hmh5p	cmspjr5fz000d3ddgofq8o4hp	2026-08-25 04:58:06.88
cmspjr5h2000k3ddg4p2hmh5p	cmspjr5g4000e3ddgbm3atzsv	2026-08-25 04:58:06.884
cmspjr5h2000k3ddg4p2hmh5p	cmspjr5g8000f3ddgm0vceyu0	2026-08-25 04:58:06.889
cmspjr5h2000k3ddg4p2hmh5p	cmspjr5gc000g3ddgfg0f1fcw	2026-08-25 04:58:06.893
cmspjr5h2000k3ddg4p2hmh5p	cmspjr5gh000h3ddg36ikh2uh	2026-08-25 04:58:06.897
cmspjr5h2000k3ddg4p2hmh5p	cmspjr5gl000i3ddgwrtdsevg	2026-08-25 04:58:06.901
cmspjr5h2000k3ddg4p2hmh5p	cmspjr5gq000j3ddgi7vl711m	2026-08-25 04:58:06.905
cmspjr5h2000k3ddg4p2hmh5p	cmsrjrbl7000k1sc82suo0rqx	2026-08-25 04:58:06.91
cmspjr5l0000l3ddgpqmcfjhy	cmspjr5dz00003ddg68flufst	2026-08-25 04:58:06.921
cmspjr5l0000l3ddgpqmcfjhy	cmspjr5ed00013ddgg6wmshco	2026-08-25 04:58:06.925
cmspjr5l0000l3ddgpqmcfjhy	cmspjr5ei00023ddgmhzvpruw	2026-08-25 04:58:06.928
cmspjr5l0000l3ddgpqmcfjhy	cmt871zzz0004zi4o0hd3kgit	2026-08-25 04:58:06.932
cmspjr5l0000l3ddgpqmcfjhy	cmt8720020005zi4onv47b0bv	2026-08-25 04:58:06.937
cmspjr5l0000l3ddgpqmcfjhy	cmspjr5en00033ddguhve1812	2026-08-25 04:58:06.941
cmspjr5l0000l3ddgpqmcfjhy	cmspjr5er00043ddgw8wmuh9k	2026-08-25 04:58:06.944
cmspjr5l0000l3ddgpqmcfjhy	cmspjr5ew00053ddg4ebwglnv	2026-08-25 04:58:06.948
cmspjr5l0000l3ddgpqmcfjhy	cmspjr5f100063ddgiupcfsac	2026-08-25 04:58:06.953
cmspjr5l0000l3ddgpqmcfjhy	cmspjr5f900083ddgool4tedw	2026-08-25 04:58:06.957
cmspjr5l0000l3ddgpqmcfjhy	cmspjr5fi000a3ddgtlqkkkej	2026-08-25 04:58:06.961
cmspjr5l0000l3ddgpqmcfjhy	cmspjr5g4000e3ddgbm3atzsv	2026-08-25 04:58:06.964
cmt87206k000nzi4ocdlscith	cmspjr5dz00003ddg68flufst	2026-08-25 04:58:06.976
cmt87206k000nzi4ocdlscith	cmt871zzz0004zi4o0hd3kgit	2026-08-25 04:58:06.98
cmt87206k000nzi4ocdlscith	cmspjr5ew00053ddg4ebwglnv	2026-08-25 04:58:06.984
cmt87206k000nzi4ocdlscith	cmspjr5f100063ddgiupcfsac	2026-08-25 04:58:06.988
cmt87206k000nzi4ocdlscith	cmspjr5f900083ddgool4tedw	2026-08-25 04:58:06.992
cmt87207d000ozi4o2jaoysq0	cmspjr5dz00003ddg68flufst	2026-08-25 04:58:07.006
cmt87207d000ozi4o2jaoysq0	cmt8720020005zi4onv47b0bv	2026-08-25 04:58:07.012
cmt87207d000ozi4o2jaoysq0	cmspjr5ew00053ddg4ebwglnv	2026-08-25 04:58:07.017
cmt87207d000ozi4o2jaoysq0	cmspjr5f100063ddgiupcfsac	2026-08-25 04:58:07.022
cmt87207d000ozi4o2jaoysq0	cmspjr5f900083ddgool4tedw	2026-08-25 04:58:07.027
\.


--
-- Data for Name: roles; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.roles (id, name, description, "isSystem", "createdAt", "updatedAt") FROM stdin;
cmspjr5h2000k3ddg4p2hmh5p	Superadmin	Akses penuh ke seluruh sistem	t	2026-08-12 03:45:49.431	2026-08-25 04:58:06.798
cmspjr5l0000l3ddgpqmcfjhy	Admin	Approve/reject pendaftar langsung dari list, cetak PDF, lihat statistik	t	2026-08-12 03:45:49.573	2026-08-25 04:58:06.914
cmt87206k000nzi4ocdlscith	Bendahara	Catat pembayaran pendaftar (CASH/TRANSFER) + scan QR daftar ulang	t	2026-08-25 04:57:58.124	2026-08-25 04:58:06.969
cmt87207d000ozi4o2jaoysq0	TU	Input ukuran baju pendaftar + scan QR daftar ulang	t	2026-08-25 04:57:58.153	2026-08-25 04:58:06.997
\.


--
-- Data for Name: settings; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.settings (key, value, description, "updatedByUserId", "updatedAt", "createdAt") FROM stdin;
harga_daftar_ulang	350000	Harga daftar ulang yang harus dibayar siswa saat approve. Snapshot ke pendaftar_spmb.nominalPembayaran saat approve supaya PDF historical konsisten walau harga berubah.	\N	2026-08-23 12:58:07.404	2026-08-23 12:58:07.404
ukuran_baju_options	XS,S,M,L,XL,XXL,XXXL	Daftar pilihan ukuran baju untuk form approve (CSV).	\N	2026-08-23 12:58:07.404	2026-08-23 12:58:07.404
\.


--
-- Data for Name: user_roles; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.user_roles ("userId", "roleId", "createdAt") FROM stdin;
cmspjr5vk000m3ddgoi9d7a7y	cmspjr5h2000k3ddg4p2hmh5p	2026-08-12 03:45:49.963
cmsvo318v0004p6dx7772tevh	cmspjr5l0000l3ddgpqmcfjhy	2026-08-16 10:33:39.344
cmt8727g9000otc56zj7lnuo1	cmt87206k000nzi4ocdlscith	2026-08-25 04:58:07.551
cmt8727nj000ptc56x2o3vhm4	cmt87207d000ozi4o2jaoysq0	2026-08-25 04:58:07.814
\.


--
-- Data for Name: users; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.users (id, email, password, name, "isActive", "createdAt", "updatedAt", "resetTokenHash", "resetTokenExpires") FROM stdin;
cmsvo318v0004p6dx7772tevh	arnoldriko024@gmail.com	$2b$12$8/Kd3vOJg2FmGwl2ci3KRu.DkQ57QIg5CoQis34nOd/0oZ5mClsrK	I Ketut Pasek Bayu Suta	t	2026-08-16 10:33:39.344	2026-08-18 04:17:08.325	cb85dfbdc3f34bd7a15359f2cde3aae72184d2c6cf70abd128bd548ba8b9be1b	2026-08-18 04:47:08.323
cmt8727g9000otc56zj7lnuo1	bendahara@smk-pgri3dps.sch.id	$2b$12$vCW.9mCFSD8lDeCC4037kOS/10i8Oiglsm8/i7fRi9fjqsMrQX4J6	Bendahara	t	2026-08-25 04:58:07.545	2026-08-25 04:58:07.545	\N	\N
cmt8727nj000ptc56x2o3vhm4	tu@smk-pgri3dps.sch.id	$2b$12$3sL3Ytl7mDlCy7lhiM990ePxP2hU9d3oiUBTdlgkRZXL31N23aM6u	Tata Usaha	t	2026-08-25 04:58:07.808	2026-08-25 04:58:07.808	\N	\N
cmspjr5vk000m3ddgoi9d7a7y	superadmin@smk-pgri3dps.sch.id	$2b$12$nr9NpSEovI/AJcxYvi0fj.PVCG8mvlWqAhhN6u9ehnC2H.5pBl.H6	Superadmin	t	2026-08-12 03:45:49.952	2026-08-25 05:03:32.844	\N	\N
\.


--
-- Name: _prisma_migrations _prisma_migrations_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public._prisma_migrations
    ADD CONSTRAINT _prisma_migrations_pkey PRIMARY KEY (id);


--
-- Name: audit_logs audit_logs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.audit_logs
    ADD CONSTRAINT audit_logs_pkey PRIMARY KEY (id);


--
-- Name: berita berita_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.berita
    ADD CONSTRAINT berita_pkey PRIMARY KEY (id);


--
-- Name: email_logs email_logs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.email_logs
    ADD CONSTRAINT email_logs_pkey PRIMARY KEY (id);


--
-- Name: gelombang_spmb gelombang_spmb_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.gelombang_spmb
    ADD CONSTRAINT gelombang_spmb_pkey PRIMARY KEY (id);


--
-- Name: jurusan jurusan_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.jurusan
    ADD CONSTRAINT jurusan_pkey PRIMARY KEY (id);


--
-- Name: kuota_gelombang kuota_gelombang_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.kuota_gelombang
    ADD CONSTRAINT kuota_gelombang_pkey PRIMARY KEY (id);


--
-- Name: pendaftar_spmb pendaftar_spmb_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pendaftar_spmb
    ADD CONSTRAINT pendaftar_spmb_pkey PRIMARY KEY (id);


--
-- Name: pengumuman pengumuman_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pengumuman
    ADD CONSTRAINT pengumuman_pkey PRIMARY KEY (id);


--
-- Name: permissions permissions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.permissions
    ADD CONSTRAINT permissions_pkey PRIMARY KEY (id);


--
-- Name: role_permissions role_permissions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.role_permissions
    ADD CONSTRAINT role_permissions_pkey PRIMARY KEY ("roleId", "permissionId");


--
-- Name: roles roles_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.roles
    ADD CONSTRAINT roles_pkey PRIMARY KEY (id);


--
-- Name: settings settings_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.settings
    ADD CONSTRAINT settings_pkey PRIMARY KEY (key);


--
-- Name: user_roles user_roles_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_roles
    ADD CONSTRAINT user_roles_pkey PRIMARY KEY ("userId", "roleId");


--
-- Name: users users_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_pkey PRIMARY KEY (id);


--
-- Name: audit_logs_createdAt_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "audit_logs_createdAt_idx" ON public.audit_logs USING btree ("createdAt");


--
-- Name: audit_logs_module_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX audit_logs_module_idx ON public.audit_logs USING btree (module);


--
-- Name: audit_logs_userId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "audit_logs_userId_idx" ON public.audit_logs USING btree ("userId");


--
-- Name: berita_deletedAt_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "berita_deletedAt_idx" ON public.berita USING btree ("deletedAt");


--
-- Name: berita_slug_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX berita_slug_key ON public.berita USING btree (slug);


--
-- Name: berita_status_publishedAt_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "berita_status_publishedAt_idx" ON public.berita USING btree (status, "publishedAt");


--
-- Name: email_logs_relatedType_relatedId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "email_logs_relatedType_relatedId_idx" ON public.email_logs USING btree ("relatedType", "relatedId");


--
-- Name: email_logs_to_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX email_logs_to_idx ON public.email_logs USING btree ("to");


--
-- Name: gelombang_spmb_isActive_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "gelombang_spmb_isActive_idx" ON public.gelombang_spmb USING btree ("isActive");


--
-- Name: gelombang_spmb_startDate_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "gelombang_spmb_startDate_idx" ON public.gelombang_spmb USING btree ("startDate");


--
-- Name: jurusan_code_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX jurusan_code_key ON public.jurusan USING btree (code);


--
-- Name: jurusan_deletedAt_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "jurusan_deletedAt_idx" ON public.jurusan USING btree ("deletedAt");


--
-- Name: kuota_gelombang_gelombangId_jurusanId_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "kuota_gelombang_gelombangId_jurusanId_key" ON public.kuota_gelombang USING btree ("gelombangId", "jurusanId");


--
-- Name: pendaftar_spmb_dibayarOlehUserId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "pendaftar_spmb_dibayarOlehUserId_idx" ON public.pendaftar_spmb USING btree ("dibayarOlehUserId");


--
-- Name: pendaftar_spmb_email_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX pendaftar_spmb_email_idx ON public.pendaftar_spmb USING btree (email);


--
-- Name: pendaftar_spmb_gelombangId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "pendaftar_spmb_gelombangId_idx" ON public.pendaftar_spmb USING btree ("gelombangId");


--
-- Name: pendaftar_spmb_jurusanId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "pendaftar_spmb_jurusanId_idx" ON public.pendaftar_spmb USING btree ("jurusanId");


--
-- Name: pendaftar_spmb_nisn_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX pendaftar_spmb_nisn_idx ON public.pendaftar_spmb USING btree (nisn);


--
-- Name: pendaftar_spmb_pdfSignature_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "pendaftar_spmb_pdfSignature_idx" ON public.pendaftar_spmb USING btree ("pdfSignature");


--
-- Name: pendaftar_spmb_pdfSignature_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "pendaftar_spmb_pdfSignature_key" ON public.pendaftar_spmb USING btree ("pdfSignature");


--
-- Name: pendaftar_spmb_registrationNumber_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "pendaftar_spmb_registrationNumber_key" ON public.pendaftar_spmb USING btree ("registrationNumber");


--
-- Name: pendaftar_spmb_statusPembayaran_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "pendaftar_spmb_statusPembayaran_idx" ON public.pendaftar_spmb USING btree ("statusPembayaran");


--
-- Name: pendaftar_spmb_status_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX pendaftar_spmb_status_idx ON public.pendaftar_spmb USING btree (status);


--
-- Name: pendaftar_spmb_ukuranBajuDisetOlehUserId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "pendaftar_spmb_ukuranBajuDisetOlehUserId_idx" ON public.pendaftar_spmb USING btree ("ukuranBajuDisetOlehUserId");


--
-- Name: pendaftar_spmb_userId_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "pendaftar_spmb_userId_key" ON public.pendaftar_spmb USING btree ("userId");


--
-- Name: pengumuman_aktif_urutan_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX pengumuman_aktif_urutan_idx ON public.pengumuman USING btree (aktif, urutan);


--
-- Name: pengumuman_deletedAt_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "pengumuman_deletedAt_idx" ON public.pengumuman USING btree ("deletedAt");


--
-- Name: pengumuman_tanggalMulai_tanggalSelesai_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "pengumuman_tanggalMulai_tanggalSelesai_idx" ON public.pengumuman USING btree ("tanggalMulai", "tanggalSelesai");


--
-- Name: permissions_code_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX permissions_code_key ON public.permissions USING btree (code);


--
-- Name: roles_name_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX roles_name_key ON public.roles USING btree (name);


--
-- Name: users_email_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX users_email_key ON public.users USING btree (email);


--
-- Name: users_resetTokenHash_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "users_resetTokenHash_idx" ON public.users USING btree ("resetTokenHash");


--
-- Name: audit_logs audit_logs_userId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.audit_logs
    ADD CONSTRAINT "audit_logs_userId_fkey" FOREIGN KEY ("userId") REFERENCES public.users(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: berita berita_createdByUserId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.berita
    ADD CONSTRAINT "berita_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES public.users(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: jurusan jurusan_deletedByUserId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.jurusan
    ADD CONSTRAINT "jurusan_deletedByUserId_fkey" FOREIGN KEY ("deletedByUserId") REFERENCES public.users(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: kuota_gelombang kuota_gelombang_gelombangId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.kuota_gelombang
    ADD CONSTRAINT "kuota_gelombang_gelombangId_fkey" FOREIGN KEY ("gelombangId") REFERENCES public.gelombang_spmb(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: kuota_gelombang kuota_gelombang_jurusanId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.kuota_gelombang
    ADD CONSTRAINT "kuota_gelombang_jurusanId_fkey" FOREIGN KEY ("jurusanId") REFERENCES public.jurusan(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: pendaftar_spmb pendaftar_spmb_approvedById_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pendaftar_spmb
    ADD CONSTRAINT "pendaftar_spmb_approvedById_fkey" FOREIGN KEY ("approvedById") REFERENCES public.users(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: pendaftar_spmb pendaftar_spmb_daftarUlangConfirmedByUserId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pendaftar_spmb
    ADD CONSTRAINT "pendaftar_spmb_daftarUlangConfirmedByUserId_fkey" FOREIGN KEY ("daftarUlangConfirmedByUserId") REFERENCES public.users(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: pendaftar_spmb pendaftar_spmb_dibayarOlehUserId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pendaftar_spmb
    ADD CONSTRAINT "pendaftar_spmb_dibayarOlehUserId_fkey" FOREIGN KEY ("dibayarOlehUserId") REFERENCES public.users(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: pendaftar_spmb pendaftar_spmb_gelombangId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pendaftar_spmb
    ADD CONSTRAINT "pendaftar_spmb_gelombangId_fkey" FOREIGN KEY ("gelombangId") REFERENCES public.gelombang_spmb(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: pendaftar_spmb pendaftar_spmb_jurusanId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pendaftar_spmb
    ADD CONSTRAINT "pendaftar_spmb_jurusanId_fkey" FOREIGN KEY ("jurusanId") REFERENCES public.jurusan(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: pendaftar_spmb pendaftar_spmb_ukuranBajuDisetOlehUserId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pendaftar_spmb
    ADD CONSTRAINT "pendaftar_spmb_ukuranBajuDisetOlehUserId_fkey" FOREIGN KEY ("ukuranBajuDisetOlehUserId") REFERENCES public.users(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: pendaftar_spmb pendaftar_spmb_userId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pendaftar_spmb
    ADD CONSTRAINT "pendaftar_spmb_userId_fkey" FOREIGN KEY ("userId") REFERENCES public.users(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: pendaftar_spmb pendaftar_spmb_verifiedById_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pendaftar_spmb
    ADD CONSTRAINT "pendaftar_spmb_verifiedById_fkey" FOREIGN KEY ("verifiedById") REFERENCES public.users(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: pengumuman pengumuman_createdByUserId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pengumuman
    ADD CONSTRAINT "pengumuman_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES public.users(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: role_permissions role_permissions_permissionId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.role_permissions
    ADD CONSTRAINT "role_permissions_permissionId_fkey" FOREIGN KEY ("permissionId") REFERENCES public.permissions(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: role_permissions role_permissions_roleId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.role_permissions
    ADD CONSTRAINT "role_permissions_roleId_fkey" FOREIGN KEY ("roleId") REFERENCES public.roles(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: settings settings_updatedByUserId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.settings
    ADD CONSTRAINT "settings_updatedByUserId_fkey" FOREIGN KEY ("updatedByUserId") REFERENCES public.users(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: user_roles user_roles_roleId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_roles
    ADD CONSTRAINT "user_roles_roleId_fkey" FOREIGN KEY ("roleId") REFERENCES public.roles(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: user_roles user_roles_userId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_roles
    ADD CONSTRAINT "user_roles_userId_fkey" FOREIGN KEY ("userId") REFERENCES public.users(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: SCHEMA public; Type: ACL; Schema: -; Owner: -
--

REVOKE USAGE ON SCHEMA public FROM PUBLIC;


--
-- PostgreSQL database dump complete
--

\unrestrict 2GHhDVwZwNzSMWQGAM9bwTPsHm6K9FVpSdIG1XW82puyORHkRGlIDuGLPQ4nlXa

