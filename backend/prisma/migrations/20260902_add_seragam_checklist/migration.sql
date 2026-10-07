-- No-op migration.
-- Tabel `seragam_item_master`, `seragam_checklist`, `seragam_checklist_item`
-- sudah ada di DB (dibuat via `prisma db push` saat development awal),
-- sehingga migrasi ini tidak perlu mengeksekusi DDL apa pun.
-- Marker ini ditambahkan supaya histori migrasi sinkron dengan state DB aktual.
SELECT 1;
