/**
 * Axios instance for the CEMS API. Follows backend/README.md:
 *  - sends the Bearer token on every request,
 *  - swaps in the renewed token from the X-Access-Token header (30-min inactivity timeout),
 *  - on 401 SESSION_EXPIRED / SESSION_REVOKED / INVALID_TOKEN, clears the token and goes to /login.
 */
import axios from 'axios';

export const TOKEN_KEY = 'token';
export const FLASH_KEY = 'cems_flash';

const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL || 'http://localhost:4000/api/v1',
  timeout: 20000,
});

api.interceptors.request.use((config) => {
  const token = localStorage.getItem(TOKEN_KEY);
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

const SESSION_CODES = ['SESSION_EXPIRED', 'SESSION_REVOKED', 'INVALID_TOKEN'];

api.interceptors.response.use(
  (response) => {
    const renewed = response.headers['x-access-token'];
    if (renewed) localStorage.setItem(TOKEN_KEY, renewed);
    return response;
  },
  (error) => {
    const code = error.response?.data?.error?.code;
    if (error.response?.status === 401 && SESSION_CODES.includes(code)) {
      localStorage.removeItem(TOKEN_KEY);
      sessionStorage.setItem(FLASH_KEY, error.response.data.error.message);
      if (window.location.pathname !== '/login') window.location.assign('/login');
    }
    return Promise.reject(error);
  },
);

/** Returns `response.data.data` (the payload) from an Axios response. */
export const unwrap = (response) => response.data.data;

/** Returns the pagination meta of a list response. */
export const metaOf = (response) => response.data.meta;

/** A message that is safe to show a person, for any kind of failure. */
export function errorMessage(error, fallback = 'Something went wrong. Please try again.') {
  if (error.code === 'ECONNABORTED') return 'The server took too long to answer. Please try again.';
  if (!error.response) return 'Cannot reach the server. Check your connection and try again.';
  return error.response.data?.error?.message || fallback;
}

export const errorCode = (error) => error.response?.data?.error?.code;

/** Backend validation details -> { fieldName: message } for showing next to inputs. */
export function fieldErrors(error) {
  const details = error.response?.data?.error?.details;
  if (!Array.isArray(details)) return {};
  return Object.fromEntries(details.map((d) => [d.field, d.message]));
}

/** Downloads a PDF (or any file) that needs the Bearer token. */
export async function downloadFile(path, params, filename) {
  const res = await api.get(path, { params, responseType: 'blob' });
  const url = URL.createObjectURL(res.data);
  Object.assign(document.createElement('a'), { href: url, download: filename }).click();
  URL.revokeObjectURL(url);
}

export default api;
