import {
  InputHTMLAttributes,
  forwardRef,
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
} from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Calendar, X, ChevronLeft, ChevronRight } from 'lucide-react';

/**
 * Reusable DateTimePicker — custom calendar panel (BUKAN native browser
 * datetime-local), styling konsisten dengan CustomSelect:
 *   - rounded-md border + thin focus ring (primary-200)
 *   - containerClassName untuk spacing ke parent
 *
 * Kenapa custom & bukan native?
 *   - Native `<input type="datetime-local">` punya style kaku berbeda tiap
 *     browser (Chrome/Firefox/Safari tidak konsisten), dan panel picker-nya
 *     susah di-styling — tidak match dengan tema aplikasi.
 *   - Native picker nggak bisa di-customize untuk kebutuhan i18n (bahasa
 *     Indonesia, 24-hour format yang konsisten, dsb).
 *   - Custom panel = visual match dengan CustomSelect, Calendar/Clock icon,
 *     dan highlight tanggal hari ini yang konsisten di semua browser.
 *
 * Format value ke parent (string, sama dengan native datetime-local):
 *   - `datetime` → "YYYY-MM-DDTHH:mm"
 *   - `date`     → "YYYY-MM-DD"
 *   - kosong      → ""
 *
 * Helper:
 *   - `isoToLocalInput(iso, mode)` — convert backend ISO → format input
 *   - `localInputToIso(v)`         — convert format input → ISO string / null
 */

export type DateTimePickerProps = Omit<
  InputHTMLAttributes<HTMLInputElement>,
  'type' | 'value' | 'onChange' | 'size'
> & {
  /** Nilai input. Format: "YYYY-MM-DDTHH:mm" (datetime) / "YYYY-MM-DD" (date). '' = kosong. */
  value: string;
  /** Dipanggil setiap user memilih tanggal/waktu baru. '' saat dikosongkan. */
  onChange: (value: string) => void;
  /**
   * `datetime` → date + time picker (default, untuk jadwal tayang Berita).
   * `date`     → date only (untuk Gelombang / Pengumuman).
   */
  mode?: 'datetime' | 'date';
  /** Tampilkan icon calendar di kiri trigger (default: true). */
  showIcon?: boolean;
  /** Tampilkan tombol clear "×" di kanan trigger saat value tidak kosong (default: true). */
  clearable?: boolean;
  /** Placeholder saat value kosong. */
  placeholder?: string;
  /** Extra className untuk container wrapper (mis. margin-bottom). */
  containerClassName?: string;
  /** Step dropdown menit (default: 5 — 0,5,10,...,55). */
  minuteStep?: number;
  /** Batas minimum tanggal yang bisa dipilih (format sama dgn `value`). */
  min?: string;
  /** Batas maksimum tanggal yang bisa dipilih (format sama dgn `value`). */
  max?: string;
  /**
   * Disable tanggal di masa lalu (default: `true` — untuk jadwal tayang
   * Berita/Gelombang). Set ke `false` untuk kasus seperti tanggal lahir
   * siswa, di mana tanggal masa lalu yang valid.
   */
  disablePast?: boolean;
  /**
   * Disable tanggal di masa depan (default: `false`). Set ke `true` untuk
   * kasus seperti tanggal lahir siswa — tanggal hari ini & masa depan
   * tidak masuk akal.
   */
  disableFuture?: boolean;
  /**
   * Tahun default saat picker pertama kali dibuka dan `value` masih kosong.
   * Berguna untuk tanggal lahir (mis. mundur 16 tahun dari sekarang supaya
   * user tidak perlu klik prev/next puluhan kali).
   */
  defaultYear?: number;
  /**
   * Lebar rentang tahun di dropdown header kalender (default: 10 — tampilkan
   * viewYear ± N tahun).
   */
  yearRange?: number;
};

// ─────────────────────────────────────────────────────────────────────────
// Konstanta i18n (id-ID)
// ─────────────────────────────────────────────────────────────────────────

const DAYS_ID = ['Min', 'Sen', 'Sel', 'Rab', 'Kam', 'Jum', 'Sab'];
const MONTHS_ID = [
  'Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni',
  'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember',
];
const MONTHS_ID_SHORT = MONTHS_ID.map((m) => m.slice(0, 3));

