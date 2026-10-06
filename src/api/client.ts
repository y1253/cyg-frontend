const INACTIVITY_KEYS = ['token', 'user', 'lastActivity'];

/** Set when the server says this device's session was ended; read once by the login page. */
const SIGNED_OUT_KEY = 'signedOutNotice';

/**
 * Drop the session and bounce to the login page. Exported for the XHR-based send
 * paths, which can't go through `fetchWithAuth` (they need upload progress) but
 * must still handle an expired token the same way — a long upload is exactly when
 * one is most likely to lapse.
 *
 * `code` is the 401 body's `code`. `SESSION_ENDED` means the server ended this
 * device's session (an admin signed it out, or a login elsewhere took over a session
 * that had gone quiet), and the login page says so rather than appearing from nowhere.
 */
export function handleUnauthorized(code?: string): void {
  INACTIVITY_KEYS.forEach(k => localStorage.removeItem(k));
  if (code === 'SESSION_ENDED') {
    try { sessionStorage.setItem(SIGNED_OUT_KEY, '1'); } catch { /* private mode */ }
  }
  window.location.href = '/login';
}

/** Was this device just signed out by the server? Clears the flag. */
export function takeSignedOutNotice(): boolean {
  try {
    const set = sessionStorage.getItem(SIGNED_OUT_KEY) === '1';
    sessionStorage.removeItem(SIGNED_OUT_KEY);
    return set;
  } catch {
    return false;
  }
}

/** The `code` of a 401 body, without consuming the response the caller will read. */
export async function unauthorizedCode(res: Response): Promise<string | undefined> {
  const body = (await res.clone().json().catch(() => null)) as { code?: unknown } | null;
  return typeof body?.code === 'string' ? body.code : undefined;
}

export async function fetchWithAuth(token: string, url: string, options: RequestInit = {}): Promise<Response> {
  const headers = new Headers(options.headers);
  headers.set('Authorization', `Bearer ${token}`);
  const res = await fetch(url, { ...options, headers });
  if (res.status === 401) handleUnauthorized(await unauthorizedCode(res));
  return res;
}
