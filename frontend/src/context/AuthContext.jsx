import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { tokenStore, setUnauthorizedHandler } from '../api/client.js';
import { loginRequest, signupRequest } from '../api/auth.js';

const AuthContext = createContext(null);
const USER_KEY = 'marketmind_user';

export function AuthProvider({ children }) {
  const [user, setUser] = useState(() => {
    try {
      const raw = localStorage.getItem(USER_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  });
  const [initializing, setInitializing] = useState(true);

  useEffect(() => {
    // If there's no token, ensure we are logged out.
    if (!tokenStore.get()) {
      setUser(null);
      localStorage.removeItem(USER_KEY);
    }
    setInitializing(false);

    setUnauthorizedHandler(() => {
      tokenStore.clear();
      localStorage.removeItem(USER_KEY);
      setUser(null);
    });
  }, []);

  const persist = ({ user: u, token }) => {
    tokenStore.set(token);
    localStorage.setItem(USER_KEY, JSON.stringify(u));
    setUser(u);
  };

  const login = async (credentials) => {
    const result = await loginRequest(credentials);
    persist(result);
    return result;
  };

  const signup = async (credentials) => {
    const result = await signupRequest(credentials);
    persist(result);
    return result;
  };

  const logout = () => {
    tokenStore.clear();
    localStorage.removeItem(USER_KEY);
    setUser(null);
  };

  const value = useMemo(
    () => ({ user, isAuthenticated: Boolean(user), initializing, login, signup, logout }),
    [user, initializing]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export const useAuth = () => {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
};
