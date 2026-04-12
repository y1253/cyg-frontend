const API = '/api';

export interface AuthUser {
  id: number;
  name: string;
  email: string;
  role: 'ADMIN' | 'EMPLOYEE';
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
