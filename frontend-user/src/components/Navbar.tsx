import { Link, NavLink, useLocation } from 'react-router-dom';
import { motion } from 'framer-motion';
import logoSmk from '../assets/logosmk.png';

export default function Navbar() {
  const location = useLocation();
  return (
    <motion.header
      initial={{ y: -20, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      transition={{ duration: 0.4 }}
      className="sticky top-0 z-40 border-b border-slate-200 bg-white/80 backdrop-blur"
    >
      <div className="container-page flex h-16 items-center justify-between">
        <Link to="/" className="flex items-center gap-2 font-bold text-primary-500">
          <img
            src={logoSmk}
            alt="Logo SMK PGRI 3 Denpasar"
            className="h-9 w-9 shrink-0 rounded-lg object-contain ring-1 ring-slate-200 bg-white p-0.5"
          />
          <div className="leading-tight">
            <div className="text-sm">SPMB</div>
            <div className="text-xs font-normal text-slate-500">SMK PGRI 3 Denpasar</div>
          </div>
        </Link>

        <nav className="hidden items-center gap-1 md:flex">
          <NavItem to="/" label="Beranda" pathname={location.pathname} />
          <NavItem to="/daftar" label="Pendaftaran" pathname={location.pathname} />
          <NavItem to="/cek-status" label="Cek Status" pathname={location.pathname} />
        </nav>

        <Link to="/daftar" className="btn-primary text-xs md:text-sm">
          Daftar Sekarang
        </Link>
      </div>
    </motion.header>
  );
}

function NavItem({ to, label, pathname }: { to: string; label: string; pathname: string }) {
  const active = pathname === to;
  return (
    <NavLink
      to={to}
      className={`relative rounded-md px-3 py-2 text-sm font-medium transition ${
        active ? 'text-primary-500' : 'text-slate-600 hover:text-primary-500'
      }`}
    >
      {label}
      {active && (
        <motion.div
          layoutId="nav-underline"
          className="absolute inset-x-2 -bottom-0.5 h-0.5 rounded bg-primary-500"
        />
      )}
    </NavLink>
  );
}
