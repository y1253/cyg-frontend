import { fetchWithAuth } from './client';

const API = '/api';

/** One uploaded track in the hold-music library. */
export interface PhoneAudio {
  id: number;
  name: string;
  filename: string;
  size: number;
  durationMs: number;
  createdAt: string;
}

async function throwOnError(res: Response, fallback: string) {
  if (res.ok) return;
  const body = (await res.json().catch(() => ({}))) as {
    message?: string | string[];
  };
  const message = Array.isArray(body.message)
    ? body.message.join(', ')
    : body.message;
  throw new Error(message ?? fallback);
}

export async function fetchPhoneAudio(token: string): Promise<PhoneAudio[]> {
  const res = await fetchWithAuth(token, `${API}/phone-audio`, { method: 'GET' });
  await throwOnError(res, 'Failed to load the audio library');
  return res.json() as Promise<PhoneAudio[]>;
}

/**
 * Upload one track, reporting progress.
 *
 * XHR rather than fetch for the same reason `sendEmail` uses it: only XHR exposes
 * `upload.onprogress`, and a 20 MB file over a slow line needs a bar rather than a spinner.
 */
export function uploadPhoneAudio(
  token: string,
  file: File,
  name: string,
  onProgress?: (fraction: number) => void,
): Promise<PhoneAudio> {
  return new Promise((resolve, reject) => {
    const form = new FormData();
    form.append('file', file);
    if (name.trim()) form.append('name', name.trim());

    const xhr = new XMLHttpRequest();
    xhr.open('POST', `${API}/phone-audio`);
    xhr.setRequestHeader('Authorization', `Bearer ${token}`);
    // No Content-Type: the browser must set it so the multipart boundary is included.

    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable && onProgress) onProgress(e.loaded / e.total);
    };
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        try {
          resolve(JSON.parse(xhr.responseText) as PhoneAudio);
        } catch {
          reject(new Error('The server sent a response we could not read'));
        }
        return;
      }
      // 413 is nginx, not our handler, so it has no JSON body to unwrap.
      if (xhr.status === 413) {
        reject(new Error('That file is too large. The limit is 20 MB.'));
        return;
      }
      try {
        const body = JSON.parse(xhr.responseText) as {
          message?: string | string[];
        };
        const message = Array.isArray(body.message)
          ? body.message.join(', ')
          : body.message;
        reject(new Error(message ?? 'Upload failed'));
      } catch {
        reject(new Error('Upload failed'));
      }
    };
    xhr.onerror = () => reject(new Error('Upload failed'));
    xhr.onabort = () => reject(new Error('Upload cancelled'));
    xhr.send(form);
  });
}

export async function renamePhoneAudio(
  token: string,
  id: number,
  name: string,
): Promise<PhoneAudio> {
  const res = await fetchWithAuth(token, `${API}/phone-audio/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name }),
  });
  await throwOnError(res, 'Failed to rename');
  return res.json() as Promise<PhoneAudio>;
}

export async function deletePhoneAudio(
  token: string,
  id: number,
): Promise<void> {
  const res = await fetchWithAuth(token, `${API}/phone-audio/${id}`, {
    method: 'DELETE',
  });
  await throwOnError(res, 'Failed to delete');
}

/** Playable URL. Token in the query string — an <audio> cannot send a header. */
export function phoneAudioSrc(token: string, id: number): string {
  return `${API}/phone/audio/${id}?token=${encodeURIComponent(token)}`;
}

/** `mm:ss` from the stored duration. */
export function formatDuration(ms: number): string {
  const total = Math.round(ms / 1000);
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}
