import { fetchWithAuth } from './client';

/** step12: the customer site's AI phone (Customer site → AI phone). */
export type AiVoiceOption = { id: string; label: string; gender: 'female' | 'male' | 'neutral' };

export type CustomerVoice = {
  enabled: boolean;
  voice: string;
  /** null = the generated "Hi <first name>…". */
  greeting: string | null;
  maxMinutes: number;
  updatedAt: string;
  voices: AiVoiceOption[];
  /** The receipt numbers that answer with the AI. */
  numbers: string[];
};

export type CustomerVoiceChange = Partial<Pick<CustomerVoice, 'enabled' | 'voice' | 'greeting' | 'maxMinutes'>>;

const URL = '/api/customer-voice';

async function throwOnError(res: Response, fallback: string): Promise<void> {
  if (res.ok) return;
  const body = (await res.json().catch(() => ({}))) as { message?: string | string[] };
  const message = Array.isArray(body.message) ? body.message.join(', ') : body.message;
  throw new Error(message ?? fallback);
}

export async function fetchCustomerVoice(token: string): Promise<CustomerVoice> {
  const res = await fetchWithAuth(token, URL);
  await throwOnError(res, 'Could not load the AI phone settings');
  return res.json() as Promise<CustomerVoice>;
}

export async function updateCustomerVoice(token: string, change: CustomerVoiceChange): Promise<CustomerVoice> {
  const res = await fetchWithAuth(token, URL, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(change),
  });
  await throwOnError(res, 'Could not save the AI phone settings');
  return res.json() as Promise<CustomerVoice>;
}
