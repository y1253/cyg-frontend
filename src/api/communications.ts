import { fetchWithAuth } from './client';

const API = '/api';

/** The newest inbox item for a company, reduced to what a popup body needs. */
export interface LatestPreview {
  /** Sender display name, falling back to their address. */
  from: string;
  /** Empty for a chat message, which has no subject. */
  subject: string;
  snippet: string;
  /** ISO. Lets the caller ignore a preview too old to be what just arrived. */
  receivedAt: string;
  kind: 'email' | 'chat';
}

/**
 * Fetch the newest email/chat for a company, to fill in a new-message popup.
 *
 * Called only when an alert is about to fire, never on the polling path — so this
 * costs one request per notification, not one per minute per company.
 *
 * Never throws. Every failure mode here (not assigned, mailbox disconnected, Google
 * down) means the same thing to the caller: show the generic popup. Losing the
 * notification because the preview failed would be strictly worse than showing it
 * without one.
 */
export async function fetchLatestPreview(
  token: string,
  companyId: number,
): Promise<LatestPreview | null> {
  try {
    const res = await fetchWithAuth(
      token,
      `${API}/communications/companies/${companyId}/latest-preview`,
    );
    if (!res.ok) return null;
    // Nest sends a nil return as a 200 with a ZERO-LENGTH body, which is not valid
    // JSON — `res.json()` throws SyntaxError on it. An empty mailbox and a company
    // with nothing connected both land here.
    const text = await res.text();
    return text ? (JSON.parse(text) as LatestPreview) : null;
  } catch {
    return null;
  }
}
