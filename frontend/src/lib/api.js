import axios from "axios";

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL || "http://localhost:8085";
export const API = `${BACKEND_URL}/api`;
export { BACKEND_URL };

const TOKEN_KEY = "botaai_token";

export function getToken() {
  return localStorage.getItem(TOKEN_KEY);
}
export function setToken(t) {
  if (t) localStorage.setItem(TOKEN_KEY, t);
  else localStorage.removeItem(TOKEN_KEY);
}

const api = axios.create({ baseURL: API });
api.interceptors.request.use((cfg) => {
  const t = getToken();
  if (t) cfg.headers.Authorization = `Bearer ${t}`;
  return cfg;
});
api.interceptors.response.use(
  (r) => r,
  (err) => {
    if (err?.response?.status === 401) {
      setToken(null);
      if (!window.location.pathname.startsWith("/login")) {
        window.location.href = "/login";
      }
    }
    if (err?.response?.status === 403) {
      const detail = String(err?.response?.data?.detail || "");
      if (detail.toLowerCase().includes("trial has ended") || detail.toLowerCase().includes("suspended")) {
        setToken(null);
        const reason = detail.toLowerCase().includes("suspended") ? "suspended" : "expired";
        if (!window.location.pathname.startsWith("/login")) {
          window.location.href = `/login?reason=${reason}`;
        }
      }
    }
    return Promise.reject(err);
  }
);

export default api;
