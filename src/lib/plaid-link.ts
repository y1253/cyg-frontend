/**
 * Plaid Link, loaded from Plaid's own CDN (their required way to load it — no npm package).
 * Copied from the customer client's `lib/plaid-link.ts`, minus its OAuth-redirect resume
 * (staff connect on a desktop, where Link opens a bank's own sign-in in a popup).
 * `openPlaidLink` resolves with the `public_token` on success, null when Link is closed.
 */
const SCRIPT = 'https://cdn.plaid.com/link/v2/stable/link-initialize.js';

type PlaidHandler = { open: () => void; exit: () => void; destroy: () => void };
type PlaidGlobal = {
  create: (config: {
    token: string;
    onSuccess: (publicToken: string) => void;
    onExit: (err: unknown) => void;
  }) => PlaidHandler;
};

declare global {
  interface Window {
    Plaid?: PlaidGlobal;
  }
}

let loading: Promise<PlaidGlobal> | null = null;

export function loadPlaid(): Promise<PlaidGlobal> {
  if (window.Plaid) return Promise.resolve(window.Plaid);
  loading ??= new Promise((resolve, reject) => {
    const tag = document.createElement('script');
    tag.src = SCRIPT;
    tag.async = true;
    tag.onload = () =>
      window.Plaid ? resolve(window.Plaid) : reject(new Error('Plaid did not load'));
    tag.onerror = () => {
      loading = null;
      reject(
        new Error('Could not load the bank connection window. Check your connection and try again.'),
      );
    };
    document.head.appendChild(tag);
  });
  return loading;
}

export async function openPlaidLink(token: string): Promise<string | null> {
  const Plaid = await loadPlaid();
  return new Promise((resolve) => {
    const handler = Plaid.create({
      token,
      onSuccess: (publicToken) => {
        handler.destroy();
        resolve(publicToken);
      },
      onExit: () => {
        handler.destroy();
        resolve(null);
      },
    });
    handler.open();
  });
}
