import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { existsSync } from 'fs';
import { PrismaService } from '../prisma/prisma.service';
import { PdfService } from '../pdf/pdf.service';
import { AuditLogService } from '../audit-log/audit-log.service';
import { SettingsService } from '../settings/settings.service';
import { PendaftarService } from '../pendaftar/pendaftar.service';

/**
 * =====================================================================
 * SERAGAM SERVICE — Batch D
 * =====================================================================
 *
 * Mengelola 2 area:
 *   1. Master Item Seragam (CRUD, Superadmin only)
 *      → tabel: seragam_item_master
 *
 *   2. Checklist Pengambilan Seragam per siswa (TU/admin fallback)
 *      → tabel: seragam_checklist + seragam_checklist_item
 *
 * Lifecycle checklist:
 *   1. TU buka form → service auto-generate SeragamChecklistItem untuk
 *      SEMUA item master aktif saat itu (idempotent — bukan duplikat).
 *   2. TU centang item yang sudah diambil + tambah keterangan per item.
 *   3. Submit pertama kali → set pendaftar.ukuranBaju + flip status
 *      (via afterPartialSubmit() — dipanggil oleh PendaftarService).
 *   4. Submit ulang di kemudian hari (untuk tambah centang item yg baru
 *      diambil atau update penerima) → status TIDAK flip lagi karena
 *      pendaftar.ukuranBaju sudah terisi.
 *
 * Catatan tentang ukuran baju:
 *   - Spec mengizinkan ukuran apapun (text). Tapi karena existing flow
 *     `submitUkuranBaju` validasi vs `Settings.ukuran_baju_options`,
 *     checklist pakai validasi yang sama supaya konsisten. Bisa di-
 *     bypass dengan input manual melalui service khusus kalau perlu.
 *
 * Atomicity:
 *   - Upsert checklist + sync items dibungkus dalam satu `prisma.$transaction`
 *     supaya jika satu gagal, semua di-rollback dan state DB konsisten.
 */

@Injectable()
export class SeragamService {
  private readonly logger = new Logger(SeragamService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly pdf: PdfService,
    private readonly audit: AuditLogService,
    private readonly settings: SettingsService,
    private readonly pendaftarService: PendaftarService,
  ) {}

  // =====================================================================
  // 1. MASTER ITEM SERAGAM (Superadmin only — guard di controller)
  // =====================================================================

  /**
   * List item seragam. Default hanya item aktif, kecuali `includeInactive=true`.
   * Urutkan by urutan ASC, lalu nama (untuk stable sort).
   */
  async listItems(opts: { includeInactive?: boolean } = {}) {
    return this.prisma.seragamItemMaster.findMany({
      where: opts.includeInactive ? undefined : { isActive: true },
      orderBy: [{ urutan: 'asc' }, { nama: 'asc' }],
    });
  }

  /**
   * Tambah item baru. Validasi nama wajib & tidak duplikat (case-insensitive).
   */
  async createItem(
    input: { nama: string; urutan?: number; isActive?: boolean },
    actor: { userId: string; userName: string; userEmail: string },
  ) {
    const nama = (input.nama || '').trim();
    if (!nama) throw new BadRequestException('Nama item wajib diisi');

    const dupe = await this.prisma.seragamItemMaster.findFirst({
      where: { nama: { equals: nama, mode: 'insensitive' } },
    });
    if (dupe) {
      throw new BadRequestException(`Item '${nama}' sudah ada`);
    }

    const created = await this.prisma.seragamItemMaster.create({
      data: {
        nama,
        urutan: input.urutan ?? 0,
        isActive: input.isActive ?? true,
      },
    });

    await this.audit.create({
      userId: actor.userId,
      userName: actor.userName,
      userEmail: actor.userEmail,
      action: 'seragam.item_created',
      module: 'spmb',
      entityType: 'SeragamItemMaster',
      entityId: created.id,
      meta: { nama: created.nama, urutan: created.urutan, isActive: created.isActive },
    });

    return created;
  }

