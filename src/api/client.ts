const INACTIVITY_KEYS = ['token', 'user', 'lastActivity'];

export async function fetchWithAuth(token: string, url: string, options: RequestInit = {}): Promise<Response> {
  const headers = new Headers(options.headers);
  headers.set('Authorization', `Bearer ${token}`);
  const res = await fetch(url, { ...options, headers });
  if (res.status === 401) {
    INACTIVITY_KEYS.forEach(k => localStorage.removeItem(k));
    window.location.href = '/login';
  }
  return res;
}
