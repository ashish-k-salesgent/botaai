import { createContext, useContext, useEffect, useState } from "react";
import api, { setToken, getToken } from "./api";
import { ensureUserPermissions } from "./permissions";

const AuthCtx = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [tenant, setTenant] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const t = getToken();
    if (!t) {
      setLoading(false);
      return;
    }
    api
      .get("/auth/me")
      .then((r) => {
        setUser(ensureUserPermissions(r.data.user));
        setTenant(r.data.tenant);
      })
      .catch(() => {
        setToken(null);
      })
      .finally(() => setLoading(false));
  }, []);

  const login = async (email, password) => {
    const r = await api.post("/auth/login", { email, password });
    setToken(r.data.token);
    const user = ensureUserPermissions(r.data.user);
    setUser(user);
    setTenant(r.data.tenant);
    return { ...r.data, user };
  };

  const signup = async (data) => {
    const r = await api.post("/auth/signup", data);
    setToken(r.data.token);
    const user = ensureUserPermissions(r.data.user);
    setUser(user);
    setTenant(r.data.tenant);
    return { ...r.data, user };
  };

  const logout = () => {
    setToken(null);
    setUser(null);
    setTenant(null);
    window.location.href = "/";
  };

  const refreshUser = async () => {
    const r = await api.get("/auth/me");
    setUser(ensureUserPermissions(r.data.user));
    setTenant(r.data.tenant);
    return r.data;
  };

  return (
    <AuthCtx.Provider value={{ user, tenant, loading, login, signup, logout, setTenant, refreshUser }}>
      {children}
    </AuthCtx.Provider>
  );
}

export const useAuth = () => useContext(AuthCtx);
