const http = require('http');

function req(opts, body) {
  return new Promise((resolve, reject) => {
    const r = http.request(opts, res => {
      let s = '';
      res.on('data', c => s += c);
      res.on('end', () => {
        let j;
        try { j = JSON.parse(s); } catch { j = s; }
        resolve({ status: res.statusCode, body: j });
      });
    });
    r.on('error', reject);
    if (body) r.write(typeof body === 'string' ? body : JSON.stringify(body));
    r.end();
  });
}

(async () => {
  console.log('--- 1) Login superadmin ---');
  const login = await req({ hostname: 'localhost', port: 4000, path: '/api/auth/login', method: 'POST', headers: { 'Content-Type': 'application/json' } },
    JSON.stringify({ email: 'superadmin@smk-pgri3dps.sch.id', password: 'change-this-password' }));
  if (!login.body.access_token) {
    console.log('Login gagal:', JSON.stringify(login.body));
    process.exit(1);
  }
  const token = login.body.access_token;
  console.log('  token len:', token.length);

  const headers = { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + token };

  console.log('--- 2) Get active gelombang & jurusan ---');
  const g = await req({ hostname: 'localhost', port: 4000, path: '/api/gelombang/public/active', method: 'GET' });

  const jur = await req({ hostname: 'localhost', port: 4000, path: '/api/jurusan/public', method: 'GET' });
  console.log('  Total jurusan aktif:', jur.body?.length || 0);
  if (!jur.body || jur.body.length === 0) {
    console.log('FAIL: tidak ada jurusan aktif');
    process.exit(1);
  }
  const jurusanId = jur.body[0].id;

  console.log('--- 3) Pakai gelombang aktif ---');
  let gelombangId;
  if (g.body) {
    gelombangId = g.body.id;
    console.log('  Pakai gelombang aktif existing:', g.body.name);
  } else {
    // Nonaktifkan semua gelombang aktif yang ada, lalu buat baru
    const allG = await req({ hostname: 'localhost', port: 4000, path: '/api/gelombang', method: 'GET', headers });
    for (const gg of (allG.body || [])) {
      if (gg.isActive) {
        await req({ hostname: 'localhost', port: 4000, path: '/api/gelombang/' + gg.id, method: 'PATCH', headers }, { isActive: false });
      }
    }
    const newG = await req({
      hostname: 'localhost', port: 4000, path: '/api/gelombang', method: 'POST', headers,
    }, {
      name: 'Gelombang Test PDF ' + Date.now(),
      startDate: new Date(Date.now() - 86400000).toISOString(),
      endDate: new Date(Date.now() + 7 * 86400000).toISOString(),
      isActive: true,
      kuota: [{ jurusanId, quota: 10 }],
    });
    if (newG.status !== 201 && newG.status !== 200) {
      console.log('  Buat gelombang gagal:', newG.status, JSON.stringify(newG.body));
      process.exit(1);
    }
    gelombangId = newG.body.id;
    console.log('  Gelombang baru dibuat:', newG.body.name);
  }

  console.log('--- 4) Register pendaftar via API publik ---');
  const reg = await req({
    hostname: 'localhost', port: 4000, path: '/api/pendaftar/register', method: 'POST',
    headers: { 'Content-Type': 'application/json' },
  }, {
    namaLengkap: 'Tester PDF Scan',
    jenisKelamin: 'L',
    tempatLahir: 'Denpasar',
    tanggalLahir: '2010-01-15',
    nisn: String(Date.now()).slice(-10),
    sekolahAsal: 'SMP Negeri 1 Denpasar',
    alamat: 'Jl. Test No. 123',
    noTelp: '081234567890',
    email: 'tester-pdf@example.com',
    jumlahNilaiUn: 85.5,
    namaIbu: 'Ibu Tester',
    noTelpOrtu: '081234567891',
    jurusanId,
    gelombangId,
  });
  if (reg.status !== 201 && reg.status !== 200) {
    console.log('  Register gagal:', reg.status, JSON.stringify(reg.body));
    process.exit(1);
  }
  console.log('  Pendaftar:', reg.body.registrationNumber, reg.body.status);

  console.log('--- 5) Verify berkas (admin APPROVE) ---');
  const verifyRes = await req({
    hostname: 'localhost', port: 4000, path: '/api/pendaftar/' + reg.body.id + '/verify',
    method: 'POST', headers,
  }, { decision: 'APPROVE' });
  console.log('  Verify result:', verifyRes.body.registrationNumber, verifyRes.body.status);

  console.log('--- 6) Submit pembayaran (publik) ---');
  const pay = await req({
    hostname: 'localhost', port: 4000, path: '/api/pembayaran/submit', method: 'POST',
    headers: { 'Content-Type': 'application/json' },
  }, {
    registrationNumber: reg.body.registrationNumber,
    nominal: 250000,
    tanggalTransfer: new Date().toISOString(),
    namaPengirim: 'Tester PDF',
  });
  if (pay.status !== 201 && pay.status !== 200) {
    console.log('  Submit pembayaran gagal:', pay.status, JSON.stringify(pay.body));
    process.exit(1);
  }
  console.log('  Pembayaran submitted');

  console.log('--- 7) Verify pembayaran (TU) ---');
  // Ambil pembayaranId dari detail pendaftar (relasi 1:1)
  const detail = await req({
    hostname: 'localhost', port: 4000, path: '/api/pendaftar/' + reg.body.id,
    method: 'GET', headers,
  });
  const pembayaranId = detail.body.pembayaran?.id;
  console.log('  pembayaranId:', pembayaranId);
  const payVer = await req({
    hostname: 'localhost', port: 4000, path: '/api/pembayaran/' + pembayaranId + '/verify',
    method: 'POST', headers,
  }, {
    decision: 'TERVERIFIKASI',
    note: 'OK match',
  });
  console.log('  Payment verify status:', payVer.status, JSON.stringify(payVer.body));

  console.log('--- 8) Approve final (admin) -- ini yang generate PDF ---');
  const approve = await req({
    hostname: 'localhost', port: 4000, path: '/api/pendaftar/' + reg.body.id + '/approve-final',
    method: 'POST', headers,
  });
  console.log('  Approve final status:', approve.status, 'pdfGenerated:', approve.body.pdfGenerated);
  if (approve.status !== 201 && approve.status !== 200) {
    console.log('  Approve final gagal:', JSON.stringify(approve.body));
    process.exit(1);
  }
  console.log('  pdfDownloadUrl:', approve.body.pdfDownloadUrl);

  if (!approve.body.pdfDownloadUrl) {
    console.log('FAIL: PDF tidak ter-generate');
    process.exit(1);
  }

  const pdfUrl = approve.body.pdfDownloadUrl;
  console.log('--- 9) Download PDF (public) ---');
  const pdf = await req({ hostname: 'localhost', port: 4000, path: pdfUrl, method: 'GET' });
  const headStr = String(pdf.body).slice(0, 8);
  console.log('  PDF response status:', pdf.status, 'body length:', pdf.body.length, 'first 8 bytes:', headStr);

  if (!headStr.startsWith('%PDF')) {
    console.log('FAIL: bukan PDF valid');
    process.exit(1);
  }

  const sigMatch = pdfUrl.match(/s=([a-f0-9]+)/);
  const signature = sigMatch ? sigMatch[1] : null;
  console.log('  Signature:', signature ? signature.slice(0, 16) + '...' : '(not found)');

  console.log('--- 10) Scan QR (admin scan-daftar-ulang) ---');
  const scan = await req({
    hostname: 'localhost', port: 4000, path: '/api/pendaftar/' + reg.body.id + '/scan-daftar-ulang',
    method: 'POST', headers,
  }, { signature });
  console.log('  Scan result:', scan.status, JSON.stringify(scan.body));

  console.log('--- 11) Cek status akhir pendaftar (public) ---');
  const final = await req({
    hostname: 'localhost', port: 4000, path: '/api/pendaftar/check/' + reg.body.registrationNumber,
    method: 'GET',
  });
  console.log('  Final status:', final.body.status);
  console.log('  hasPdf:', final.body.hasPdf);
  console.log('  daftarUlangConfirmedAt:', final.body.daftarUlangConfirmedAt);

  console.log('--- 12) Cek audit log SPMB ---');
  const audit = await req({
    hostname: 'localhost', port: 4000, path: '/api/audit-logs?module=spmb&pageSize=10',
    method: 'GET', headers,
  });
  console.log('  Audit items count:', audit.body.items?.length);
  (audit.body.items || []).slice(0, 5).forEach(l =>
    console.log('   -', l.action, 'by', l.user?.email));

  console.log('--- 13) Cek audit log Gelombang ---');
  const auditG = await req({
    hostname: 'localhost', port: 4000, path: '/api/gelombang/audit/history',
    method: 'GET', headers,
  });
  console.log('  Gelombang audit items:', auditG.body.items?.length);
  (auditG.body.items || []).slice(0, 3).forEach(l =>
    console.log('   -', l.action, 'by', l.user?.email));

  console.log('--- 14) Cek audit log Jurusan ---');
  const auditJ = await req({
    hostname: 'localhost', port: 4000, path: '/api/jurusan/audit/history',
    method: 'GET', headers,
  });
  console.log('  Jurusan audit items:', auditJ.body.items?.length);

  console.log('--- 15) Test download PDF tanpa signature (harus 400) ---');
  const noSig = await req({
    hostname: 'localhost', port: 4000,
    path: '/api/pendaftar/check/' + reg.body.registrationNumber + '/download-pdf',
    method: 'GET',
  });
  console.log('  No-signature status:', noSig.status, JSON.stringify(noSig.body));

  console.log('--- 16) Test download PDF dengan signature salah (harus 400) ---');
  const wrongSig = await req({
    hostname: 'localhost', port: 4000,
    path: '/api/pendaftar/check/' + reg.body.registrationNumber + '/download-pdf?s=wrongsignature',
    method: 'GET',
  });
  console.log('  Wrong-signature status:', wrongSig.status, JSON.stringify(wrongSig.body));

  console.log('--- 17) Test scan QR dengan signature salah (harus 400) ---');
  const wrongScan = await req({
    hostname: 'localhost', port: 4000,
    path: '/api/pendaftar/' + reg.body.id + '/scan-daftar-ulang',
    method: 'POST', headers,
  }, { signature: 'wrongsignature' });
  console.log('  Wrong-scan status:', wrongScan.status, JSON.stringify(wrongScan.body));

  console.log('\n=== SEMUA TEST PASSED ===');
})().catch(e => { console.error('FAIL:', e.message); console.error(e.stack); process.exit(1); });