  /**
   * Edit item. Hanya field yang dikirim yang di-update.
   * Duplikat nama tetap dicek.
   */
  async updateItem(
    id: string,
    input: { nama?: string; urutan?: number; isActive?: boolean },
    actor: { userId: string; userName: string; userEmail: string },
  ) {
    const existing = await this.prisma.seragamItemMaster.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('Item seragam tidak ditemukan');

    if (typeof input.nama === 'string') {
      const nama = input.nama.trim();
      if (!nama) throw new BadRequestException('Nama item tidak boleh kosong');
      const dupe = await this.prisma.seragamItemMaster.findFirst({
        where: { nama: { equals: nama, mode: 'insensitive' }, id: { not: id } },
      });
      if (dupe) throw new BadRequestException(`Item '${nama}' sudah dipakai item lain`);
      input.nama = nama;
    }

    const updated = await this.prisma.seragamItemMaster.update({
      where: { id },
      data: input,
    });

    await this.audit.create({
      userId: actor.userId,
      userName: actor.userName,
      userEmail: actor.userEmail,
      action: 'seragam.item_updated',
      module: 'spmb',
      entityType: 'SeragamItemMaster',
      entityId: id,
      meta: { before: { nama: existing.nama, urutan: existing.urutan, isActive: existing.isActive },
              after: { nama: updated.nama, urutan: updated.urutan, isActive: updated.isActive } },
    });

    return updated;
  }

  /**
   * Hapus item. Strategi aman:
   *   - Cek apakah ada SeragamChecklistItem yang reference id ini.
   *   - Ada → TOLAK hard delete (akan lempar error). Admin harus
   *     nonaktifkan via isActive=false supaya data historis (PDF lama)
   *     tetap valid (lihat onDelete: Restrict di schema).
   *   - Tidak ada → aman hard delete.
   */
  async deleteItem(
    id: string,
    actor: { userId: string; userName: string; userEmail: string },
  ): Promise<{ deleted: true; id: string }> {
    const existing = await this.prisma.seragamItemMaster.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('Item seragam tidak ditemukan');

    const usedCount = await this.prisma.seragamChecklistItem.count({
      where: { itemMasterId: id },
    });
    if (usedCount > 0) {
      throw new ForbiddenException(
        `Item ini sudah dipakai di ${usedCount} checklist siswa. ` +
          `Tidak bisa dihapus supaya data historis PDF tetap utuh. ` +
          `Nonaktifkan via tombol "Nonaktifkan" sebagai gantinya.`,
      );
    }

    await this.prisma.seragamItemMaster.delete({ where: { id } });

    await this.audit.create({
      userId: actor.userId,
      userName: actor.userName,
      userEmail: actor.userEmail,
      action: 'seragam.item_deleted',
      module: 'spmb',
      entityType: 'SeragamItemMaster',
      entityId: id,
      meta: { nama: existing.nama, usedCount: 0 },
    });

    return { deleted: true, id };
  }

  // =====================================================================
  // 2. CHECKLIST PER SISWA
  // =====================================================================

  /**
   * Sinkronkan rows SeragamChecklistItem dengan master items saat ini.
   * Dipanggil setiap kali checklist di-load atau PDF di-generate, supaya:
   *   - Item master BARU yang diaktifkan setelah checklist dibuat → otomatis
   *     muncul sebagai row baru (sudahDidapat=false) di checklist ini.
   *   - Item master yang di-deactivate setelah dipakai → row-nya TETAP ada
   *     di checklist ini (untuk konsistensi histori PDF), tidak diapus.
   *   - Idempotent: aman dipanggil berulang-ulang, tidak insert duplikat.
   *
   * @param checklistId - primary key SeragamChecklist
   * @param tx - optional transaction client (kalau dipanggil dari dalam
   *             transaction lain). Default: prisma root.
   */
  private async syncChecklistItemsForAllMasters(
    checklistId: string,
    tx: any = this.prisma,
  ): Promise<void> {
    const allMasters = await tx.seragamItemMaster.findMany({
      orderBy: { urutan: 'asc' },
    });
    for (const m of allMasters) {
      // Upsert idempotent — kalau row sudah ada (checklistId × itemMasterId),
      // TIDAK di-update field-nya (preserve sudahDidapat & keterangan user).
      await tx.seragamChecklistItem.upsert({
        where: {
          checklistId_itemMasterId: { checklistId, itemMasterId: m.id },
        },
        create: {
          checklistId,
          itemMasterId: m.id,
          sudahDidapat: false,
          keterangan: null,
        },
        update: {}, // no-op: jangan overwrite state existing (preserve historis)
      });
    }
  }

