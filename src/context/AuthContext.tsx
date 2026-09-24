import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
} from 'react';
import type { ReactNode } from 'react';
import type { AuthUser } from '../api/auth';
import { clearPresence } from '../api/phone';

// How long the app sits idle before signing the user out. Read in two places
// that must agree: the live idle timer below, and the cold-start check against
// `lastActivity`, which is what makes the timeout survive a reload or a closed
// tab rather than resetting every time the page loads.
const TIMEOUT_MS = 60 * 60 * 1000;

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

  /**
   * ⚠️ `useCallback` over `token`, because `clearPresence` made this CAPTURE it.
   *
   * The idle timer below calls `logout()` from inside an effect keyed on `token`. While
   * this function closed over nothing reactive, leaving it out of that effect's deps was
   * sound; reading `token` makes a stale closure a real possibility, and it is the token
   * that authorises the sign-out request. Identity changes exactly when `token` does, so
   * the effect gains no extra runs.
   */
  const logout = useCallback(function logout() {
    /**
     * Tell the server BEFORE the token is cleared — it is the credential the route needs.
     *
     * Stopping the 20s heartbeat is not the same as going away: the ring window keeps an
     * entry for five minutes on purpose, so a BACKGROUNDED tab does not read as "gone
     * home". Without this, somebody who signed out went on being dialled on their personal
     * mobile for the rest of that window — and, since the in-hours voicemail fix, went on
     * keeping customers out of voicemail too.
     *
     * Fire-and-forget with `keepalive`: the idle-timeout caller navigates away immediately
     * afterwards, and signing out must never be blocked by a phone route.
     */
    if (token) clearPresence(token);
    setUserState(null);
    setTokenState(null);
    clearSession();
  }, [token]);

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
  }, [token, logout]);

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
