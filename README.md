# SPMB SMK PGRI 3 Denpasar

Sistem **Seleksi Peserta Murid Baru** online untuk SMK PGRI 3 Denpasar.

> Stack: **NestJS + Prisma + PostgreSQL 16** (backend, di-Docker) ·
> **React + Vite + Tailwind + Framer Motion** (frontend, dijalankan lokal per developer).

```
.
├── backend/          # REST API (NestJS + Prisma)
├── frontend-user/    # Aplikasi publik (pendaftar)
├── frontend-admin/   # Aplikasi admin/TU/superadmin
├── docker-compose.yml
└── .env.example
```

---

## 🚀 Setup pertama kali (untuk anggota tim baru)

### 1. Prasyarat

- **Docker Desktop** terinstall (https://www.docker.com/products/docker-desktop/)
- **Node.js ≥ 20** (https://nodejs.org) — untuk menjalankan frontend di lokal
- **Git** (opsional, untuk clone repo)

Cek Docker:
```bash
docker --version
docker compose version
```

### 2. Clone & setup environment

```bash
git clone <url-repo>
cd spmb-smk-pgri3
cp .env.example .env
```

Edit `.env` (wajib):
- `POSTGRES_PASSWORD` — ganti dari `change-me` ke password yang lebih kuat
- `JWT_SECRET` — ganti ke random string panjang (≥ 32 char), contoh:
  `openssl rand -hex 32`
- `SEED_ADMIN_PASSWORD` — password untuk akun superadmin yang akan di-seed
- `POSTGRES_PORT` / `BACKEND_PORT` / `ADMINER_PORT` — sesuaikan jika port default
  sudah dipakai di komputer Anda

### 3. Jalankan backend + database via Docker

```bash
docker compose up -d --build
```

Tunggu hingga service `db` healthcheck **healthy** (cek: `docker compose ps`). Saat pertama
kali, container `backend` akan otomatis:
1. Sync schema Prisma ke database (`prisma db push`) — cocok untuk development
2. Generate Prisma client
3. Menjalankan seed (membuat role Admin/TU/Superadmin, permission default, dan akun superadmin)
4. Menjalankan server NestJS dengan hot-reload

> Untuk production, ganti `db push` dengan `migrate deploy` setelah migrasi awal
> dibuat dengan `npx prisma migrate dev --name init`.

Cek log:
```bash
docker compose logs -f backend
```

Backend akan tersedia di **http://localhost:4000/api**
- Health check: `GET /api/health`
- Adminer (GUI DB): **http://localhost:8080**
  - Login dengan system=PostgreSQL, server=`db`, user/password sesuai `.env`

### 4. Jalankan frontend di lokal

Buka **2 terminal** terpisah:

**Terminal 1 — frontend publik (port 5173)**
```bash
cd frontend-user
cp .env.example .env  # jika belum
npm install
npm run dev
```

**Terminal 2 — frontend admin (port 5174)**
```bash
cd frontend-admin
cp .env.example .env  # jika belum
npm install
npm run dev
```

Akses:
- **Frontend user (publik)**: http://localhost:5173
- **Frontend admin**: http://localhost:5174

Login admin default:
- Email: sesuai `SEED_ADMIN_EMAIL` (default: `superadmin@smk-pgri3dps.sch.id`)
- Password: sesuai `SEED_ADMIN_PASSWORD`

> ⚠️ **Segera ganti password setelah login pertama!**

---

## 📋 Perintah harian

| Perintah                                                                | Fungsi                                          |
| ----------------------------------------------------------------------- | ----------------------------------------------- |
| `docker compose up -d`                                                  | Jalankan service (background)                   |
| `docker compose down`                                                   | Stop service (data DB tetap aman)               |
| `docker compose down -v`                                                | Stop + hapus volume (DB **direset ke nol**)     |
| `docker compose logs -f backend`                                        | Lihat log backend (Ctrl+C untuk keluar)         |
| `docker compose ps`                                                     | Status semua service                            |
| `docker compose exec backend sh`                                        | Masuk ke shell container backend                |
| `docker compose exec backend npx prisma studio`                         | Buka Prisma Studio (GUI DB) di port 5555        |
| `docker compose exec backend npx prisma db push`                         | Sinkronkan schema → DB (untuk development)      |
| `docker compose exec backend npm run seed`                              | Jalankan ulang seed (idempotent)                |

---

## 🗄️ Reset database dari nol

```bash
docker compose down -v
docker compose up -d --build
```

Container `backend` akan otomatis migrasi + seed ulang.

---

## 🧱 Struktur data (inti)

- **users / roles / permissions / user_roles / role_permissions** — RBAC dinamis,
  superadmin bisa atur permission via UI
- **jurusan** — master program studi
- **gelombang_spmb / kuota_gelombang** — gelombang pendaftaran & kuota per jurusan
- **pendaftar_spmb** — data pendaftar (dengan status alur)
- **pembayaran_spmb** — data transfer siswa + status verifikasi TU
- **audit_logs** — jejak setiap aksi penting (siapa, apa, kapan, dari IP mana)
- **email_logs** — log email yang dikirim sistem

### Alur status pendaftar

```
MENUNGGU_VERIFIKASI
   ├─ (admin APPROVE) → LOLOS_MENUNGGU_DAFTAR_ULANG
   └─ (admin REJECT)  → DITOLAK

LOLOS_MENUNGGU_DAFTAR_ULANG
   └─ (siswa submit pembayaran) → MENUNGGU_VERIFIKASI_PEMBAYARAN

MENUNGGU_VERIFIKASI_PEMBAYARAN
   ├─ (TU TERVERIFIKASI + admin APPROVE) → SISWA_AKTIF
   └─ (TU BELUM_DITEMUKAN) → LOLOS_MENUNGGU_DAFTAR_ULANG (input ulang)
```

---

## 🔐 Keamanan

- Password di-hash dengan **bcrypt** (cost factor 12)
- Login dibatasi rate-limit (5 percobaan / menit / IP)
- JWT expires 8 jam (atur via `JWT_EXPIRES_IN`)
- Setiap endpoint dicek permission, bukan hanya "sudah login"
- CORS hanya izinkan origin yang dideklarasikan di `.env`
- Helmet header security diaktifkan
- Audit log untuk aksi penting

**Untuk produksi (WAJIB):**
- Gunakan HTTPS (reverse-proxy: Nginx / Caddy / Cloudflare)
- Generate `JWT_SECRET` baru (`openssl rand -hex 64`)
- Ganti `POSTGRES_PASSWORD` & `SEED_ADMIN_PASSWORD` ke nilai kuat
- Isi SMTP `*` untuk email beneran terkirim (kalau kosong, hanya log)
- Buat `docker-compose.prod.yml` yang **tidak expose** port DB ke host

---

## 🛠️ Menambah modul / endpoint baru

1. **Schema** — edit `backend/prisma/schema.prisma`
2. **Generate Prisma client**: `docker compose exec backend npx prisma generate`
3. **Buat migrasi** (jika di lokal):
   `docker compose exec backend npx prisma migrate dev --name nama_migrasi`
4. **Modul NestJS** — buat folder `backend/src/<nama-modul>/` berisi
   `module.ts`, `controller.ts`, `service.ts`
5. **Daftarkan** modul di `backend/src/app.module.ts`
6. **Tambahkan permission code** baru di `backend/prisma/seed.ts` lalu jalankan
   `docker compose exec backend npm run seed`

---

## 📁 Folder-folder penting

| Path                                   | Isi                                          |
| -------------------------------------- | -------------------------------------------- |
| `backend/src/main.ts`                  | Bootstrap NestJS (CORS, helmet, validation)  |
| `backend/src/app.module.ts`            | Root module — daftarkan semua modul di sini  |
| `backend/src/auth/`                    | Login + JWT strategy                         |
| `backend/src/pendaftar/`               | Endpoint pendaftaran publik + verifikasi     |
| `backend/src/email/`                   | Service email (nodemailer)                   |
| `backend/src/export/`                  | Export Excel Dapodik (exceljs)               |
| `backend/prisma/schema.prisma`         | Skema database                               |
| `backend/prisma/seed.ts`               | Seed role/permission/user default            |
| `frontend-user/src/pages/`             | Halaman publik                               |
| `frontend-admin/src/pages/`            | Halaman admin/TU/superadmin                  |

---

## ❓ Troubleshooting

**Container `backend` exited / restart terus**
Cek log: `docker compose logs backend`. Biasanya karena `DATABASE_URL` salah,
`JWT_SECRET` kosong, atau schema Prisma belum di-generate.

**Port bentrok**
Edit `.env`, ubah `POSTGRES_PORT` / `BACKEND_PORT` / `ADMINER_PORT`.

**CORS error di browser**
Pastikan `FRONTEND_USER_ORIGIN` / `FRONTEND_ADMIN_ORIGIN` di `.env` sesuai
dengan origin frontend (termasuk `http://` dan port).

**Tidak bisa login setelah ganti password seed**
Seed hanya men-set password saat user belum ada. Untuk reset password existing:
```bash
docker compose exec backend npx prisma studio
# buka tab User → edit password ke bcrypt hash baru
# atau gunakan API PATCH /users/:id/reset-password (perlu permission user.manage)
```

**Tidak ada gelombang aktif**
Login ke admin → menu **Gelombang** → buat gelombang baru dan set status Aktif
serta kuota per jurusan.

---

## 📜 Lisensi

Proprietary — © SMK PGRI 3 Denpasar. Tidak untuk distribusi publik tanpa izin.