// ─────────────────────────────────────────────────────────────────────────
// Format helpers
// ─────────────────────────────────────────────────────────────────────────

const pad2 = (n: number) => String(n).padStart(2, '0');

interface ParsedDate {
  year: number;
  month: number; // 1-12
  day: number;
  hour: number;
  minute: number;
}

function parseValue(v: string | null | undefined): ParsedDate | null {
  if (!v) return null;
  const m = v.match(/^(\d{4})-(\d{2})-(\d{2})(?:T(\d{2}):(\d{2}))?/);
  if (!m) return null;
  return {
    year: parseInt(m[1], 10),
    month: parseInt(m[2], 10),
    day: parseInt(m[3], 10),
    hour: parseInt(m[4] ?? '0', 10),
    minute: parseInt(m[5] ?? '0', 10),
  };
}

function buildValue(p: ParsedDate, mode: 'datetime' | 'date'): string {
  const datePart = `${p.year}-${pad2(p.month)}-${pad2(p.day)}`;
  if (mode === 'date') return datePart;
  return `${datePart}T${pad2(p.hour)}:${pad2(p.minute)}`;
}

/** "2026-09-27T14:00" → "27 Sep 2026, 14:00" (id-ID) */
function formatDisplay(
  v: string,
  mode: 'datetime' | 'date',
): string {
  const p = parseValue(v);
  if (!p) return '';
  const datePart = `${p.day} ${MONTHS_ID_SHORT[p.month - 1]} ${p.year}`;
  if (mode === 'date') return datePart;
  return `${datePart}, ${pad2(p.hour)}:${pad2(p.minute)}`;
}

/** Convert ISO datetime string dari backend → format native input. */
export function isoToLocalInput(
  iso: string | null | undefined,
  mode: 'datetime' | 'date' = 'datetime',
): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '';
  // Ambil komponen LOCAL time, BUKAN UTC, supaya tanggal/jam yang dipilih
  // admin tidak geser karena konversi zona waktu (lihat diskusi di git log).
  const yyyy = d.getFullYear();
  const mm = pad2(d.getMonth() + 1);
  const dd = pad2(d.getDate());
  if (mode === 'date') return `${yyyy}-${mm}-${dd}`;
  const hh = pad2(d.getHours());
  const mi = pad2(d.getMinutes());
  return `${yyyy}-${mm}-${dd}T${hh}:${mi}`;
}

/** Convert format native input → ISO datetime string / null. */
export function localInputToIso(v: string): string | null {
  if (!v) return null;
  // Native datetime-local tanpa zona waktu → treat sebagai local time.
  // Append ":00" detik supaya Prisma DateTime konsisten.
  if (v.length === 16) return `${v}:00`;
  // Date-only → midnight UTC. Aman untuk filter tanggal-only (Gelombang).
  if (v.length === 10) return `${v}T00:00:00.000Z`;
  return v;
}

// ─────────────────────────────────────────────────────────────────────────
// Calendar grid builder
// ─────────────────────────────────────────────────────────────────────────

function buildCalendarDays(
  year: number,
  month: number,
): { date: Date; inMonth: boolean }[] {
  const first = new Date(year, month - 1, 1);
  const firstDayOfWeek = first.getDay(); // 0 = Sun
  const lastDay = new Date(year, month, 0).getDate(); // last day of month

  const days: { date: Date; inMonth: boolean }[] = [];

  // Padding dari bulan sebelumnya
  for (let i = firstDayOfWeek - 1; i >= 0; i--) {
    const d = new Date(year, month - 1, -i);
    days.push({ date: d, inMonth: false });
  }
  // Bulan ini
  for (let i = 1; i <= lastDay; i++) {
    days.push({ date: new Date(year, month - 1, i), inMonth: true });
  }
  // Padding dari bulan berikutnya sampai 42 sel (6 baris × 7 kolom) —
  // supaya grid layout stabil & tidak "loncat" antara 4 dan 6 baris.
  while (days.length < 42) {
    const last = days[days.length - 1].date;
    const next = new Date(last);
    next.setDate(next.getDate() + 1);
    days.push({ date: next, inMonth: false });
  }

  return days;
}

