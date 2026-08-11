import { Injectable } from '@nestjs/common';
import ExcelJS from 'exceljs';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class ExportService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Export siswa aktif ke format XLSX (template sederhana berbasis Dapodik).
   * Kolom mengikuti field yang tersedia di sistem.
   * Pengguna bisa membuka file ini di Excel dan menyalin ke template Dapodik resmi.
   */
  async exportSiswaAktifToXlsx(): Promise<Buffer> {
    const list = await this.prisma.pendaftar.findMany({
      where: { status: 'SISWA_AKTIF' },
      include: {
        jurusan: true,
        gelombang: true,
        pembayaran: true,
      },
      orderBy: { namaLengkap: 'asc' },
    });

    const wb = new ExcelJS.Workbook();
    wb.creator = 'SPMB SMK PGRI 3 Denpasar';
    wb.created = new Date();
    const ws = wb.addWorksheet('Siswa Aktif');

    ws.columns = [
      { header: 'No', key: 'no', width: 5 },
      { header: 'Nomor Pendaftaran', key: 'reg', width: 22 },
      { header: 'Nama Lengkap', key: 'nama', width: 32 },
      { header: 'Jenis Kelamin', key: 'jk', width: 8 },
      { header: 'Tempat Lahir', key: 'tempat', width: 20 },
      { header: 'Tanggal Lahir', key: 'tgl', width: 14 },
      { header: 'NISN', key: 'nisn', width: 14 },
      { header: 'Sekolah Asal', key: 'sekolah', width: 28 },
      { header: 'Alamat', key: 'alamat', width: 36 },
      { header: 'No. Telp', key: 'telp', width: 16 },
      { header: 'Nilai UN', key: 'nun', width: 10 },
      { header: 'Prestasi', key: 'prestasi', width: 24 },
      { header: 'Nama Ibu', key: 'ibu', width: 28 },
      { header: 'No. Telp Ortu', key: 'ortu', width: 16 },
      { header: 'Jurusan', key: 'jurusan', width: 32 },
      { header: 'Gelombang', key: 'gelombang', width: 18 },
      { header: 'Tanggal Daftar', key: 'tglDaftar', width: 16 },
      { header: 'Nominal Bayar', key: 'nominal', width: 16 },
      { header: 'Tgl Transfer', key: 'tglTf', width: 16 },
      { header: 'Nama Pengirim', key: 'pengirim', width: 24 },
    ];

    // Header style
    ws.getRow(1).font = { bold: true };
    ws.getRow(1).fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FF1E40AF' },
    };
    ws.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
    ws.getRow(1).alignment = { vertical: 'middle' };

    list.forEach((p, i) => {
      ws.addRow({
        no: i + 1,
        reg: p.registrationNumber,
        nama: p.namaLengkap,
        jk: p.jenisKelamin === 'L' ? 'Laki-laki' : 'Perempuan',
        tempat: p.tempatLahir,
        tgl: p.tanggalLahir.toISOString().slice(0, 10),
        nisn: p.nisn,
        sekolah: p.sekolahAsal,
        alamat: p.alamat,
        telp: p.noTelp,
        nun: Number(p.jumlahNilaiUn),
        prestasi: p.prestasi || '',
        ibu: p.namaIbu,
        ortu: p.noTelpOrtu,
        jurusan: `${p.jurusan.code} - ${p.jurusan.name}`,
        gelombang: p.gelombang.name,
        tglDaftar: p.createdAt.toISOString().slice(0, 10),
        nominal: p.pembayaran ? Number(p.pembayaran.nominal) : '',
        tglTf: p.pembayaran?.tanggalTransfer
          ? p.pembayaran.tanggalTransfer.toISOString().slice(0, 10)
          : '',
        pengirim: p.pembayaran?.namaPengirim || '',
      });
    });

    ws.eachRow((row) => {
      row.eachCell((cell) => {
        cell.border = {
          top: { style: 'thin' },
          left: { style: 'thin' },
          bottom: { style: 'thin' },
          right: { style: 'thin' },
        };
      });
    });

    const buffer = await wb.xlsx.writeBuffer();
    return Buffer.from(buffer);
  }
}
