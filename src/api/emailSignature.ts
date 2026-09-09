import { fetchWithAuth } from './client';

const API = '/api';
const JSON_HEADERS = { 'Content-Type': 'application/json' };

/**
 * Mirrors `EffectiveEmailSignature` on the server.
 *
 * `signatureHtml: ''` means "send no signature" and `signatureImageId: 0` means "no logo".
 * Both are VALUES, not absences — which is why every read of them uses `??` and never `||`.
 */
export interface EffectiveEmailSignature {
  signatureHtml: string;
  signatureImageId: number;
}

/** `null` on a field means "inherit the global default". */
export type EmailSignatureOverrides = {
  [K in keyof EffectiveEmailSignature]: EffectiveEmailSignature[K] | null;
};

export type SignatureSource = Record<
  keyof EffectiveEmailSignature,
  'company' | 'default'
>;

export interface Placeholder {
  token: string;
  label: string;
  key: string;
  example: string;
}

export interface SignatureDefaultsResponse {
  defaults: EffectiveEmailSignature & { id: number; singleton: string };
  placeholders: Placeholder[];
}

export interface CompanyEmailSignatureView {
  companyId: number;
  companyName: string;
  overrides: EmailSignatureOverrides;
  effective: EffectiveEmailSignature;
  source: SignatureSource;
  defaults: EffectiveEmailSignature;
  placeholders: Placeholder[];
  previewHtml: string;
}

export interface SignatureImage {
  id: number;
  name: string;
  filename: string;
  size: number;
  width: number;
  height: number;
  createdAt: string;
  /** Absolute and UNAUTHENTICATED — the same URL that goes into an email. */
  url: string;
}

/** Nest's error body, so the server's message reaches the admin verbatim. */
async function throwOnError(res: Response, fallback = 'Request failed') {
  if (res.ok) return;
  const body = (await res.json().catch(() => ({}))) as {
    message?: string | string[];
  };
  const message = Array.isArray(body.message)
    ? body.message.join(', ')
    : body.message;
  throw new Error(message ?? fallback);
}

// ── Settings ────────────────────────────────────────────────────────────────

export async function fetchSignatureDefaults(
  token: string,
): Promise<SignatureDefaultsResponse> {
  const res = await fetchWithAuth(token, `${API}/email-signature/defaults`, {
    method: 'GET',
  });
  await throwOnError(res, 'Failed to load the signature defaults');
  return res.json() as Promise<SignatureDefaultsResponse>;
}

export async function updateSignatureDefaults(
  token: string,
  data: Partial<EffectiveEmailSignature>,
): Promise<SignatureDefaultsResponse> {
  const res = await fetchWithAuth(token, `${API}/email-signature/defaults`, {
    method: 'PATCH',
    headers: JSON_HEADERS,
    body: JSON.stringify(data),
  });
  await throwOnError(res, 'Failed to save the signature defaults');
  return res.json() as Promise<SignatureDefaultsResponse>;
}

export async function fetchCompanySignature(
  token: string,
  companyId: number,
): Promise<CompanyEmailSignatureView> {
  const res = await fetchWithAuth(
    token,
    `${API}/email-signature/companies/${companyId}`,
    { method: 'GET' },
  );
  await throwOnError(res, 'Failed to load this company’s signature');
  return res.json() as Promise<CompanyEmailSignatureView>;
}

/**
 * **Send `null` to clear an override**; omit a key to leave it untouched.
 *
 * The server distinguishes the two with `hasOwnProperty`, so `JSON.stringify` dropping
 * `undefined` is exactly the behaviour we want.
 */
export async function updateCompanySignature(
  token: string,
  companyId: number,
  data: Partial<EmailSignatureOverrides>,
): Promise<CompanyEmailSignatureView> {
  const res = await fetchWithAuth(
    token,
    `${API}/email-signature/companies/${companyId}`,
    { method: 'PATCH', headers: JSON_HEADERS, body: JSON.stringify(data) },
  );
  await throwOnError(res, 'Failed to save this company’s signature');
  return res.json() as Promise<CompanyEmailSignatureView>;
}

export async function resetCompanySignature(
  token: string,
  companyId: number,
): Promise<CompanyEmailSignatureView> {
  const res = await fetchWithAuth(
    token,
    `${API}/email-signature/companies/${companyId}/reset`,
    { method: 'POST' },
  );
  await throwOnError(res, 'Failed to reset this company’s signature');
  return res.json() as Promise<CompanyEmailSignatureView>;
}

export async function previewSignature(
  token: string,
  body: { template: string; companyId?: number; signatureImageId?: number },
): Promise<{ html: string }> {
  const res = await fetchWithAuth(token, `${API}/email-signature/preview`, {
    method: 'POST',
    headers: JSON_HEADERS,
    body: JSON.stringify(body),
  });
  await throwOnError(res, 'Failed to render the preview');
  return res.json() as Promise<{ html: string }>;
}

// ── The logo library ────────────────────────────────────────────────────────

export async function fetchSignatureImages(
  token: string,
): Promise<SignatureImage[]> {
  const res = await fetchWithAuth(token, `${API}/signature-images`, {
    method: 'GET',
  });
  await throwOnError(res, 'Failed to load the logo library');
  return res.json() as Promise<SignatureImage[]>;
}

/**
 * XHR rather than fetch, so `upload.onprogress` can drive a bar — the same reason
 * `uploadPhoneAudio` is shaped this way.
 *
 * Content-Type is deliberately NOT set: the browser must set it so the multipart boundary
 * is included.
 */
export function uploadSignatureImage(
  token: string,
  file: File,
  name: string,
  onProgress?: (fraction: number) => void,
): Promise<SignatureImage> {
  return new Promise((resolve, reject) => {
    const form = new FormData();
    form.append('file', file);
    form.append('name', name);

    const xhr = new XMLHttpRequest();
    xhr.open('POST', `${API}/signature-images`);
    xhr.setRequestHeader('Authorization', `Bearer ${token}`);

    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable && onProgress) onProgress(e.loaded / e.total);
    };
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        resolve(JSON.parse(xhr.responseText) as SignatureImage);
        return;
      }
      // 413 is nginx, not our handler, so it has no JSON body to unwrap.
      if (xhr.status === 413) {
        reject(new Error('That file is too large. The limit is 5 MB.'));
        return;
      }
      let message = 'Upload failed';
      try {
        const body = JSON.parse(xhr.responseText) as {
          message?: string | string[];
        };
        message = Array.isArray(body.message)
          ? body.message.join(', ')
          : (body.message ?? message);
      } catch {
        // non-JSON error body — keep the generic message
      }
      reject(new Error(message));
    };
    xhr.onerror = () => reject(new Error('Upload failed'));
    xhr.send(form);
  });
}

export async function renameSignatureImage(
  token: string,
  id: number,
  name: string,
): Promise<SignatureImage> {
  const res = await fetchWithAuth(token, `${API}/signature-images/${id}`, {
    method: 'PATCH',
    headers: JSON_HEADERS,
    body: JSON.stringify({ name }),
  });
  await throwOnError(res, 'Failed to rename the logo');
  return res.json() as Promise<SignatureImage>;
}

export async function deleteSignatureImage(
  token: string,
  id: number,
): Promise<void> {
  const res = await fetchWithAuth(token, `${API}/signature-images/${id}`, {
    method: 'DELETE',
  });
  await throwOnError(res, 'Failed to remove the logo');
}