  /**
   * Get checklist + items (untuk load halaman form).
   * Kalau belum pernah submit → checklist: null, items: [].
   *
   * Auto-sync: kalau checklist sudah ada, sync dulu dengan master items
   * terkini supaya item master BARU yang diaktifkan setelah checklist
   * dibuat otomatis muncul sebagai row baru (sudahDidapat=false). Ini
   * menjamin form & PDF konsisten.
   *
   * Return shape:
   *   {
   *     checklist: SeragamChecklist | null,
   *     items: Array<SeragamChecklistItem & { itemMaster: SeragamItemMaster }>,
   *     pendaftar: { id, namaLengkap, registrationNumber, jenisKelamin, jurusan: {...} }
   *   }
   */
  async getChecklistForPendaftar(pendaftarId: string) {
    const p = await this.prisma.pendaftar.findUnique({
      where: { id: pendaftarId },
      include: { jurusan: true, gelombang: true },
    });
    if (!p) throw new NotFoundException('Pendaftar tidak ditemukan');

    // Auto-sync kalau checklist sudah pernah dibuat — supaya item master
    // baru otomatis ter-create sebagai row (idempotent). Tidak menunggu
    // submit ulang. Ini juga yang menjamin PDF langsung konsisten.
    const existingChecklist = await this.prisma.seragamChecklist.findUnique({
      where: { pendaftarId },
      select: { id: true },
    });
    if (existingChecklist) {
      await this.syncChecklistItemsForAllMasters(existingChecklist.id);
    }

    const checklist = await this.prisma.seragamChecklist.findUnique({
      where: { pendaftarId },
      include: {
        items: {
          orderBy: { itemMaster: { urutan: 'asc' } },
          include: { itemMaster: true },
        },
      },
    });

    return {
      pendaftar: {
        id: p.id,
        registrationNumber: p.registrationNumber,
        namaLengkap: p.namaLengkap,
        jenisKelamin: p.jenisKelamin,
        tanggalLahir: p.tanggalLahir,
        tempatLahir: p.tempatLahir,
        sekolahAsal: p.sekolahAsal,
        alamat: p.alamat,
        // Status pendaftar — dipakai frontend untuk deteksi kondisi
        // "re-edit setelah Siswa Aktif" (Opsi A) supaya field reason wajib.
        status: p.status,
        jurusan: { code: p.jurusan.code, name: p.jurusan.name },
        gelombang: { name: p.gelombang.name },
        // Pakai ukuranBaju terakhir dari Pendaftar kalau checklist belum ada —
        // supaya TU bisa langsung edit form tanpa harus input ulang kalau
        // data sudah pernah diinput via submitUkuranBaju legacy.
        ukuranBajuPendaftar: p.ukuranBaju,
      },
      checklist: checklist
        ? {
            id: checklist.id,
            ukuran: checklist.ukuran,
            tanggalPengambilan: checklist.tanggalPengambilan,
            penerimaNama: checklist.penerimaNama,
            petugasNama: checklist.petugasNama,
            petugasEmail: checklist.petugasEmail,
            updatedAt: checklist.updatedAt,
            items: checklist.items.map((it) => ({
              id: it.id,
              itemMasterId: it.itemMasterId,
              nama: it.itemMaster.nama,
              urutan: it.itemMaster.urutan,
              sudahDidapat: it.sudahDidapat,
              keterangan: it.keterangan,
              isActive: it.itemMaster.isActive,
            })),
          }
        : null,
      // Selalu return SEMUA item master aktif (untuk dirender di form
      // walaupun checklist belum pernah submit — TU bisa langsung centang).
      availableItemMasters: await this.listItems({ includeInactive: false }),
    };
  }

