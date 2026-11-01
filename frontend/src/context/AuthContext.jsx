import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import api, { TOKEN_KEY, unwrap } from '../lib/api';

const AuthContext = createContext(null);
export const useAuth = () => useContext(AuthContext);

/** Where each role lands after logging in. */
export const homeFor = (user) =>
  user?.role === 'admin' ? '/admin' : user?.role === 'organizer' ? '/organizer' : '/';

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(Boolean(localStorage.getItem(TOKEN_KEY)));

  // Restore the session from the stored token.
  useEffect(() => {
    if (!localStorage.getItem(TOKEN_KEY)) return;
    api
      .get('/auth/me')
      .then((res) => setUser(unwrap(res).user))
      .catch(() => localStorage.removeItem(TOKEN_KEY))
      .finally(() => setLoading(false));
  }, []);

  const finishLogin = useCallback((data) => {
    localStorage.setItem(TOKEN_KEY, data.token);
    setUser(data.user);
    return data.user;
  }, []);

  /** Returns { twoFactorRequired: true, ... } for admins, or the user for everyone else. */
  const login = useCallback(
    async (email, password) => {
      const data = unwrap(await api.post('/auth/login', { email, password }));
      return data.twoFactorRequired ? data : finishLogin(data);
    },
    [finishLogin],
  );

  const verifyTwoFactor = useCallback(
    async (twoFactorToken, code) =>
      finishLogin(unwrap(await api.post('/auth/2fa/verify', { twoFactorToken, code }))),
    [finishLogin],
  );

  const register = useCallback(
    async (body) => finishLogin(unwrap(await api.post('/auth/register', body))),
    [finishLogin],
  );

  const logout = useCallback(async () => {
    try {
      await api.post('/auth/logout');
    } catch {
      /* the token is dropped locally either way */
    }
    localStorage.removeItem(TOKEN_KEY);
    setUser(null);
  }, []);

  const value = useMemo(
    () => ({ user, loading, login, verifyTwoFactor, register, logout }),
    [user, loading, login, verifyTwoFactor, register, logout],
  );
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
