import { createContext, useContext, useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import type { AuthUser } from '../api/auth';

const TIMEOUT_MS = 30 * 60 * 1000;

function clearSession() {
  localStorage.removeItem('token');
  localStorage.removeItem('user');
  localStorage.removeItem('lastActivity');
}

interface AuthContextType {
  user: AuthUser | null;
  token: string | null;
  setUser: (user: AuthUser | null) => void;
  setToken: (token: string | null) => void;
  logout: () => void;
}

const AuthContext = createContext<AuthContextType | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [token, setTokenState] = useState<string | null>(() => {
    const stored = localStorage.getItem('token');
    if (!stored) return null;
    const lastActivity = localStorage.getItem('lastActivity');
    if (!lastActivity || Date.now() - parseInt(lastActivity) > TIMEOUT_MS) {
      clearSession();
      return null;
    }
    return stored;
  });

  const [user, setUserState] = useState<AuthUser | null>(() => {
    if (!localStorage.getItem('token')) return null;
    const stored = localStorage.getItem('user');
    return stored ? JSON.parse(stored) : null;
  });

  function setUser(u: AuthUser | null) {
    setUserState(u);
    if (u) localStorage.setItem('user', JSON.stringify(u));
    else localStorage.removeItem('user');
  }

  function setToken(t: string | null) {
    setTokenState(t);
    if (t) {
      localStorage.setItem('token', t);
      localStorage.setItem('lastActivity', Date.now().toString());
    } else {
      clearSession();
    }
  }

  function logout() {
    setUserState(null);
    setTokenState(null);
    clearSession();
  }

  useEffect(() => {
    if (!token) return;

    let timer: ReturnType<typeof setTimeout>;

    function resetTimer() {
      clearTimeout(timer);
      localStorage.setItem('lastActivity', Date.now().toString());
      timer = setTimeout(() => {
        logout();
        window.location.href = '/login';
      }, TIMEOUT_MS);
    }

    const events = ['mousemove', 'keydown', 'click', 'scroll', 'touchstart'];
    events.forEach(e => window.addEventListener(e, resetTimer));
    resetTimer();

    return () => {
      clearTimeout(timer);
      events.forEach(e => window.removeEventListener(e, resetTimer));
    };
  }, [token]);

  return (
    <AuthContext.Provider value={{ user, token, setUser, setToken, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
