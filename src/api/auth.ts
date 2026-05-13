const API = '/api';

export interface AuthUser {
  id: number;
  name: string;
  email: string;
  role: 'ADMIN' | 'USER';
}

export interface LoginResponse {
  access_token: string;
  user: AuthUser;
}

export async function login(email: string, password: string): Promise<LoginResponse> {
  const res = await fetch(`${API}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });

  if (!res.ok) {
    throw new Error('Invalid credentials');
  }

  return res.json();
}

export async function faceLogin(email: string, imageBlob: Blob): Promise<LoginResponse> {
  const form = new FormData();
  form.append('email', email);
  form.append('photo', imageBlob, 'capture.jpg');

  const res = await fetch(`${API}/auth/face-login`, {
    method: 'POST',
    body: form,
  });

  if (!res.ok) {
    const body = await res.json().catch(() => ({})) as { message?: string };
    throw new Error(body.message ?? 'Face not recognized');
  }

  return res.json();
}