  /**
   * Submit/update checklist. Idempotent — bisa dipanggil berkali-kali
   * untuk parse-update (siswa ambil bertahap).
   *
   * Pada submit PERTAMA KALI untuk siswa ini:
   *   - Buat row SeragamChecklist
   *   - Untuk semua item master aktif → upsert SeragamChecklistItem
   *     dengan sudahDidapat dari dto.items (default false)
   *   - Set pendaftar.ukuranBaju (sync) + flip status via afterPartialSubmit
   *
   * Pada submit BERIKUTNYA:
   *   - Update row SeragamChecklist (ukuran, tanggal, penerima, petugas)
   *   - Untuk item master yang sudah ada di checklist: update sudahDidapat
   *     & keterangan. Item master BARU yang diaktifkan belakangan → otomatis
   *     ter-generate di submit berikutnya.
   *   - pendaftar.ukuranBaju TETAP disync (kalau TU ganti ukuran), status
   *     TIDAK flip lagi (kalau sudah pernah active).
   *
   * @returns checkpoint + pendaftar status setelah recompute.
   */
  async submitChecklist(
    pendaftarId: string,
    actor: { userId: string; userName: string; userEmail: string },
    dto: {
      ukuran: string;
      tanggalPengambilan: string | Date;
      penerimaNama?: string | null;
      items: Array<{
        itemMasterId: string;
        sudahDidapat: boolean;
        keterangan?: string | null;
      }>;
      /**
       * Alasan edit — WAJIB diisi kalau pendaftar sudah SISWA_AKTIF (re-edit
       * setelah status final). Untuk submit pertama, optional (default null).
       * Disimpan ke audit log untuk forensik (Opsi A).
       */
      reason?: string;
    },
  ) {
    // ---- Validasi awal ------------------------------------------------
    const p = await this.prisma.pendaftar.findUnique({ where: { id: pendaftarId } });
    if (!p) throw new NotFoundException('Pendaftar tidak ditemukan');
    if (p.status === 'DITOLAK') {
      throw new BadRequestException(
        `Pendaftar berstatus Ditolak — tidak bisa input checklist seragam`,
      );
    }
    // Opsi A: re-edit setelah SISWA_AKTIF WAJIB sertakan reason (audit).
    const isReEditAfterActive = p.status === 'SISWA_AKTIF';
    if (isReEditAfterActive && (!dto.reason || !dto.reason.trim())) {
      throw new BadRequestException(
        'Alasan perubahan wajib diisi untuk re-edit seragam setelah Siswa Aktif',
      );
    }

    // Validasi ukuran vs Settings.ukuran_baju_options (konsisten dengan
    // submitUkuranBaju()). Pakai toleransi: trim + case-sensitive match.
    const ukuranTrim = (dto.ukuran || '').trim();
    if (!ukuranTrim) throw new BadRequestException('Ukuran baju wajib diisi');
    const allowed = await this.settings.ukuranBajuOptions();
    if (!allowed.includes(ukuranTrim)) {
      throw new BadRequestException(
        `Ukuran baju '${ukuranTrim}' tidak valid. Pilihan: ${allowed.join(', ')}`,
      );
    }

    const tgl =
      typeof dto.tanggalPengambilan === 'string'
        ? new Date(dto.tanggalPengambilan)
        : dto.tanggalPengambilan;
    if (isNaN(tgl.getTime())) {
      throw new BadRequestException('Tanggal pengambilan tidak valid');
    }

    const penerima = (dto.penerimaNama || '').trim() || null;

    // ---- Snapshot petugas (di-overwrite setiap submit) ---------------
    const updatedAt = new Date();

    // ---- Transaction: checklist upsert + items sync ------------------
    // Dipisah jadi 2 step agar error message lebih jelas, tapi tetap dalam
    // 1 transaction. Pola: ensure checklist → ensure items → return.
    const result = await this.prisma.$transaction(async (tx) => {
      // 1) Upsert checklist by pendaftarId (1-to-1)
      const checklist = await tx.seragamChecklist.upsert({
        where: { pendaftarId },
        create: {
          pendaftarId,
          ukuran: ukuranTrim,
          tanggalPengambilan: tgl,
          penerimaNama: penerima,
          petugasId: actor.userId,
          petugasNama: actor.userName,
          petugasEmail: actor.userEmail,
        },
        update: {
          ukuran: ukuranTrim,
          tanggalPengambilan: tgl,
          penerimaNama: penerima,
          petugasId: actor.userId,
          petugasNama: actor.userName,
          petugasEmail: actor.userEmail,
        },
      });

      // 2) Sync items — pakai upsert by (checklistId, itemMasterId).
      // Item master yang ADA di dto → update/create dengan state dari TU.
      // Item master yang TIDAK ADA di dto (mis. baru diaktifkan setelah
      //    submit terakhir) → tetap di-create dengan sudahDidapat=false
      //    (sync logic di bawah).
      // Item master yang di-deactivate → row TETAP ada, sudahDidapat &
      //    keterangan TIDAK di-overwrite (preserve state historis user).
      const dtoMap = new Map(dto.items.map((it) => [it.itemMasterId, it]));
      const allMasters = await tx.seragamItemMaster.findMany({ orderBy: { urutan: 'asc' } });
      for (const m of allMasters) {
        const fromDto = dtoMap.get(m.id);
        if (fromDto) {
          // Master yang disentuh user di form → apply state dari dto.
          const sudahDidapat = fromDto.sudahDidapat ?? false;
          const keterangan = fromDto.keterangan?.trim() || null;
          await tx.seragamChecklistItem.upsert({
            where: { checklistId_itemMasterId: { checklistId: checklist.id, itemMasterId: m.id } },
            create: {
              checklistId: checklist.id,
              itemMasterId: m.id,
              sudahDidapat,
              keterangan,
            },
            update: { sudahDidapat, keterangan },
          });
        } else {
          // Master yang TIDAK ada di dto (baru aktif belakangan, atau
          // user sengaja skip centang untuk item ini) → auto-create
          // row saja dengan default (sudahDidapat=false, no note) tanpa
          // overwrite state existing kalau row sudah pernah ada.
          await tx.seragamChecklistItem.upsert({
            where: { checklistId_itemMasterId: { checklistId: checklist.id, itemMasterId: m.id } },
            create: {
              checklistId: checklist.id,
              itemMasterId: m.id,
              sudahDidapat: false,
              keterangan: null,
            },
            update: {}, // no-op: preserve state historis user
          });
        }
      }

      return checklist;
    });

    // ---- Sync ke Pendaftar.ukuranBaju (supaya status flip otomatis) -
    // Hanya set kalau memang berbeda — supaya tidak trigger recompute
    // kalau ukuran baju tidak berubah di submit ulang.
    if (p.ukuranBaju !== ukuranTrim || !p.tanggalUkuranBaju) {
      await this.prisma.pendaftar.update({
        where: { id: pendaftarId },
        data: {
          ukuranBaju: ukuranTrim,
          tanggalUkuranBaju: updatedAt,
          ukuranBajuDisetOlehUserId: actor.userId,
          ukuranBajuDisetOlehNama: actor.userName,
          ukuranBajuDisetOlehEmail: actor.userEmail,
        },
      });
    }

    // Audit log
    const auditMeta: Record<string, any> = {
      registrationNumber: p.registrationNumber,
      ukuran: ukuranTrim,
      penerimaNama: penerima,
      itemsCount: dto.items.length,
      sudahDidapatCount: dto.items.filter((i) => i.sudahDidapat).length,
    };
    if (isReEditAfterActive) {
      // Opsi A: re-edit setelah Siswa Aktif → catat reason + before/after
      auditMeta.editAfterActive = true;
      auditMeta.reason = dto.reason!.trim();
      auditMeta.before = {
        ukuran: p.ukuranBaju,
        tanggalUkuranBaju: p.tanggalUkuranBaju,
        ukuranBajuDisetOlehNama: p.ukuranBajuDisetOlehNama,
      };
      auditMeta.after = {
        ukuran: ukuranTrim,
        tanggalUkuranBaju: updatedAt,
        ukuranBajuDisetOlehNama: actor.userName,
      };
    }
    await this.audit.create({
      userId: actor.userId,
      userName: actor.userName,
      userEmail: actor.userEmail,
      action: 'seragam.checklist_submitted',
      module: 'spmb',
      entityType: 'SeragamChecklist',
      entityId: result.id,
      meta: auditMeta,
    });

    // Recompute status pendaftar — share logic dengan submitUkuranBaju()
    // dan submitPembayaran() supaya flip ke SISWA_AKTIF + Tahap 2 PDF +
    // email konsisten.
    // Pakai `updatedAt` yang baru saja kita set di pendaftar.ukuranBajuDate
    // — jadi timestamp audit & PDF generation selaras.
    return this.pendaftarService.afterPartialSubmit(pendaftarId, actor.userId, updatedAt);
  }

