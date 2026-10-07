import { NavLink } from 'react-router-dom';
import { useState } from 'react';
import { motion } from 'framer-motion';
import {
  LayoutDashboard,
  GraduationCap,
  CalendarDays,
  BookOpen,
  Shield,
  UserCog,
  ScrollText,
  LogOut,
  Menu,
  X,
  Newspaper,
  Megaphone,
  Wallet,
  UserCircle,
  Settings as SettingsIcon,
  Archive,
  Banknote,
  Shirt,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import logoSmk from '../assets/logosmk.png';

const NAV: Array<{
  to: string;
  label: string;
  icon: any;
  permission?: string;
  roles?: string[];
}> = [
  { to: '/', label: 'Dashboard', icon: LayoutDashboard },
  { to: '/pendaftar', label: 'Pendaftar', icon: GraduationCap, permission: 'spmb.view' },
  { to: '/gelombang', label: 'Gelombang', icon: CalendarDays, permission: 'gelombang.view' },
  { to: '/jurusan', label: 'Jurusan', icon: BookOpen, permission: 'jurusan.view' },
  { to: '/users', label: 'User', icon: UserCog, permission: 'user.view' },
  { to: '/roles', label: 'Role & Permission', icon: Shield, permission: 'role.view' },
  { to: '/audit', label: 'Audit Log', icon: ScrollText, permission: 'audit.view' },
  { to: '/berita', label: 'Berita', icon: Newspaper, permission: 'berita.view' },
  { to: '/pengumuman', label: 'Pengumuman', icon: Megaphone, permission: 'pengumuman.view' },
  // Bendahara menu: rekap pendapatan (permission spmb.bayar sudah dimiliki Bendahara + Admin)
  // URL tetap /rekap-pendapatan supaya tidak breaking existing link, hanya label menu yang diganti.
  { to: '/rekap-pendapatan', label: 'Bendahara', icon: Wallet, permission: 'spmb.bayar' },
  // Pengaturan Laporan — admin-only (settings.view)
  { to: '/pengaturan-laporan', label: 'Pengaturan Laporan', icon: SettingsIcon, permission: 'settings.view' },
  // Pengaturan Harga — admin-only (settings.view), edit butuh settings.manage (Superadmin)
  { to: '/pengaturan-harga', label: 'Pengaturan Harga', icon: Banknote, permission: 'settings.view' },
  // Arsip & Reset Tahun Ajaran — Superadmin only
  { to: '/tahun-ajaran', label: 'Arsip Tahun Ajaran', icon: Archive, roles: ['Superadmin'] },
  // Master Item Seragam — Superadmin only (spmb.seragam_item.manage)
  { to: '/seragam-item-master', label: 'Master Item Seragam', icon: Shirt, permission: 'spmb.seragam_item.manage' },
  // Profile + Verifikasi WhatsApp sendiri (semua role boleh — selalu tampil)
  { to: '/profile', label: 'Profile & WhatsApp', icon: UserCircle },
];

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const { user, hasPermission, hasAnyRole, logout } = useAuth();
  const [open, setOpen] = useState(false);

  const visibleNav = NAV.filter(
    (n) =>
      (!n.permission || hasPermission(n.permission)) &&
      (!n.roles || hasAnyRole(...n.roles)),
  );

  return (
    <div className="min-h-screen bg-slate-100">
      {/* Mobile top bar */}
      <div className="sticky top-0 z-30 flex h-14 items-center justify-between border-b border-slate-200 bg-white px-4 md:hidden">
        <button onClick={() => setOpen(true)} className="p-1.5 text-slate-600">
          <Menu size={20} />
        </button>
        <div className="flex items-center gap-2 font-semibold text-primary-500">
          <img
            src={logoSmk}
            alt="Logo SMK PGRI 3 Denpasar"
            className="h-8 w-8 shrink-0 rounded-lg object-contain ring-1 ring-slate-200 bg-white p-0.5"
          />
          Admin SPMB
        </div>
        <button onClick={logout} className="p-1.5 text-slate-600">
          <LogOut size={18} />
        </button>
      </div>

      {/* Sidebar — gunakan flex-col dengan area nav yang flex-1 + overflow-y-auto
          supaya menu panjang bisa di-scroll TANPA menutupi footer (profile +
          logout) yang sticky di bawah. Header fixed di atas, footer fixed di
          bawah, nav scrollable di tengah. */}
      <aside
        className={`fixed inset-y-0 left-0 z-40 flex w-64 transform flex-col border-r border-slate-200 bg-white transition-transform md:translate-x-0 ${
          open ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        {/* ── Header (fixed-height) ── */}
        <div className="flex h-14 shrink-0 items-center justify-between border-b border-slate-200 px-4">
          <div className="flex items-center gap-2 font-bold text-primary-500">
            <img
              src={logoSmk}
              alt="Logo SMK PGRI 3 Denpasar"
              className="h-9 w-9 shrink-0 rounded-lg object-contain ring-1 ring-slate-200 bg-white p-0.5"
            />
            <div className="leading-tight">
              <div className="text-sm">Admin</div>
              <div className="text-xs font-normal text-slate-500">SPMB SMK PGRI 3</div>
            </div>
          </div>
          <button onClick={() => setOpen(false)} className="p-1.5 text-slate-500 md:hidden">
            <X size={18} />
          </button>
        </div>

        {/* ── Nav (flex-1 + scrollable) ── */}
        <nav className="flex-1 space-y-1 overflow-y-auto p-3">
          {visibleNav.map((n) => {
            const Icon = n.icon;
            return (
              <NavLink
                key={n.to}
                to={n.to}
                end={n.to === '/'}
                onClick={() => setOpen(false)}
                className={({ isActive }) =>
                  `flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition ${
                    isActive
                      ? 'bg-primary-50 text-primary-600'
                      : 'text-slate-600 hover:bg-slate-50 hover:text-primary-500'
                  }`
                }
              >
                <Icon size={16} />
                {n.label}
              </NavLink>
            );
          })}
        </nav>

        {/* ── Footer (sticky di bawah — tidak ikut scroll) ── */}
        <div className="shrink-0 border-t border-slate-200 bg-white p-3">
          <div className="rounded-lg bg-slate-50 p-3">
            <div className="text-sm font-semibold text-slate-900">{user?.name}</div>
            <div className="text-xs text-slate-500">{user?.email}</div>
            <div className="mt-1 flex flex-wrap gap-1">
              {user?.roles.map((r) => (
                <span key={r} className="badge bg-primary-100 text-primary-700">{r}</span>
              ))}
            </div>
          </div>
          <button onClick={logout} className="btn-ghost mt-2 w-full">
            <LogOut size={14} />
            Logout
          </button>
        </div>
      </aside>

      {/* Main */}
      <div className="md:pl-64">
        <main className="container-page py-6">
          <motion.div
            initial={{ y: 8, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={{ duration: 0.18 }}
          >
            {children}
          </motion.div>
        </main>
      </div>

      {/* Backdrop for mobile sidebar */}
      {open && (
        <div
          onClick={() => setOpen(false)}
          className="fixed inset-0 z-30 bg-black/40 md:hidden"
        />
      )}
    </div>
  );
}
