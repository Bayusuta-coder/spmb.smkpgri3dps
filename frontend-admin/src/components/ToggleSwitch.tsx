import { ReactNode } from 'react';

/**
 * Toggle switch bulat dengan track biru saat on, abu-abu saat off.
 *
 * DESAIN (Fix #3): knob SELALU di dalam batas track.
 *   - sm: track w-9 (36px) h-5 (20px); knob 16×16; padding dalam track 2px
 *   - md: track w-11 (44px) h-6 (24px); knob 20×20; padding dalam track 2px
 *
 * Posisi knob pakai transform translateX yang dihitung dari lebar track:
 *   - off: translateX(2px)   — knob nempel di kiri, 2px padding dari tepi
 *   - on : translateX(<trackWidth - knobWidth - 4>px) — knob nempel di kanan
 *
 * Dengan cara ini knob TIDAK AKAN overflow keluar track, baik di OFF maupun ON.
 *
 * Props: checked / onChange / disabled / label / id / size / ariaLabel
 */
export interface ToggleSwitchProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  disabled?: boolean;
  label?: ReactNode;
  id?: string;
  size?: 'sm' | 'md';
  ariaLabel?: string;
}

export default function ToggleSwitch({
  checked,
  onChange,
  disabled = false,
  label,
  id,
  size = 'sm',
  ariaLabel,
}: ToggleSwitchProps) {
  const autoId = `toggle-${Math.random().toString(36).slice(2, 9)}`;
  const inputId = id || autoId;

  // Dimensi fix per size (px) — pakai number, bukan Tailwind class, supaya
  // bisa dihitung matematika translateX-nya tanpa ambiguity class merge.
  // sm: track 36×20, knob 16×16, padding 2px → translateX(on) = 36-16-4 = 16px
  // md: track 44×24, knob 20×20, padding 2px → translateX(on) = 44-20-4 = 20px
  const dim = size === 'md'
    ? { trackW: 44, trackH: 24, knob: 20, pad: 2 }
    : { trackW: 36, trackH: 20, knob: 16, pad: 2 };
  const translateOff = dim.pad; // 2px dari kiri
  const translateOn = dim.trackW - dim.knob - dim.pad * 2; // 16 / 20 px ke kanan

  return (
    <label
      className={`inline-flex items-center gap-2 ${
        disabled ? 'cursor-not-allowed opacity-50' : 'cursor-pointer'
      }`}
    >
      <span
        className="relative inline-block"
        style={{ width: dim.trackW, height: dim.trackH }}
      >
        <input
          id={inputId}
          type="checkbox"
          role="switch"
          aria-checked={checked}
          aria-label={ariaLabel}
          className="peer sr-only"
          checked={checked}
          disabled={disabled}
          onChange={(e) => onChange(e.target.checked)}
        />
        {/* Track */}
        <span
          aria-hidden="true"
          className={`absolute inset-0 rounded-full transition-colors duration-150 ${
            checked
              ? disabled
                ? 'bg-primary-300'
                : 'bg-primary-600'
              : 'bg-slate-300'
          } ${
            !disabled &&
            'peer-focus-visible:ring-2 peer-focus-visible:ring-primary-500 peer-focus-visible:ring-offset-2'
          }`}
        />
        {/* Knob (selalu di dalam track) */}
        <span
          aria-hidden="true"
          className="pointer-events-none absolute top-1/2 block rounded-full bg-white shadow-md transition-transform duration-150"
          style={{
            width: dim.knob,
            height: dim.knob,
            transform: `translate(${checked ? translateOn : translateOff}px, -50%)`,
          }}
        />
      </span>
      {label && (
        <span className={`select-none ${disabled ? 'text-slate-400' : 'text-slate-700'}`}>
          {label}
        </span>
      )}
    </label>
  );
}