  // =====================================================================
  // 3. PDF FORMULIR SERAGAM
  // =====================================================================

  /**
   * Generate (atau ambil cached) PDF Formulir Pengambilan Seragam untuk
   * seorang siswa. Dipakai oleh endpoint download.
   *
   * Strategy: SELALU regenerate on demand (PDF kecil + ada editing flow
   * yang bisa dipanggil berkali-kali, jadi tidak ada gunanya cache
   * kompleks). Tulis ke path `<safeReg>-SERAGAM.pdf` di storage supaya
   * tidak bentrok dengan PDF bukti pendaftaran utama.
   *
   * Kalau checklist belum pernah disubmit → throw BadRequest (PDF butuh
   * ukuran + tanggal yang valid dari form).
   */
  async generateFormulirPdf(pendaftarId: string): Promise<{
    absolutePath: string;
    filename: string;
  }> {
    // Defense-in-depth: auto-sync dulu sebelum PDF generation. Kalau ada
    // master item baru yang diaktifkan setelah checklist dibuat, akan
    // auto-create row (idempotent). Mismatch form ↔ PDF tidak akan
    // terjadi lagi walau user cetak PDF tanpa buka form dulu.
    const existingChecklist = await this.prisma.seragamChecklist.findUnique({
      where: { pendaftarId },
      select: { id: true },
    });
    if (!existingChecklist) {
      throw new BadRequestException(
        'Checklist seragam belum pernah diisi. Simpan form dulu sebelum cetak.',
      );
    }
    await this.syncChecklistItemsForAllMasters(existingChecklist.id);

    const checklist = await this.prisma.seragamChecklist.findUnique({
      where: { pendaftarId },
      include: {
        items: {
          include: { itemMaster: true },
          orderBy: { itemMaster: { urutan: 'asc' } },
        },
      },
    });
    if (!checklist) {
      // Shouldn't happen (already checked above), tapi defensive.
      throw new BadRequestException(
        'Checklist seragam tidak ditemukan setelah sync.',
      );
    }
    const p = await this.prisma.pendaftar.findUnique({
      where: { id: pendaftarId },
      include: { jurusan: true, gelombang: true },
    });
    if (!p) throw new NotFoundException('Pendaftar tidak ditemukan');

    const filename = `${p.registrationNumber.replace(/[^A-Za-z0-9._-]/g, '_')}-SERAGAM.pdf`;
    const absPath = await this.pdf.generateFormulirSeragam({
      filename,
      registrationNumber: p.registrationNumber,
      namaLengkap: p.namaLengkap,
      jenisKelamin: p.jenisKelamin,
      jurusan: { code: p.jurusan.code, name: p.jurusan.name },
      ukuran: checklist.ukuran,
      tanggalPengambilan: checklist.tanggalPengambilan,
      penerimaNama: checklist.penerimaNama,
      petugas: {
        name: checklist.petugasNama ?? 'Petugas TU',
        email: checklist.petugasEmail ?? '',
      },
      items: checklist.items.map((it) => ({
        nama: it.itemMaster.nama,
        sudahDidapat: it.sudahDidapat,
        keterangan: it.keterangan,
      })),
      tahunAjaranLabel: this.computeTahunAjaranLabel(),
    });

    // Verify file exists before returning (defense)
    if (!existsSync(absPath)) {
      throw new BadRequestException('PDF gagal dihasilkan');
    }

    return { absolutePath: absPath, filename };
  }

  /**
   * Compute tahun ajaran label seperti "2026/2027" mengikuti konvensi
   * Indonesia (Jul–Jun). Logic sama dengan TahunAjaranService — di-copy
   * untuk hindari cross-module import.
   */
  private computeTahunAjaranLabel(refDate: Date = new Date()): string {
    const y = refDate.getFullYear();
    const m = refDate.getMonth();
    return m < 6 ? `${y - 1}/${y}` : `${y}/${y + 1}`;
  }
}
