const API = '/api';

export interface AuthUser {
  id: number;
  name: string;
  email: string;
  role: 'ADMIN' | 'MANAGER' | 'USER';
}

export interface LoginResponse {
  access_token: string;
  user: AuthUser;
}

/** The admin password was right; a code was emailed and `verifyLoginCode` finishes. */
export interface CodeRequired {
  requiresCode: true;
  challengeId: string;
  /** Masked recipient, e.g. `c***@cygfinance.com`. */
  sentTo: string;
}

/**
 * A login error that carries the server's own sentence.
 *
 * `ALREADY_SIGNED_IN` is the one that matters: one device per account, so a second
 * login is refused while another session is alive, and the person needs to be told
 * where (IP and since when) rather than "invalid credentials".
 */
export class LoginError extends Error {
  readonly status: number;
  readonly code?: string;

  constructor(message: string, status: number, code?: string) {
    super(message);
    this.status = status;
    this.code = code;
  }

  get alreadySignedIn(): boolean {
    return this.code === 'ALREADY_SIGNED_IN';
  }
}

interface ErrorBody {
  message?: string | string[];
  code?: string;
  ip?: string | null;
  since?: string;
}

async function loginError(res: Response, fallback: string): Promise<LoginError> {
  const body = (await res.json().catch(() => ({}))) as ErrorBody;
  if (body.code === 'ALREADY_SIGNED_IN') {
    const parts: string[] = [];
    if (body.ip) parts.push(`IP ${body.ip}`);
    if (body.since) {
      parts.push(
        `since ${new Date(body.since).toLocaleString([], { dateStyle: 'short', timeStyle: 'short' })}`,
      );
    }
    const detail = parts.length ? ` (${parts.join(', ')})` : '';
    return new LoginError(
      `This account is already signed in on another device${detail}. ` +
        'Sign out there first, or ask an admin to sign it out.',
      res.status,
      body.code,
    );
  }
  const msg = Array.isArray(body.message) ? body.message[0] : body.message;
  return new LoginError(msg || fallback, res.status, body.code);
}

export async function login(
  email: string,
  password: string,
): Promise<LoginResponse | CodeRequired> {
  const res = await fetch(`${API}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  if (!res.ok) {
    // A 401 here is a wrong password; keep that message generic.
    if (res.status === 401) throw new LoginError('Invalid email or password', 401);
    throw await loginError(res, 'Sign in failed. Please try again.');
  }
  return res.json();
}

export function isCodeRequired(r: LoginResponse | CodeRequired): r is CodeRequired {
  return (r as CodeRequired).requiresCode === true;
}

export async function verifyLoginCode(
  challengeId: string,
  code: string,
): Promise<LoginResponse> {
  const res = await fetch(`${API}/auth/login/verify`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ challengeId, code }),
  });
  if (!res.ok) throw await loginError(res, 'That code is not right.');
  return res.json();
}

export async function resendLoginCode(challengeId: string): Promise<{ sentTo: string }> {
  const res = await fetch(`${API}/auth/login/resend`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ challengeId }),
  });
  if (!res.ok) throw await loginError(res, "Couldn't send a new code.");
  return res.json();
}

/**
 * Tell the server this session is over, so the account can sign in elsewhere at once
 * instead of waiting out the staleness window.
 *
 * `keepalive` because the callers navigate away immediately afterwards. Never awaited
 * and never throws: signing out locally must not depend on the network.
 */
export function serverLogout(token: string, reason: 'LOGOUT' | 'IDLE' = 'LOGOUT'): void {
  try {
    void fetch(`${API}/auth/logout`, {
      method: 'POST',
      keepalive: true,
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ reason }),
    }).catch(() => undefined);
  } catch {
    /* ignore */
  }
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

  if (!res.ok) throw await loginError(res, 'Face not recognized');

  return res.json();
}