function isSameYMD(a: Date, b: { year: number; month: number; day: number }): boolean {
  return (
    a.getFullYear() === b.year &&
    a.getMonth() + 1 === b.month &&
    a.getDate() === b.day
  );
}

// ─────────────────────────────────────────────────────────────────────────
// Component
// ─────────────────────────────────────────────────────────────────────────

export const DateTimePicker = forwardRef<HTMLDivElement, DateTimePickerProps>(
  function DateTimePicker(
    {
      value,
      onChange,
      mode = 'datetime',
      showIcon = true,
      clearable = true,
      placeholder,
      containerClassName = '',
      minuteStep = 5,
      min,
      max,
      disablePast = true,
      disableFuture = false,
      defaultYear,
      yearRange = 10,
      disabled,
      className = '',
      ...rest
    },
    ref,
  ) {
    const autoId = useId();
    const inputId = (rest as { id?: string }).id ?? autoId;

    const containerRef = useRef<HTMLDivElement>(null);
    const triggerRef = useRef<HTMLButtonElement>(null);

    const [open, setOpen] = useState(false);

    const parsed = useMemo(() => parseValue(value), [value]);
    const minParsed = useMemo(() => parseValue(min), [min]);
    const maxParsed = useMemo(() => parseValue(max), [max]);

    // "Sekarang" real-time. Update tiap kali picker DIBUKA (langsung)
    // dan setiap 30 detik selama picker tetap terbuka, supaya boundary
    // "hari ini" / "jam ini" bergeser secara live — bukan nilai yang
    // hardcode saat komponen pertama kali mount.
    //
    // Alasan pakai state (bukan useMemo): boundary perlu bereaksi terhadap
    // waktu yang berjalan, bukan nilai statis. Kalau admin buka picker,
    // diam 5 menit, lalu klik tanggal — "sekarang" harusnya sudah bergeser.
    const [now, setNow] = useState<Date>(() => new Date());
    useEffect(() => {
      if (!open) return;
      // Refresh immediate on open — biar user lihat boundary yang akurat
      // di detik pertama, jangan tunggu 30 detik pertama.
      setNow(new Date());
      const interval = setInterval(() => setNow(new Date()), 30_000);
      return () => clearInterval(interval);
    }, [open]);

    const todayYMD = useMemo(
      () => ({
        year: now.getFullYear(),
        month: now.getMonth() + 1,
        day: now.getDate(),
      }),
      [now],
    );

    // View month (yang sedang ditampilkan di grid kalender) — bisa beda
    // dengan selected date kalau user navigasi ke bulan lain tanpa klik tanggal.
    const [viewYear, setViewYear] = useState(parsed?.year ?? defaultYear ?? todayYMD.year);
    const [viewMonth, setViewMonth] = useState(parsed?.month ?? todayYMD.month);

    // Draft selection (di-commit setiap klik, lihat comment di onPickDate).
    // Tetap dipisah dari view month supaya navigasi prev/next tidak reset
    // pilihan user.
    const [selYear, setSelYear] = useState(parsed?.year ?? todayYMD.year);
    const [selMonth, setSelMonth] = useState(parsed?.month ?? todayYMD.month);
    const [selDay, setSelDay] = useState(parsed?.day ?? todayYMD.day);
    const [selHour, setSelHour] = useState(parsed?.hour ?? 8);
    const [selMinute, setSelMinute] = useState(parsed?.minute ?? 0);

    // Sync internal state ke prop value setiap kali external value berubah
    // (mis. setelah submit form, atau edit berita lain).
    useEffect(() => {
      if (!parsed) return;
      setSelYear(parsed.year);
      setSelMonth(parsed.month);
      setSelDay(parsed.day);
      setSelHour(parsed.hour);
      setSelMinute(parsed.minute);
      setViewYear(parsed.year);
      setViewMonth(parsed.month);
    }, [value]); // eslint-disable-line react-hooks/exhaustive-deps

    const navMonth = useCallback((delta: number) => {
      setViewMonth((m) => {
        let next = m + delta;
        if (next < 1) {
          setViewYear((y) => y - 1);
          next = 12;
        } else if (next > 12) {
          setViewYear((y) => y + 1);
          next = 1;
        }
        return next;
      });
    }, []);

    // Commit + close — dipanggil oleh hampir semua interaksi (date/hour/minute
    // click). Kita commit immediately (tanpa tombol "Terapkan" terpisah) supaya
    // trigger di atas ter-update live — sesuai requirement user: "Setelah
    // user pilih tanggal & jam, tampilkan hasilnya di input trigger".
    const commitAndClose = useCallback(
      (overrides?: Partial<ParsedDate>) => {
        const final: ParsedDate = {
          year: overrides?.year ?? selYear,
          month: overrides?.month ?? selMonth,
          day: overrides?.day ?? selDay,
          hour: overrides?.hour ?? selHour,
          minute: overrides?.minute ?? selMinute,
        };
        onChange(buildValue(final, mode));
        setOpen(false);
      },
      [selYear, selMonth, selDay, selHour, selMinute, mode, onChange],
    );

    // Click outside → tutup panel (value sudah ter-commit kalau user klik tanggal/jam).
    useEffect(() => {
      if (!open) return;
      const handler = (e: MouseEvent) => {
        if (!containerRef.current?.contains(e.target as Node)) {
          setOpen(false);
        }
      };
      // Pakai mousedown (bukan click) supaya handler jalan sebelum
      // event onClick di children — kalau pakai click, panel akan close
      // dulu sebelum onClick di date button sempat jalan.
      document.addEventListener('mousedown', handler);
      return () => document.removeEventListener('mousedown', handler);
    }, [open]);

    // ESC → tutup
    useEffect(() => {
      if (!open) return;
      const handler = (e: KeyboardEvent) => {
        if (e.key === 'Escape') {
          e.stopPropagation();
          setOpen(false);
          triggerRef.current?.focus();
        }
      };
      document.addEventListener('keydown', handler);
      return () => document.removeEventListener('keydown', handler);
    }, [open]);

    const onPickDate = useCallback(
      (day: number, month: number, year: number) => {
        // Range check (min/max) + past-date check. Cek di sini (bukan cuma
        // di render) supaya parent tidak dapat value di luar range / di
        // masa lalu — defense in depth, jaga-jaga kalau ada bypass via
        // keyboard atau script.
        const candidate: ParsedDate = {
          year,
          month,
          day,
          hour: selHour,
          minute: selMinute,
        };
        if (disablePast && isPastDateTime(candidate, now)) return;
        if (disableFuture && isFutureDateTime(candidate, now)) return;
        if (minParsed && dateTimeCompare(candidate, minParsed) < 0) return;
        if (maxParsed && dateTimeCompare(candidate, maxParsed) > 0) return;
        commitAndClose({ year, month, day });
      },
      [selHour, selMinute, disablePast, disableFuture, minParsed, maxParsed, now, commitAndClose],
    );

    const onPickHour = useCallback(
      (h: number) => {
        const candidate: ParsedDate = {
          year: selYear, month: selMonth, day: selDay,
          hour: h, minute: selMinute,
        };
        if (disablePast && isPastDateTime(candidate, now)) return;
        if (disableFuture && isFutureDateTime(candidate, now)) return;
        if (minParsed && dateTimeCompare(candidate, minParsed) < 0) return;
        if (maxParsed && dateTimeCompare(candidate, maxParsed) > 0) return;
        commitAndClose({ hour: h });
      },
      [selYear, selMonth, selDay, selMinute, disablePast, disableFuture, minParsed, maxParsed, now, commitAndClose],
    );

    const onPickMinute = useCallback(
      (mi: number) => {
        const candidate: ParsedDate = {
          year: selYear, month: selMonth, day: selDay,
          hour: selHour, minute: mi,
        };
        if (disablePast && isPastDateTime(candidate, now)) return;
        if (disableFuture && isFutureDateTime(candidate, now)) return;
        if (minParsed && dateTimeCompare(candidate, minParsed) < 0) return;
        if (maxParsed && dateTimeCompare(candidate, maxParsed) > 0) return;
        commitAndClose({ minute: mi });
      },
      [selYear, selMonth, selDay, selHour, disablePast, disableFuture, minParsed, maxParsed, now, commitAndClose],
    );

    const onClear = useCallback(
      (e: React.MouseEvent) => {
        e.stopPropagation();
        onChange('');
        setOpen(false);
      },
      [onChange],
    );

    const onToday = useCallback(() => {
      // Compose today + current draft hour/minute — supaya pilihan jam
      // user tidak hilang cuma karena klik "Hari ini".
      commitAndClose({
        year: todayYMD.year,
        month: todayYMD.month,
        day: todayYMD.day,
      });
    }, [todayYMD, commitAndClose]);

    const displayText = formatDisplay(value, mode);
    const showPlaceholder = !displayText;

    // Apakah tanggal yang sedang dipilih = hari ini? Dipakai untuk
    // conditional logic time picker (hanya disable jam/menit kalau today).
    const selectedIsToday = useMemo(
      () => isSameYMD(new Date(selYear, selMonth - 1, selDay), todayYMD),
      [selYear, selMonth, selDay, todayYMD],
    );

    const calendarDays = useMemo(
      () => buildCalendarDays(viewYear, viewMonth),
      [viewYear, viewMonth],
    );

    // Hour/minute options
    const hourOptions = useMemo(
      () => Array.from({ length: 24 }, (_, i) => i),
      [],
    );
    const minuteOptions = useMemo(() => {
      const arr: number[] = [];
      for (let i = 0; i < 60; i += minuteStep) arr.push(i);
      // Pastikan menit 0 dan 59 tetap tersedia kalau minuteStep pembagi 60.
      if (minuteStep > 1 && arr[arr.length - 1] !== 59) arr.push(59);
      return arr;
    }, [minuteStep]);

    // Rentang tahun di dropdown header. Range ±yearRange dari viewYear,
    // supaya navigasi tahun terasa mulus (kalau user buka tahun 2010,
    // dia lihat 2000-2020 di dropdown, bukan range fixed yang harus di-klik
    // berulang kali).
    const yearOptions = useMemo(() => {
      const arr: number[] = [];
      for (let y = viewYear - yearRange; y <= viewYear + yearRange; y++) arr.push(y);
      return arr;
    }, [viewYear, yearRange]);

    return (
      <div
        ref={(node) => {
          // Merge forwardRef + internal ref
          (containerRef as React.MutableRefObject<HTMLDivElement | null>).current = node;
          if (typeof ref === 'function') ref(node);
          else if (ref) (ref as React.MutableRefObject<HTMLDivElement | null>).current = node;
        }}
        className={`relative ${containerClassName}`}
      >
        {/* Trigger — pakai <button> (bukan <input readonly>) supaya:
            - tidak ada native picker popup dari browser
            - keyboard a11y full (Enter/Space buka panel)
            - click target luas */}
        <button
          ref={triggerRef}
          id={inputId}
          type="button"
          disabled={disabled}
          onClick={() => !disabled && setOpen((o) => !o)}
          className={[
            'w-full flex items-center gap-2 rounded-md border bg-white py-2 text-sm transition',
            'focus:outline-none focus:ring-2 focus:ring-primary-200',
            // open ? primary : slate
            open
              ? 'border-primary-500 ring-2 ring-primary-200'
              : 'border-slate-300 hover:border-slate-400',
            // padding: kiri extra kalau ada icon, kanan extra kalau clearable+value
            showIcon ? 'pl-8' : 'pl-3',
            clearable && value && !disabled ? 'pr-8' : 'pr-3',
            disabled ? 'cursor-not-allowed bg-slate-100 text-slate-500' : 'text-slate-900',
            className,
          ].join(' ')}
          aria-haspopup="dialog"
          aria-expanded={open}
          {...(rest as Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, 'value' | 'onChange'>)}
        >
          {showIcon && (
            <Calendar
              size={14}
              className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400"
              aria-hidden
            />
          )}
          <span className={`flex-1 truncate text-left ${showPlaceholder ? 'text-slate-400' : ''}`}>
            {displayText || placeholder || 'Pilih tanggal'}
          </span>
        </button>

        {clearable && value && !disabled && (
          <button
            type="button"
            onClick={onClear}
            tabIndex={-1}
            aria-label="Kosongkan"
            className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-0.5 text-slate-400 transition hover:bg-slate-100 hover:text-slate-700"
          >
            <X size={14} />
          </button>
        )}

        <AnimatePresence>
          {open && !disabled && (
            <motion.div
              initial={{ opacity: 0, y: -4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -4 }}
              transition={{ duration: 0.12 }}
              role="dialog"
              aria-label="Pilih tanggal dan waktu"
              className="absolute left-0 top-full z-50 mt-1 w-72 rounded-lg border border-slate-200 bg-white p-3 shadow-xl"
              // stopPropagation supaya click di dalam panel tidak trigger
              // document mousedown handler (yang nutup panel kalau click outside)
              onMouseDown={(e) => e.stopPropagation()}
            >
              {/* Header: navigasi bulan + dropdown tahun untuk loncat cepat */}
              <div className="mb-2 flex items-center justify-between gap-1">
                <button
                  type="button"
                  onClick={() => navMonth(-1)}
                  className="rounded p-1 text-slate-600 transition hover:bg-slate-100 hover:text-slate-900"
                  aria-label="Bulan sebelumnya"
                >
                  <ChevronLeft size={16} />
                </button>
                <div className="flex items-center gap-1">
                  <select
                    value={viewYear}
                    onChange={(e) => setViewYear(parseInt(e.target.value, 10))}
                    className="rounded border border-slate-200 bg-white px-1.5 py-1 text-xs font-semibold text-slate-900 focus:outline-none focus:ring-2 focus:ring-primary-200"
                    aria-label="Pilih tahun"
                  >
                    {yearOptions.map((y) => (
                      <option key={y} value={y}>
                        {y}
                      </option>
                    ))}
                  </select>
                  <div className="text-sm font-semibold text-slate-900">
                    {MONTHS_ID[viewMonth - 1]}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => navMonth(1)}
                  className="rounded p-1 text-slate-600 transition hover:bg-slate-100 hover:text-slate-900"
                  aria-label="Bulan berikutnya"
                >
                  <ChevronRight size={16} />
                </button>
              </div>

              {/* Header hari (Sen, Sel, ...) */}
              <div className="mb-1 grid grid-cols-7 gap-1">
                {DAYS_ID.map((d) => (
                  <div
                    key={d}
                    className="py-1 text-center text-[10px] font-semibold uppercase tracking-wider text-slate-500"
                  >
                    {d}
                  </div>
                ))}
              </div>

              {/* Grid tanggal */}
              <div className="grid grid-cols-7 gap-1">
                {calendarDays.map(({ date, inMonth }, i) => {
                  const isToday = isSameYMD(date, todayYMD);
                  const isSelected =
                    parsed != null &&
                    date.getDate() === parsed.day &&
                    date.getMonth() + 1 === parsed.month &&
                    date.getFullYear() === parsed.year;
                  // Disable kalau: (a) tanggal sudah lewat (jika disablePast),
                  // (b) tanggal di masa depan (jika disableFuture),
                  // (c) di luar min/max range.
                  const past = disablePast && isPastDateOnly(date, now);
                  const future = disableFuture && isFutureDateOnly(date, now);
                  const outOfRange = isDateOutOfRange(date, minParsed, maxParsed);
                  const isDisabled = past || future || outOfRange;

                  return (
                    <button
                      type="button"
                      key={i}
                      onClick={() => onPickDate(date.getDate(), date.getMonth() + 1, date.getFullYear())}
                      disabled={isDisabled}
                      tabIndex={isDisabled ? -1 : 0}
                      title={
                        past
                          ? 'Tanggal sudah lewat'
                          : future
                            ? 'Tanggal belum waktunya'
                            : outOfRange
                              ? 'Di luar rentang yang diizinkan'
                              : undefined
                      }
                      className={[
                        'aspect-square rounded text-xs transition',
                        inMonth ? 'text-slate-900' : 'text-slate-300',
                        isSelected
                          ? 'bg-primary-500 font-bold text-white hover:bg-primary-600'
                          : isToday
                            ? 'border border-primary-500 font-semibold text-primary-700 hover:bg-primary-50'
                            : inMonth
                              ? 'hover:bg-slate-100'
                              : 'hover:bg-slate-50',
                        isDisabled && 'cursor-not-allowed opacity-40 hover:bg-transparent',
                      ]
                        .filter(Boolean)
                        .join(' ')}
                      aria-label={date.toLocaleDateString('id-ID', {
                        day: 'numeric',
                        month: 'long',
                        year: 'numeric',
                      })}
                      aria-pressed={isSelected}
                    >
                      {date.getDate()}
                    </button>
                  );
                })}
              </div>

              {/* Time picker — hanya di mode datetime */}
              {mode === 'datetime' && (
                <div className="mt-3 border-t border-slate-200 pt-3">
                  <div className="mb-2 flex items-center justify-between">
                    <div className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">
                      Waktu
                    </div>
                    {selectedIsToday && (
                      <div className="text-[10px] text-slate-500">
                        Sekarang: {pad2(now.getHours())}:{pad2(now.getMinutes())}
                      </div>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    <select
                      value={pad2(selHour)}
                      onChange={(e) => onPickHour(parseInt(e.target.value, 10))}
                      className="flex-1 rounded-md border border-slate-300 bg-white px-2 py-1.5 text-sm transition focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-200"
                      aria-label="Jam"
                    >
                      {hourOptions.map((h) => {
                        const past = isPastHour(h, selYear, selMonth, selDay, now);
                        return (
                          <option key={h} value={pad2(h)} disabled={past}>
                            {pad2(h)}
                          </option>
                        );
                      })}
                    </select>
                    <span className="text-base font-semibold text-slate-400">:</span>
                    <select
                      value={pad2(selMinute)}
                      onChange={(e) => onPickMinute(parseInt(e.target.value, 10))}
                      className="flex-1 rounded-md border border-slate-300 bg-white px-2 py-1.5 text-sm transition focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-200"
                      aria-label="Menit"
                    >
                      {minuteOptions.map((m) => {
                        const past = isPastMinute(
                          m,
                          selYear, selMonth, selDay, selHour, now,
                        );
                        return (
                          <option key={m} value={pad2(m)} disabled={past}>
                            {pad2(m)}
                          </option>
                        );
                      })}
                    </select>
                  </div>
                </div>
              )}

              {/* Footer: shortcut + tutup */}
              <div className="mt-3 flex items-center justify-between border-t border-slate-200 pt-3">
                <button
                  type="button"
                  onClick={onToday}
                  className="text-xs font-medium text-primary-600 transition hover:text-primary-700"
                >
                  Hari ini
                </button>
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  className="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 transition hover:bg-slate-50"
                >
                  Tutup
                </button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    );
  },
);

// ─────────────────────────────────────────────────────────────────────────
// Comparison helpers (untuk min/max range check + past-time check)
// ─────────────────────────────────────────────────────────────────────────

function dateCompare(a: ParsedDate, b: ParsedDate): number {
  if (a.year !== b.year) return a.year - b.year;
  if (a.month !== b.month) return a.month - b.month;
  return a.day - b.day;
}

function dateTimeCompare(a: ParsedDate, b: ParsedDate): number {
  const c = dateCompare(a, b);
  if (c !== 0) return c;
  if (a.hour !== b.hour) return a.hour - b.hour;
  return a.minute - b.minute;
}

/**
 * Apakah `date` (YMD) lebih awal dari hari ini (YMD `now`)?
 * Pakai ini untuk disable tanggal sebelum hari ini di calendar grid.
 * Perbandingan date-only — jam tidak relevan untuk granularity tanggal.
 */
function isPastDateOnly(date: Date, now: Date): boolean {
  const todayYMD: ParsedDate = {
    year: now.getFullYear(),
    month: now.getMonth() + 1,
    day: now.getDate(),
    hour: 0,
    minute: 0,
  };
  const dateYMD: ParsedDate = {
    year: date.getFullYear(),
    month: date.getMonth() + 1,
    day: date.getDate(),
    hour: 0,
    minute: 0,
  };
  return dateCompare(dateYMD, todayYMD) < 0;
}

/**
 * Apakah `date` (YMD) lebih akhir dari hari ini (YMD `now`)?
 * Simetris dengan `isPastDateOnly` — dipakai saat `disableFuture` aktif
 * (mis. untuk tanggal lahir siswa).
 */
function isFutureDateOnly(date: Date, now: Date): boolean {
  const todayYMD: ParsedDate = {
    year: now.getFullYear(),
    month: now.getMonth() + 1,
    day: now.getDate(),
    hour: 0,
    minute: 0,
  };
  const dateYMD: ParsedDate = {
    year: date.getFullYear(),
    month: date.getMonth() + 1,
    day: date.getDate(),
    hour: 0,
    minute: 0,
  };
  return dateCompare(dateYMD, todayYMD) > 0;
}

/**
 * Apakah `date` di luar rentang min/max yang diizinkan (date-only)?
 */
function isDateOutOfRange(
  date: Date,
  min: ParsedDate | null,
  max: ParsedDate | null,
): boolean {
  const cand: ParsedDate = {
    year: date.getFullYear(),
    month: date.getMonth() + 1,
    day: date.getDate(),
    hour: 0,
    minute: 0,
  };
  if (min && dateCompare(cand, { ...min, hour: 0, minute: 0 }) < 0) return true;
  if (max && dateCompare(cand, { ...max, hour: 0, minute: 0 }) > 0) return true;
  return false;
}

/**
 * Apakah hour `h` sudah lewat, khusus kalau tanggal yang dipilih = hari ini?
 * - Kalau tanggal pilih > today: tidak pernah disable (return false).
 * - Kalau tanggal pilih < today: return true (konsisten dengan past-date check,
 *   meski di calendar grid tanggal tsb sudah di-disable duluan).
 * - Kalau tanggal pilih == today: disable kalau h < currentHour.
 */
function isPastHour(
  h: number,
  selYear: number,
  selMonth: number,
  selDay: number,
  now: Date,
): boolean {
  const selected: ParsedDate = {
    year: selYear, month: selMonth, day: selDay, hour: 0, minute: 0,
  };
  const today: ParsedDate = {
    year: now.getFullYear(),
    month: now.getMonth() + 1,
    day: now.getDate(),
    hour: 0, minute: 0,
  };
  const cmp = dateCompare(selected, today);
  if (cmp < 0) return true;
  if (cmp > 0) return false;
  return h < now.getHours();
}

/**
 * Apakah minute `m` sudah lewat?
 * - Hanya relevan kalau tanggal == today AND hour == currentHour.
 * - Kalau tanggal > today atau hour > currentHour: return false.
 * - Kalau tanggal < today atau hour < currentHour: return true.
 */
function isPastMinute(
  m: number,
  selYear: number,
  selMonth: number,
  selDay: number,
  selHour: number,
  now: Date,
): boolean {
  const currentHour = now.getHours();
  const currentMinute = now.getMinutes();

  if (selYear < now.getFullYear()) return true;
  if (selYear > now.getFullYear()) return false;
  if (selMonth < now.getMonth() + 1) return true;
  if (selMonth > now.getMonth() + 1) return false;
  if (selDay < now.getDate()) return true;
  if (selDay > now.getDate()) return false;

  // Same date
  if (selHour < currentHour) return true;
  if (selHour > currentHour) return false;
  // Same hour
  return m < currentMinute;
}

/**
 * Apakah ParsedDate `p` secara lengkap (YMD + HM) ada di masa lalu
 * relatif terhadap `now`? Dipakai di commit-time check untuk tolak
 * value yang sudah lewat meskipun user somehow bisa bypass disabled
 * state di UI (mis. via keyboard script).
 */
function isPastDateTime(p: ParsedDate, now: Date): boolean {
  const nowP: ParsedDate = {
    year: now.getFullYear(),
    month: now.getMonth() + 1,
    day: now.getDate(),
    hour: now.getHours(),
    minute: now.getMinutes(),
  };
  return dateTimeCompare(p, nowP) < 0;
}

/**
 * Simetris dengan `isPastDateTime` — cek apakah `p` ada di masa depan.
 * Dipakai saat `disableFuture` aktif.
 */
function isFutureDateTime(p: ParsedDate, now: Date): boolean {
  const nowP: ParsedDate = {
    year: now.getFullYear(),
    month: now.getMonth() + 1,
    day: now.getDate(),
    hour: now.getHours(),
    minute: now.getMinutes(),
  };
  return dateTimeCompare(p, nowP) > 0;
}
