import axios from 'axios';

export const API_BASE_URL =
  (import.meta as any).env?.VITE_API_BASE_URL || 'http://localhost:4000/api';

export const getApiBaseUrl = () => API_BASE_URL;

// Origin backend (tanpa /api) — untuk membentuk URL absolut dari path relatif foto
export const API_ORIGIN = API_BASE_URL.replace(/\/api\/?$/, '');

/**
 * Konversi relative path (mis. "berita/abc.jpg") jadi URL absolut.
 * Kalau path sudah URL absolut atau data:, kembalikan apa adanya.
 */
export function fotoUrl(relativePath: string | null | undefined): string {
  if (!relativePath) return '';
  if (/^(https?:|data:)/.test(relativePath)) return relativePath;
  const p = relativePath.replace(/^\/+/, '');
  return `${API_ORIGIN}/uploads/${p}`;
}

export const api = axios.create({
  baseURL: API_BASE_URL,
  timeout: 20_000,
  headers: { 'Content-Type': 'application/json' },
});

api.interceptors.response.use(
  (r) => r,
  (err) => {
    const msg =
      err?.response?.data?.message ||
      err?.message ||
      'Terjadi kesalahan. Coba lagi.';
    return Promise.reject(new Error(Array.isArray(msg) ? msg.join(', ') : msg));
  },
);
