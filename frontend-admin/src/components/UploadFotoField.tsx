import { useState, useRef } from 'react';
import { toast } from 'sonner';
import { Upload, X } from 'lucide-react';
import { api, fotoUrl } from '../lib/api';

/**
 * Field upload foto seragam — dipakai oleh halaman Berita & Pengumuman.
 *
 * Props:
 *  - value: relativePath saat ini (mis. "berita/abc.png") atau ''
 *  - onChange: dipanggil saat value berubah (path relatif)
 *  - folder: target folder di backend ("berita" | "pengumuman")
 *  - label: label di atas field
 */
export default function UploadFotoField({
  value,
  onChange,
  folder,
  label = 'Foto',
}: {
  value: string;
  onChange: (relativePath: string) => void;
  folder: 'berita' | 'pengumuman';
  label?: string;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [previewLocal, setPreviewLocal] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);

  const onPick = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) {
      toast.error('Ukuran file maksimal 5 MB');
      return;
    }
    if (!/^image\//.test(file.type)) {
      toast.error('File harus berupa gambar');
      return;
    }
    setUploading(true);
    setPreviewLocal(URL.createObjectURL(file));
    try {
      const fd = new FormData();
      fd.append('file', file);
      const res = await api.post(`/upload?folder=${folder}`, fd, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      onChange(res.data.relativePath);
      toast.success('Foto terupload');
    } catch (err: any) {
      toast.error(err.message || 'Upload gagal');
      setPreviewLocal(null);
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = '';
    }
  };

  const onRemove = () => {
    onChange('');
    setPreviewLocal(null);
  };

  const preview = previewLocal || (value ? fotoUrl(value) : '');

  return (
    <div>
      <label className="label">{label}</label>
      <div className="flex items-start gap-3">
        <div className="relative aspect-square w-40 overflow-hidden rounded-lg border border-slate-200 bg-slate-50">
          {preview ? (
            <img src={preview} alt="preview" className="h-full w-full object-cover" />
          ) : (
            <div className="flex h-full w-full items-center justify-center text-xs text-slate-400">
              Belum ada foto
            </div>
          )}
          {uploading && (
            <div className="absolute inset-0 flex items-center justify-center bg-black/40 text-xs font-medium text-white">
              Mengupload…
            </div>
          )}
        </div>
        <div className="flex flex-col gap-2">
          <input
            ref={inputRef}
            type="file"
            accept="image/jpeg,image/png,image/webp,image/gif"
            onChange={onPick}
            disabled={uploading}
            className="hidden"
            id={`upload-${folder}`}
          />
          <label htmlFor={`upload-${folder}`} className="btn-primary cursor-pointer">
            <Upload size={14} />
            {value ? 'Ganti Foto' : 'Pilih Foto'}
          </label>
          {value && (
            <button type="button" onClick={onRemove} className="btn-ghost text-red-600">
              <X size={14} /> Hapus
            </button>
          )}
          <p className="text-[11px] text-slate-500">JPEG/PNG/WebP/GIF · maks 5 MB</p>
        </div>
      </div>
    </div>
  );
}
