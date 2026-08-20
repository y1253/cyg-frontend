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

export interface FaceBox {
  x: number;
  y: number;
  w: number;
  h: number;
}

export async function faceLogin(
  email: string,
  imageBlob: Blob,
  /**
   * The face rectangle the browser's detector already found, as fractions of the
   * frame. The server uses it to crop before sending the photo on for
   * recognition; omitting it costs the crop, nothing else.
   */
  faceBox?: FaceBox,
): Promise<LoginResponse> {
  const form = new FormData();
  form.append('email', email);
  // Text fields before the file: busboy streams in order, so this keeps
  // file-time validation possible if it is ever wanted.
  if (faceBox) form.append('faceBox', JSON.stringify(faceBox));
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
