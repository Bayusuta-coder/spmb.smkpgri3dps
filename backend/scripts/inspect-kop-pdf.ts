/**
 * Inspect PDF — list semua object di page 1, terutama embedded images & dimensions.
 */
import * as fs from 'fs';
import * as path from 'path';

async function main() {
  const arg = process.argv[2];
  const PROJECT = path.resolve(__dirname, '..', '..');
  const SOURCE =
    arg ||
    path.join(PROJECT, 'frontend-user', 'src', 'assets', 'Kop Surat.pdf');

  console.log('📄 Inspecting:', SOURCE);
  const data = fs.readFileSync(SOURCE);

  // @ts-ignore
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
  // @ts-ignore
  pdfjs.GlobalWorkerOptions.workerSrc =
    'file://' +
    require.resolve('pdfjs-dist/legacy/build/pdf.worker.mjs').replace(
      /\\/g,
      '/',
    );

  const loadingTask = pdfjs.getDocument({ data: new Uint8Array(data) });
  const pdf = await loadingTask.promise;
  console.log(`📑 Pages: ${pdf.numPages}`);

  for (let p = 1; p <= pdf.numPages; p++) {
    const page = await pdf.getPage(p);
    const viewport = page.getViewport({ scale: 1.0 });
    console.log(
      `\n=== Page ${p}: ${viewport.width.toFixed(1)} × ${viewport.height.toFixed(1)} pt ===`,
    );
    const ops = await page.getOperatorList();
    console.log(`📊 Operator count: ${ops.fnArray.length}`);
    // Count operator types
    const counts = new Map<string, number>();
    for (let i = 0; i < ops.fnArray.length; i++) {
      const name = ops.fnArray[i] as any;
      // ops has OPS enum mapping
      counts.set(String(name), (counts.get(String(name)) || 0) + 1);
    }
    // Print summary
    const OPS = (pdfjs as any).OPS;
    if (OPS) {
      for (const [key, val] of Object.entries(OPS)) {
        const n = counts.get(String(val)) || 0;
        if (n > 0) console.log(`  ${key} (${val}): ${n}`);
      }
    }
  }

  process.exit(0);
}

main().catch((e) => {
  console.error('❌:', e);
  process.exit(1);
});