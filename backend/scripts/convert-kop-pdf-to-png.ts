/**
 * Convert "Kop Surat.pdf" → "kop-surat.png" resolusi tinggi.
 *
 * Output: backend/src/assets/kop-surat.png
 *
 * Pendekatan:
 *   - Pakai pdftoppm (poppler) untuk render PDF page 1 ke PNG sementara
 *   - Pakai sharp untuk optimasi (crop whitespace, kompresi)
 *   - SEKALI jalan di setup; output jadi asset statis
 *
 * Prasyarat:
 *   - pdftoppm tersedia di PATH, atau set POPPLER_BIN env var ke folder bin-nya
 *   - Poppler untuk Windows: winget install oschwartz10612.Poppler
 *
 * Usage:
 *   cd backend
 *   npx ts-node scripts/convert-kop-pdf-to-png.ts
 *   npx ts-node scripts/convert-kop-pdf-to-png.ts path/to/kop.pdf
 *   npx ts-node scripts/convert-kop-pdf-to-png.ts path/to/kop.pdf -r 300
 */
import { spawnSync } from 'child_process';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import sharp from 'sharp';

function findPdftoppm(): string {
  // 1. Cek env override
  const envBin = process.env.POPPLER_BIN;
  if (envBin) {
    const exe = path.join(envBin, 'pdftoppm.exe');
    if (fs.existsSync(exe)) return exe;
    const unix = path.join(envBin, 'pdftoppm');
    if (fs.existsSync(unix)) return unix;
  }

  // 2. Cek di PATH
  const which = spawnSync('where', ['pdftoppm'], { encoding: 'utf8' });
  if (which.status === 0 && which.stdout) {
    const first = which.stdout.split(/\r?\n/).find((l) => l.trim());
    if (first && fs.existsSync(first.trim())) return first.trim();
  }

  // 3. Cek lokasi umum Windows (WinGet)
  const candidates = [
    path.join(
      process.env.LOCALAPPDATA || '',
      'Microsoft',
      'WinGet',
      'Packages',
    ),
  ];
  for (const dir of candidates) {
    if (!fs.existsSync(dir)) continue;
    const entries = fs.readdirSync(dir).filter((n) => /Poppler/i.test(n));
    for (const pkg of entries) {
      const binPath = path.join(
        dir,
        pkg,
        'poppler-25.07.0',
        'Library',
        'bin',
        'pdftoppm.exe',
      );
      if (fs.existsSync(binPath)) return binPath;
      // Coba versi lain
      try {
        const versions = fs.readdirSync(path.join(dir, pkg));
        for (const v of versions) {
          const alt = path.join(dir, pkg, v, 'Library', 'bin', 'pdftoppm.exe');
          if (fs.existsSync(alt)) return alt;
        }
      } catch {}
    }
  }

  throw new Error(
    'pdftoppm tidak ditemukan. Install poppler (winget install oschwartz10612.Poppler) atau set POPPLER_BIN env var.',
  );
}

async function main() {
  const arg = process.argv[2];
  const PROJECT = path.resolve(__dirname, '..', '..');
  const SOURCE =
    arg ||
    path.join(PROJECT, 'frontend-user', 'src', 'assets', 'Kop Surat.pdf');
  const OUT = path.join(__dirname, '..', 'src', 'assets', 'kop-surat.png');
  const TMP_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'kop-'));

  if (!fs.existsSync(SOURCE)) {
    throw new Error(`Source PDF tidak ditemukan: ${SOURCE}`);
  }
  console.log('📄 Source PDF:', SOURCE);
  console.log('🖼️  Output PNG:', OUT);

  const pdftoppm = findPdftoppm();
  console.log('🔧 pdftoppm:', pdftoppm);

  // Target: width ~2400px untuk kualitas print (≈ 200 DPI di A4)
  const TARGET_WIDTH_PX = 2400;

  // Pakai pdftoppm untuk render page 1 ke PNG di TMP_DIR.
  // pdftoppm tidak punya opsi DPI langsung, jadi kita pakai opsi -scale-to
  // (1 unit = 1/72 inch; -scale-to 2400 menghasilkan width = 2400px).
  // Format: pdftoppm -png -scale-to 2400 -r 200 input.pdf /tmp/output-prefix
  const tmpPrefix = path.join(TMP_DIR, 'kop');
  const result = spawnSync(
    pdftoppm,
    [
      '-png',
      '-r', '200',           // 200 DPI (akan di-resize lagi oleh sharp)
      '-f', '1', '-l', '1',  // hanya page 1
      '-singlefile',
      SOURCE,
      tmpPrefix,
    ],
    { encoding: 'utf8' },
  );
  if (result.status !== 0) {
    console.error('pdftoppm stderr:', result.stderr);
    throw new Error('pdftoppm gagal render PDF');
  }

  const renderedPng = `${tmpPrefix}.png`;
  if (!fs.existsSync(renderedPng)) {
    throw new Error(`File output pdftoppm tidak ada: ${renderedPng}`);
  }
  console.log('📦 Rendered:', renderedPng, `(${(fs.statSync(renderedPng).size / 1024).toFixed(1)} KB)`);

  // Resize + kompresi pakai sharp, dan trim whitespace
  await sharp(renderedPng)
    .resize({ width: TARGET_WIDTH_PX, withoutEnlargement: false })
    .trim() // crop whitespace pinggir otomatis
    .png({ compressionLevel: 9 })
    .toFile(OUT);

  const outMeta = await sharp(OUT).metadata();
  console.log(
    `✅ Saved ${OUT} (${(fs.statSync(OUT).size / 1024).toFixed(1)} KB, ${outMeta.width}×${outMeta.height} px)`,
  );
  console.log(
    `📏 Aspect ratio (h/w): ${((outMeta.height! / outMeta.width!) as number).toFixed(4)}`,
  );

  // Cleanup
  try {
    fs.unlinkSync(renderedPng);
    fs.rmdirSync(TMP_DIR);
  } catch {}
}

main().catch((e) => {
  console.error('❌ Gagal:', e);
  process.exit(1);
});