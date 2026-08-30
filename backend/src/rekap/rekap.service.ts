import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import ExcelJS from 'exceljs';

export interface RekapFilter {
  startDate?: string; // YYYY-MM-DD (inclusive)
  endDate?: string;   // YYYY-MM-DD (inclusive — extended ke 23:59:59 di service)
  gelombangId?: string;
  metode?: 'CASH' | 'TRANSFER';
}

/**
 * Rekap pendapatan untuk Bendahara & superadmin.
 *
 * Data sumber: Pendaftar dengan `statusPembayaran = 'LUNAS'` — di-snapshot
 * nominalnya dari `settings.harga_daftar_ulang` pada saat Bendahara submit
 * via `POST /pendaftar/:id/pembayaran`. Jadi kalau harga setting berubah
 * setelahnya, nominal historis tidak ikut berubah (aman untuk audit).
 *
 * Filter opsional:
 *   - startDate / endDate → filter `tanggalBayar` (inclusive end-of-day)
 *   - gelombangId → exact match
 *   - metode       → 'CASH' atau 'TRANSFER'
 */
@Injectable()
export class RekapService {
  constructor(private readonly prisma: PrismaService) {}

  private buildWhere(filter: RekapFilter): Prisma.PendaftarWhereInput {
    const where: Prisma.PendaftarWhereInput = { statusPembayaran: 'LUNAS' };
    if (filter.gelombangId) where.gelombangId = filter.gelombangId;
    if (filter.metode) where.metodePembayaran = filter.metode;
    if (filter.startDate || filter.endDate) {
      const range: Prisma.DateTimeFilter = {};
      if (filter.startDate) {
        const start = new Date(filter.startDate);
        start.setHours(0, 0, 0, 0);
        range.gte = start;
      }
      if (filter.endDate) {
        const end = new Date(filter.endDate);
        end.setHours(23, 59, 59, 999);
        range.lte = end;
      }
      where.tanggalBayar = range;
    }
    return where;
  }

  async getPendapatan(filter: RekapFilter) {
    const where = this.buildWhere(filter);
    const items = await this.prisma.pendaftar.findMany({
      where,
      include: {
        gelombang: { select: { id: true, name: true } },
        dibayarOleh: { select: { name: true, email: true } },
      },
      orderBy: { tanggalBayar: 'desc' },
    });

    let total = 0;
    let totalCash = 0;
    let totalTransfer = 0;
    const perGelombangMap = new Map<
      string,
      { name: string; total: number; count: number; cash: number; transfer: number }
    >();

    for (const p of items) {
      const nominal = p.nominalPembayaran ? Number(p.nominalPembayaran) : 0;
      total += nominal;
      if (p.metodePembayaran === 'CASH') totalCash += nominal;
      else if (p.metodePembayaran === 'TRANSFER') totalTransfer += nominal;

      const gkey = p.gelombangId ?? '__none__';
      const gname = p.gelombang?.name ?? '(Tanpa Gelombang)';
      const entry =
        perGelombangMap.get(gkey) ??
        { name: gname, total: 0, count: 0, cash: 0, transfer: 0 };
      entry.total += nominal;
      entry.count += 1;
      if (p.metodePembayaran === 'CASH') entry.cash += nominal;
      else if (p.metodePembayaran === 'TRANSFER') entry.transfer += nominal;
      perGelombangMap.set(gkey, entry);
    }

    const perGelombang = Array.from(perGelombangMap.entries())
      .map(([id, v]) => ({
        gelombangId: id === '__none__' ? null : id,
        name: v.name,
        total: v.total,
        count: v.count,
        cashTotal: v.cash,
        transferTotal: v.transfer,
      }))
      .sort((a, b) => b.total - a.total);

    return {
      summary: {
        totalPendapatan: total,
        totalCash,
        totalTransfer,
        jumlahTransaksi: items.length,
      },
      perGelombang,
      transactions: items.map((p) => ({
        id: p.id,
        registrationNumber: p.registrationNumber,
        namaLengkap: p.namaLengkap,
        nominal: p.nominalPembayaran ? Number(p.nominalPembayaran) : 0,
        metode: p.metodePembayaran,
        tanggalBayar: p.tanggalBayar,
        gelombang: p.gelombang,
        dibayarOleh: p.dibayarOleh,
      })),
    };
  }

