export default function Footer() {
  return (
    <footer className="border-t border-slate-200 bg-white py-8">
      <div className="container-page flex flex-col items-start justify-between gap-3 text-sm text-slate-500 md:flex-row md:items-center">
        <div>
          © {new Date().getFullYear()} SMK PGRI 3 Denpasar. Semua hak dilindungi.
        </div>
        <div className="flex flex-wrap items-center gap-4">
          <a href="mailto:info@smk-pgri3dps.sch.id" className="hover:text-primary-500">
            info@smk-pgri3dps.sch.id
          </a>
          <span>·</span>
          <a href="/admin" className="hover:text-primary-500">
            Login Admin
          </a>
        </div>
      </div>
    </footer>
  );
}
