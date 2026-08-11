import axios from 'axios';

export const API_BASE_URL =
  (import.meta as any).env?.VITE_API_BASE_URL || 'http://localhost:4000/api';

// Origin backend (tanpa /api) — dipakai untuk membentuk URL foto dari
// path relatif seperti "berita/abc.jpg" → "http://localhost:4000/uploads/berita/abc.jpg"
export const API_ORIGIN = API_BASE_URL.replace(/\/api\/?$/, '');

/**
 * Konversi relative path (mis. "berita/abc.jpg") jadi URL absolut.
 * Kalau path sudah URL absolut (http/https) atau data:, kembalikan apa adanya.
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

// Inject token dari localStorage
api.interceptors.request.use((config) => {
  const token = localStorage.getItem('spmb_token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

api.interceptors.response.use(
  (r) => r,
  (err) => {
    if (err?.response?.status === 401) {
      localStorage.removeItem('spmb_token');
      // Hard redirect ke login (di luar React Router untuk menghindari race)
      if (!location.pathname.startsWith('/login')) {
        location.href = '/login';
      }
    }
    const msg =
      err?.response?.data?.message ||
      err?.message ||
      'Terjadi kesalahan. Coba lagi.';
    return Promise.reject(new Error(Array.isArray(msg) ? msg.join(', ') : msg));
  },
);
