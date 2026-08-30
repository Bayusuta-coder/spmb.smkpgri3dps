import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from 'react';

/**
 * Reusable IconButton untuk tabel aksi.
 *
 * Standarisasi icon button di seluruh frontend-admin supaya kolom AKSI
 * konsisten: ukuran 32x32, rounded, hover bg sesuai tone warna (emerald,
 * amber, blue, rose, slate, primary), tooltip via `title` attr.
 *
 * Ukuran icon default 16px — cukup jelas di tabel, tidak menyaingi teks.
 *
 * Tone color mapping:
 *   - primary  → biru primary (default untuk Edit)
 *   - emerald  → hijau (Verify, Approve, Success)
 *   - amber    → oranye (Toggle/Deactivate, warning)
 *   - blue     → biru tua (Reset Password)
 *   - rose     → merah (Hapus/Delete, danger)
 *   - slate    → abu-abu (Batal/Cancel)
 *
 * @example
 *   <IconButton tone="primary" title="Edit User" onClick={...}>
 *     <Pencil size={16} />
 *   </IconButton>
 */

export type IconButtonTone =
  | 'primary'
  | 'emerald'
  | 'amber'
  | 'blue'
  | 'rose'
  | 'slate';

const TONE_CLASSES: Record<IconButtonTone, string> = {
  primary: 'text-primary-600 hover:bg-primary-50',
  emerald: 'text-emerald-600 hover:bg-emerald-50',
  amber: 'text-amber-600 hover:bg-amber-50',
  blue: 'text-blue-600 hover:bg-blue-50',
  rose: 'text-rose-600 hover:bg-rose-50',
  slate: 'text-slate-500 hover:bg-slate-100',
};

const TONE_DISABLED: Record<IconButtonTone, string> = {
  primary: 'disabled:text-slate-300 disabled:hover:bg-transparent',
  emerald: 'disabled:text-slate-300 disabled:hover:bg-transparent',
  amber: 'disabled:text-slate-300 disabled:hover:bg-transparent',
  blue: 'disabled:text-slate-300 disabled:hover:bg-transparent',
  rose: 'disabled:text-slate-300 disabled:hover:bg-transparent',
  slate: 'disabled:text-slate-300 disabled:hover:bg-transparent',
};

export interface IconButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  tone?: IconButtonTone;
  /** Shortcut untuk `title`. Tooltip akan muncul saat hover. */
  label: string;
  size?: 'sm' | 'md';
  children: ReactNode;
}

const IconButton = forwardRef<HTMLButtonElement, IconButtonProps>(function IconButton(
  {
    tone = 'primary',
    label,
    size = 'md',
    className = '',
    disabled,
    children,
    title,
    ...rest
  },
  ref,
) {
  const sizing = size === 'sm' ? 'h-7 w-7' : 'h-8 w-8';
  return (
    <button
      ref={ref}
      type="button"
      title={title ?? label}
      aria-label={label}
      disabled={disabled}
      className={[
        'inline-flex items-center justify-center rounded-md p-1.5 transition',
        sizing,
        TONE_CLASSES[tone],
        'disabled:cursor-not-allowed',
        TONE_DISABLED[tone],
        className,
      ]
        .filter(Boolean)
        .join(' ')}
      {...rest}
    >
      {children}
    </button>
  );
});

export default IconButton;
