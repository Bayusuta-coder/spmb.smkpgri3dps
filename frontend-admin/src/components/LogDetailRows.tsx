import { Check, Minus, Plus } from 'lucide-react';
import type { ReactNode } from 'react';
import type { LogRow } from '../lib/logFormatter';

/**
 * Render list of `LogRow` (output dari `formatLogDetail`) jadi markup
 * human-readable:
 *
 *   ┌─ KV row:    "Nama: Gelombang 1 - Test 2026"
 *   │             (label muted-kecil, value bold-medium)
 *   │
 *   ├─ Heading:   "── KUOTA PER JURUSAN ──"
 *   │             (uppercase, gray, dashed divider)
 *   │
 *   ├─ List:      [KULINER · 100 siswa] [TKJ · 50 siswa] …
 *   │             (pill/chip style — bukan bullet list)
 *   │
 *   └─ Diff:      "Field: [lama] → [baru]"
 *                 (lama: red strikethrough, baru: emerald bg)
 *
 * Typography:
 *   - Label: text-[11px] font-medium text-slate-500 uppercase tracking-wider
 *   - Value: text-xs font-medium text-slate-900
 *   - Diff before/after: rounded px-1.5 py-0.5
 *   - Pills: rounded-full px-2.5 py-0.5
 */
export default function LogDetailRows({ rows }: { rows: LogRow[] }) {
  if (rows.length === 0) {
    return <span className="text-xs text-slate-400">(tidak ada detail)</span>;
  }
  return (
    <div className="space-y-2 text-xs">
      {rows.map((r, i) => {
        if (r.kind === 'heading') {
          return (
            <div
              key={i}
              className="mt-2 flex items-center gap-2 border-t border-dashed border-slate-100 pt-2 text-[10px] font-semibold uppercase tracking-wider text-slate-500 first:mt-0 first:border-t-0 first:pt-0"
            >
              <span className="shrink-0">{r.label}</span>
              <span className="h-px flex-1 bg-slate-100" />
            </div>
          );
        }

        if (r.kind === 'list') {
          return (
            <div key={i} className="space-y-1.5">
              {r.label && (
                <div className="text-[11px] font-medium uppercase tracking-wider text-slate-500">
                  {r.label}
                </div>
              )}
              <ul className="flex flex-wrap gap-1.5">
                {r.items.map((it, j) => (
                  <ListPill key={j} tone={r.tone ?? 'neutral'}>
                    {it}
                  </ListPill>
                ))}
              </ul>
            </div>
          );
        }

        if (r.kind === 'diff') {
          return (
            <div key={i} className="flex flex-wrap items-baseline gap-1.5">
              <span className="text-[11px] font-medium uppercase tracking-wider text-slate-500">
                {r.label}
              </span>
              <span className="rounded bg-red-50 px-1.5 py-0.5 text-[11px] text-red-700 line-through decoration-red-300">
                {r.before}
              </span>
              <span className="text-slate-400">→</span>
              <span className="rounded bg-emerald-50 px-1.5 py-0.5 text-[11px] font-medium text-emerald-700">
                {r.after}
              </span>
            </div>
          );
        }

        // kind: 'kv'
        return (
          <div
            key={i}
            className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5"
          >
            <span className="shrink-0 text-[11px] font-medium uppercase tracking-wider text-slate-500">
              {r.label}
            </span>
            <span className="text-xs font-medium text-slate-900">{r.value}</span>
          </div>
        );
      })}
    </div>
  );
}

/**
 * Single list pill — colored sesuai tone:
 *   - added:     emerald-50 bg, emerald-700 text, + icon
 *   - removed:   red-50 bg, red-700 text, − icon
 *   - neutral:   slate-100 bg, slate-700 text, • dot
 */
function ListPill({
  tone,
  children,
}: {
  tone: 'added' | 'removed' | 'neutral';
  children: ReactNode;
}) {
  const cls =
    tone === 'added'
      ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
      : tone === 'removed'
        ? 'border-red-200 bg-red-50 text-red-700'
        : 'border-slate-200 bg-slate-100 text-slate-700';

  const Icon =
    tone === 'added' ? Plus : tone === 'removed' ? Minus : Check;

  return (
    <li
      className={`inline-flex list-none items-center gap-1 rounded-full border px-2.5 py-0.5 text-[11px] font-medium ${cls}`}
    >
      <Icon size={9} className="shrink-0" />
      <span>{children}</span>
    </li>
  );
}