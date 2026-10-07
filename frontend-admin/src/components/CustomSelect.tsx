import { SelectHTMLAttributes, forwardRef } from 'react';
import { ChevronDown } from 'lucide-react';

/**
 * Reusable Select wrapper (F2) untuk konsistensi styling di seluruh admin.
 *
 * Spec dari brief:
 *   - border-radius kecil (rounded-md, lebih kecil dari .input rounded-lg)
 *   - box-shadow tipis (focus ring)
 *   - spacing/margin ke wrapper induknya (jangan mepet — handled via className
 *     wrapper di caller, bukan di komponen ini)
 *
 * Tetap membungkus native <select> supaya:
 *   - Aksesibilitas penuh (keyboard nav, screen reader, mobile picker)
 *   - Zero deps tambahan (tidak butuh Radix/HUIS/shadcn)
 *   - Bundle size tetap kecil
 *
 * Styling override:
 *   - `appearance-none` + chevron icon custom di kanan
 *   - Padding-right extra untuk ruang icon
 *
 * Props: extend semua native <select> attributes (value, onChange, disabled,
 * required, dll). value default ke '' (string), bukan null/undefined, supaya
 * React controlled-component tidak warning.
 */
export interface CustomSelectProps
  extends SelectHTMLAttributes<HTMLSelectElement> {
  /** Placeholder-style option value (biasanya ''). */
  placeholder?: string;
  /** Extra className untuk container wrapper (mis. margin-bottom). */
  containerClassName?: string;
  /** Tampilkan icon chevron di kanan (default: true). */
  chevron?: boolean;
}

export const CustomSelect = forwardRef<HTMLSelectElement, CustomSelectProps>(
  function CustomSelect(
    {
      className = '',
      containerClassName = '',
      chevron = true,
      disabled,
      children,
      ...rest
    },
    ref,
  ) {
    return (
      <div className={`relative ${containerClassName}`}>
        <select
          ref={ref}
          disabled={disabled}
          className={[
            // Ukuran & shape — sedikit lebih kecil dari .input rounded-lg
            'w-full rounded-md border border-slate-300 bg-white py-2 pl-3 text-sm text-slate-900',
            'transition placeholder:text-slate-400',
            'focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-200',
            'disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-500',
            // Spacing untuk chevron icon di kanan
            chevron ? 'pr-9' : 'pr-3',
            className,
          ].join(' ')}
          {...rest}
        >
          {children}
        </select>
        {chevron && (
          <ChevronDown
            size={16}
            className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400"
            aria-hidden
          />
        )}
      </div>
    );
  },
);
