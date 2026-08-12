const INACTIVITY_KEYS = ['token', 'user', 'lastActivity'];

/**
 * Drop the session and bounce to the login page. Exported for the XHR-based send
 * paths, which can't go through `fetchWithAuth` (they need upload progress) but
 * must still handle an expired token the same way — a long upload is exactly when
 * one is most likely to lapse.
 */
export function handleUnauthorized(): void {
  INACTIVITY_KEYS.forEach(k => localStorage.removeItem(k));
  window.location.href = '/login';
}

export async function fetchWithAuth(token: string, url: string, options: RequestInit = {}): Promise<Response> {
  const headers = new Headers(options.headers);
  headers.set('Authorization', `Bearer ${token}`);
  const res = await fetch(url, { ...options, headers });
  if (res.status === 401) handleUnauthorized();
  return res;
}