  /**
   * Excel multi-sheet:
   *   - "Ringkasan": total keseluruhan + per-metode + jumlah transaksi + timestamp generate
   *   - "Per Gelombang": breakdown per gelombang (jumlah + total cash + total transfer + grand total)
   *   - "Transaksi": daftar lengkap per siswa (no reg, nama, gelombang, nominal, metode, tanggal, dicatat oleh)
   */
  async exportPendapatanExcel(filter: RekapFilter) {
    const data = await this.getPendapatan(filter);
    const wb = new ExcelJS.Workbook();
    wb.creator = 'SPMB SMK PGRI 3 DPS';
    wb.created = new Date();
    wb.modified = new Date();

    const HEADER_FILL: ExcelJS.Fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FFE0E7FF' },
    };
    const HEADER_FONT: Partial<ExcelJS.Font> = { bold: true, color: { argb: 'FF1E3A8A' } };
    const TOTAL_FILL: ExcelJS.Fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FFD1FAE5' },
    };
    const TOTAL_FONT: Partial<ExcelJS.Font> = { bold: true, color: { argb: 'FF065F46' } };

    // ─── Sheet 1: Ringkasan ─────────────────────────────────────────────────
    const ws1 = wb.addWorksheet('Ringkasan');
    ws1.columns = [
      { header: 'Metrik', key: 'm', width: 30 },
      { header: 'Nilai', key: 'v', width: 22 },
    ];
    ws1.addRow({ m: 'Tanggal Generate', v: new Date().toLocaleString('id-ID') });
    ws1.addRow({ m: 'Filter — Start Date', v: filter.startDate ?? '(semua)' });
    ws1.addRow({ m: 'Filter — End Date', v: filter.endDate ?? '(semua)' });
    ws1.addRow({ m: 'Filter — Gelombang', v: filter.gelombangId ?? '(semua)' });
    ws1.addRow({ m: 'Filter — Metode', v: filter.metode ?? '(semua)' });
    ws1.addRow({ m: '', v: '' });
    ws1.addRow({ m: 'Jumlah Transaksi', v: data.summary.jumlahTransaksi });
    ws1.addRow({ m: 'Total Tunai (CASH)', v: data.summary.totalCash });
    ws1.addRow({ m: 'Total Transfer', v: data.summary.totalTransfer });
    const totalRow = ws1.addRow({ m: 'TOTAL PENDAPATAN', v: data.summary.totalPendapatan });

    // Number formatting
    const rowTotalCash = ws1.getRow(8);
    const rowTotalTransfer = ws1.getRow(9);
    rowTotalCash.getCell(2).numFmt = '"Rp"#,##0';
    rowTotalTransfer.getCell(2).numFmt = '"Rp"#,##0';
    totalRow.getCell(2).numFmt = '"Rp"#,##0';
    totalRow.getCell(1).font = TOTAL_FONT;
    totalRow.getCell(2).font = TOTAL_FONT;
    totalRow.getCell(1).fill = TOTAL_FILL;
    totalRow.getCell(2).fill = TOTAL_FILL;

    // ─── Sheet 2: Per Gelombang ─────────────────────────────────────────────
    const ws2 = wb.addWorksheet('Per Gelombang');
    ws2.columns = [
      { header: 'Gelombang', key: 'name', width: 28 },
      { header: 'Jumlah Transaksi', key: 'count', width: 18 },
      { header: 'Total Tunai', key: 'cash', width: 18 },
      { header: 'Total Transfer', key: 'transfer', width: 18 },
      { header: 'Total', key: 'total', width: 18 },
    ];
    data.perGelombang.forEach((g) => {
      const r = ws2.addRow({
        name: g.name,
        count: g.count,
        cash: g.cashTotal,
        transfer: g.transferTotal,
        total: g.total,
      });
      r.getCell(3).numFmt = '"Rp"#,##0';
      r.getCell(4).numFmt = '"Rp"#,##0';
      r.getCell(5).numFmt = '"Rp"#,##0';
    });
    // Grand total row
    const grandRow = ws2.addRow({
      name: 'TOTAL',
      count: data.summary.jumlahTransaksi,
      cash: data.summary.totalCash,
      transfer: data.summary.totalTransfer,
      total: data.summary.totalPendapatan,
    });
    grandRow.getCell(3).numFmt = '"Rp"#,##0';
    grandRow.getCell(4).numFmt = '"Rp"#,##0';
    grandRow.getCell(5).numFmt = '"Rp"#,##0';
    grandRow.eachCell((c) => {
      c.font = TOTAL_FONT;
      c.fill = TOTAL_FILL;
    });

    // ─── Sheet 3: Transaksi ─────────────────────────────────────────────────
    const ws3 = wb.addWorksheet('Transaksi');
    ws3.columns = [
      { header: 'No. Pendaftaran', key: 'reg', width: 22 },
      { header: 'Nama Siswa', key: 'nama', width: 32 },
      { header: 'Gelombang', key: 'g', width: 18 },
      { header: 'Nominal', key: 'nom', width: 16 },
      { header: 'Metode', key: 'm', width: 14 },
      { header: 'Tanggal Dicatat', key: 't', width: 22 },
      { header: 'Dicatat Oleh', key: 'u', width: 26 },
    ];
    data.transactions.forEach((t) => {
      const r = ws3.addRow({
        reg: t.registrationNumber,
        nama: t.namaLengkap,
        g: t.gelombang?.name ?? '-',
        nom: t.nominal,
        m: t.metode === 'CASH' ? 'Tunai' : t.metode === 'TRANSFER' ? 'Transfer Bank' : '-',
        t: t.tanggalBayar ? new Date(t.tanggalBayar).toLocaleString('id-ID') : '-',
        u: t.dibayarOleh?.name ?? '-',
      });
      r.getCell(4).numFmt = '"Rp"#,##0';
    });

    // Header styling on all sheets
    [ws1, ws2, ws3].forEach((ws) => {
      ws.getRow(1).font = HEADER_FONT;
      ws.getRow(1).fill = HEADER_FILL;
      ws.getRow(1).alignment = { vertical: 'middle', horizontal: 'left' };
      ws.getRow(1).height = 20;
    });

    const buf = await wb.xlsx.writeBuffer();
    return Buffer.from(buf);
  }
}
