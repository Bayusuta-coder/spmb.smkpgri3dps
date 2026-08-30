/**
 * Generate kop surat SMK PGRI 3 Denpasar sebagai PNG high-res.
 *
 * Output: backend/src/assets/kop-surat.png
 *
 * Cara pakai:
 *   cd backend
 *   npx ts-node scripts/generate-kop-surat.ts
 *
 * Atau re-generate kapan saja kalau ada perubahan desain kop surat.
 * PdfService akan otomatis load file ini di backend/src/assets/kop-surat.png.
 */
import * as fs from 'fs';
import * as path from 'path';
import sharp from 'sharp';

const ASSETS_DIR = path.join(__dirname, '..', 'src', 'assets');
const LOGO_PATH = path.join(ASSETS_DIR, 'logosmk.png');
const OUTPUT_PATH = path.join(ASSETS_DIR, 'kop-surat.png');

// Dimensi PNG — wide aspect ratio supaya pas sebagai header PDF A4 (595pt wide).
// 1200 x 340 = ~3.53:1 (lebih compact, supaya PDF muat lebih banyak konten di body)
const WIDTH = 1200;
const HEIGHT = 340;

function buildSvg(logoBase64: string): string {
  // Posisi & style dituning manual supaya konsisten dengan spek desain.
  // Font: serif untuk nuansa formal; sans-serif fallback aman di Windows/Linux.
  return `
<svg xmlns="http://www.w3.org/2000/svg" width="${WIDTH}" height="${HEIGHT}" viewBox="0 0 ${WIDTH} ${HEIGHT}">
  <defs>
    <style>
      .yayasan  { font-family: Georgia, 'Times New Roman', serif; font-size: 20px;  font-weight: 600; fill: #0f172a; }
      .sekolah  { font-family: Georgia, 'Times New Roman', serif; font-size: 44px;  font-weight: 800; fill: #0f172a; letter-spacing: 1.5px; }
      .akreditasi { font-family: Georgia, 'Times New Roman', serif; font-size: 16px; font-weight: 700; fill: #b91c1c; letter-spacing: 0.5px; }
      .kontak   { font-family: Arial, Helvetica, sans-serif; font-size: 15px; fill: #1e293b; }
      .kontak-bold { font-family: Arial, Helvetica, sans-serif; font-size: 15px; font-weight: 600; fill: #1e293b; }
      .aksara   { font-family: Georgia, serif; font-size: 13px; font-style: italic; fill: #64748b; letter-spacing: 1px; }
    </style>
  </defs>

  <!-- Background putih -->
  <rect width="${WIDTH}" height="${HEIGHT}" fill="#ffffff"/>

  <!-- Logo di kiri -->
  <image x="30" y="30" width="260" height="260" href="data:image/png;base64,${logoBase64}" preserveAspectRatio="xMidYMid meet"/>

  <!-- Teks kop surat di kanan logo (margin kiri dari logo: 320px) -->
  <!-- Baris 1: Yayasan (kecil, di atas) -->
  <text x="320" y="60"  class="yayasan">(YPLP) PGRI KOTA DENPASAR</text>

  <!-- Aksara Bali dekoratif baris 1 (placeholder italic, gaya ornamen) -->
  <text x="320" y="86" class="aksara">ꦲꦶꦏꦸꦛꦸꦮꦲꦶꦪꦤ꧀</text>

  <!-- Baris 2: Nama sekolah besar (highlight utama) -->
  <text x="320" y="138" class="sekolah">SMK PGRI 3 DENPASAR</text>

  <!-- Aksara Bali dekoratif baris 2 -->
  <text x="320" y="164" class="aksara">ꦱꦺꦴꦫꦶꦁꦏꦶꦣꦸꦭꦶꦁꦏꦤ꧀</text>

  <!-- Akreditasi -->
  <text x="320" y="194" class="akreditasi">TERAKREDITASI : A (UNGGUL)</text>

  <!-- Alamat -->
  <text x="320" y="226" class="kontak">Jalan Drupadi XVII, Dewi Tara No. 7, Denpasar</text>

  <!-- Telp & Email (1 baris) -->
  <text x="320" y="252" class="kontak">
    Telp. <tspan class="kontak-bold">(0361) 264322</tspan>
     |  Email: <tspan class="kontak-bold">smkpgri3dpsjaya@gmail.com</tspan>
  </text>

  <!-- Garis double di bawah (tebal di atas, tipis di bawah) -->
  <line x1="20" y1="300" x2="${WIDTH - 20}" y2="300" stroke="#0f172a" stroke-width="4"/>
  <line x1="20" y1="310" x2="${WIDTH - 20}" y2="310" stroke="#0f172a" stroke-width="1.5"/>
</svg>
`;
}

async function main() {
  if (!fs.existsSync(LOGO_PATH)) {
    throw new Error(
      `Logo tidak ditemukan: ${LOGO_PATH}. Taruh logosmk.png di folder backend/src/assets/.`,
    );
  }

  console.log('🎨 Generating kop surat...');
  console.log('   Logo:', LOGO_PATH);
  console.log('   Output:', OUTPUT_PATH);
  console.log('   Size:', `${WIDTH}x${HEIGHT}px`);

  const logoBuffer = fs.readFileSync(LOGO_PATH);
  const logoBase64 = logoBuffer.toString('base64');

  const svg = buildSvg(logoBase64);

  await sharp(Buffer.from(svg))
    .png({ compressionLevel: 9 })
    .toFile(OUTPUT_PATH);

  const stat = fs.statSync(OUTPUT_PATH);
  console.log(`✅ Kop surat tersimpan (${(stat.size / 1024).toFixed(1)} KB)`);
}

main().catch((e) => {
  console.error('❌ Gagal generate kop surat:', e.message);
  process.exit(1);
});