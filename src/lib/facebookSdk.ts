/**
 * Meta's Embedded Signup — the OAuth popup that connects a WhatsApp Business number.
 *
 * The JS SDK flow, because it is the one Meta documents and the only one that hands back
 * the exact `waba_id` / `phone_number_id` the customer picked (as a `WA_EMBEDDED_SIGNUP`
 * window message). The login callback carries a CODE that dies after 30 seconds, so the
 * caller posts it to the server immediately.
 *
 * ⚠️ Popup blockers: `FB.login` must run inside the click that asked for it. So the SDK
 * is PRELOADED when the connect card mounts, and `launchWhatsAppSignup` calls `FB.login`
 * synchronously when it is already loaded — an `await` in front of it would detach the
 * popup from the user gesture.
 */

interface FacebookLoginResponse {
  authResponse?: { code?: string } | null;
  status?: string;
}

interface FacebookSdk {
  init(options: { appId: string; autoLogAppEvents?: boolean; xfbml?: boolean; version: string }): void;
  login(callback: (response: FacebookLoginResponse) => void, options: Record<string, unknown>): void;
}

declare global {
  interface Window {
    FB?: FacebookSdk;
    fbAsyncInit?: () => void;
  }
}

const SDK_SRC = 'https://connect.facebook.net/en_US/sdk.js';

let loaded: FacebookSdk | null = null;
let loading: Promise<FacebookSdk> | null = null;

export function loadFacebookSdk(appId: string, version: string): Promise<FacebookSdk> {
  if (loaded) return Promise.resolve(loaded);
  if (loading) return loading;

  loading = new Promise<FacebookSdk>((resolve, reject) => {
    const ready = () => {
      const fb = window.FB;
      if (!fb) {
        reject(new Error('Facebook loaded without its SDK'));
        return;
      }
      fb.init({ appId, autoLogAppEvents: true, xfbml: false, version });
      loaded = fb;
      resolve(fb);
    };
    if (window.FB) {
      ready();
      return;
    }
    window.fbAsyncInit = ready;
    const script = document.createElement('script');
    script.src = SDK_SRC;
    script.async = true;
    script.defer = true;
    script.crossOrigin = 'anonymous';
    script.onerror = () => {
      loading = null;
      reject(new Error('Could not load Facebook. Check that connect.facebook.net is not blocked.'));
    };
    document.body.appendChild(script);
  });
  return loading;
}

/** The popup was closed or cancelled — not an error worth showing. */
export class SignupCancelled extends Error {
  constructor(message = 'WhatsApp signup was cancelled') {
    super(message);
    this.name = 'SignupCancelled';
  }
}

export interface EmbeddedSignupResult {
  code: string;
  wabaId: string;
  phoneNumberId: string;
}

export function isFacebookOrigin(origin: string): boolean {
  try {
    const host = new URL(origin).hostname;
    return host === 'facebook.com' || host.endsWith('.facebook.com');
  } catch {
    return false;
  }
}

export type SignupMessage =
  | { kind: 'finish'; wabaId: string; phoneNumberId: string }
  | { kind: 'cancel'; step: string | null }
  | { kind: 'error'; message: string };

/** A `WA_EMBEDDED_SIGNUP` window message, or null for anything else Facebook posts. */
export function parseSignupMessage(raw: unknown): SignupMessage | null {
  let data: unknown = raw;
  if (typeof raw === 'string') {
    try {
      data = JSON.parse(raw);
    } catch {
      return null;
    }
  }
  const msg = data as { type?: unknown; event?: unknown; data?: Record<string, unknown> } | null;
  if (!msg || msg.type !== 'WA_EMBEDDED_SIGNUP') return null;
  const payload = msg.data ?? {};
  const event = typeof msg.event === 'string' ? msg.event : '';

  if (event === 'CANCEL') {
    return {
      kind: 'cancel',
      step: typeof payload.current_step === 'string' ? payload.current_step : null,
    };
  }
  if (event === 'ERROR') {
    return {
      kind: 'error',
      message:
        typeof payload.error_message === 'string'
          ? payload.error_message
          : 'WhatsApp signup failed',
    };
  }
  if (event.startsWith('FINISH')) {
    const wabaId = typeof payload.waba_id === 'string' ? payload.waba_id : '';
    const phoneNumberId =
      typeof payload.phone_number_id === 'string' ? payload.phone_number_id : '';
    if (!wabaId || !phoneNumberId) {
      return {
        kind: 'error',
        message: 'Signup finished without a phone number. Run it again and pick or add a number.',
      };
    }
    return { kind: 'finish', wabaId, phoneNumberId };
  }
  return null;
}

/** How long to wait for the ids after the code arrives (they normally arrive first). */
const IDS_GRACE_MS = 5000;

function runSignup(fb: FacebookSdk, configId: string): Promise<EmbeddedSignupResult> {
  return new Promise<EmbeddedSignupResult>((resolve, reject) => {
    let ids: { wabaId: string; phoneNumberId: string } | null = null;
    let code: string | null = null;
    let settled = false;
    let timer: number | undefined;

    const cleanup = () => {
      window.removeEventListener('message', onMessage);
      if (timer !== undefined) window.clearTimeout(timer);
    };
    const fail = (err: Error) => {
      if (settled) return;
      settled = true;
      cleanup();
      reject(err);
    };
    const finish = () => {
      if (settled || !ids || !code) return;
      settled = true;
      cleanup();
      resolve({ code, ...ids });
    };

    function onMessage(event: MessageEvent) {
      if (!isFacebookOrigin(event.origin)) return;
      const msg = parseSignupMessage(event.data);
      if (!msg) return;
      if (msg.kind === 'finish') {
        ids = { wabaId: msg.wabaId, phoneNumberId: msg.phoneNumberId };
        finish();
      } else if (msg.kind === 'cancel') {
        fail(new SignupCancelled());
      } else {
        fail(new Error(msg.message));
      }
    }
    window.addEventListener('message', onMessage);

    // NOT an async callback — the SDK rejects those.
    fb.login(
      (response) => {
        code = response.authResponse?.code ?? null;
        if (!code) {
          fail(new SignupCancelled());
          return;
        }
        if (ids) {
          finish();
          return;
        }
        timer = window.setTimeout(
          () => fail(new Error('Facebook did not report which WhatsApp number was chosen. Try again.')),
          IDS_GRACE_MS,
        );
      },
      {
        config_id: configId,
        response_type: 'code',
        override_default_response_type: true,
        extras: { setup: {}, sessionInfoVersion: '3' },
      },
    );
  });
}

export function launchWhatsAppSignup(cfg: {
  appId: string;
  configId: string;
  graphVersion: string;
}): Promise<EmbeddedSignupResult> {
  // Synchronous when preloaded, so the popup stays attached to the click.
  if (loaded) return runSignup(loaded, cfg.configId);
  return loadFacebookSdk(cfg.appId, cfg.graphVersion).then((fb) => runSignup(fb, cfg.configId));
}
