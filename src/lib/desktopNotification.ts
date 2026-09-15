// Thin wrapper over the browser Notification API. Kept separate from React so the
// feature detection lives in one place — the API is absent on insecure origins and
// its constructor throws outright on Android Chrome (where notifications require a
// service worker), so every call site would otherwise need the same guards.

/**
 * The `source` on every message the service worker posts back to the page.
 *
 * ⚠️ Duplicated as `CALL_ACTION_SOURCE` in `public/notification-sw.js`, which is plain
 * JS outside the bundle and cannot import this. Change one, change the other.
 */
export const SW_MESSAGE_SOURCE = 'cyg-call-action';

export function notificationsSupported(): boolean {
  return typeof window !== 'undefined' && 'Notification' in window;
}

export function notificationPermission(): NotificationPermission | 'unsupported' {
  if (!notificationsSupported()) return 'unsupported';
  return Notification.permission;
}

/** Must be called from a user gesture — Safari ignores it otherwise. */
export async function requestNotificationPermission(): Promise<
  NotificationPermission | 'unsupported'
> {
  if (!notificationsSupported()) return 'unsupported';
  try {
    return await Notification.requestPermission();
  } catch {
    return Notification.permission;
  }
}

/**
 * The service worker registration, but ONLY once it can actually show a notification.
 *
 * ⚠️ `getRegistration()`, never `navigator.serviceWorker.ready`. `ready` never rejects
 * and never RESOLVES when nothing is registered — which is every `npm run dev` session,
 * since `vite.config.ts` sets `devOptions: { enabled: false }`. Awaiting it there would
 * swallow the call alert entirely instead of falling back.
 *
 * `active` rather than a truthy registration for the same reason in miniature: Chrome
 * rejects `showNotification` on a worker that is still installing, which is the first
 * page load of a fresh browser profile.
 */
async function swRegistration(): Promise<ServiceWorkerRegistration | null> {
  if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return null;
  try {
    const registration = await navigator.serviceWorker.getRegistration();
    return registration?.active ? registration : null;
  } catch {
    return null;
  }
}

/**
 * Constructor-created notifications, by tag, so they can be closed again.
 *
 * `registration.getNotifications()` only ever returns PERSISTENT (service-worker)
 * notifications, so without this the dev / first-load fallback — which sets
 * `requireInteraction` — would sit on the desktop forever after its call ended.
 */
const fallbackNotifications = new Map<string, Notification>();

export interface DesktopNotificationOptions {
  title: string;
  body: string;
  /** Notifications sharing a tag replace each other instead of stacking. */
  tag: string;
  /** Pass true when we already played our own chime, so the OS doesn't double it. */
  silent: boolean;
  onClick?: () => void;
}

export function showDesktopNotification({ title, body, tag, silent, onClick }: DesktopNotificationOptions): void {
  if (notificationPermission() !== 'granted') return;
  try {
    const notification = new Notification(title, {
      body,
      tag,
      silent,
      icon: '/pwa-192x192.png',
    });
    if (onClick) {
      notification.onclick = () => {
        window.focus();
        onClick();
        notification.close();
      };
    }
  } catch {
    // Constructor-throwing platforms (Android Chrome) need showNotification() via a
    // service worker. That path cannot carry `onClick` — a closure does not survive the
    // trip — so the worker only focuses the window and the user finds the message
    // themselves. Strictly better than today, where this threw and nothing appeared.
    void (async () => {
      const registration = await swRegistration();
      if (!registration) return;
      try {
        await registration.showNotification(title, {
          body,
          tag,
          silent,
          icon: '/pwa-192x192.png',
          data: { kind: 'message' },
        });
      } catch {
        /* nothing useful left to try */
      }
    })();
  }
}

/**
 * Chrome renders at most TWO actions on a desktop notification, which is exactly what a
 * ringing call needs. A third would silently not appear.
 */
interface NotificationAction {
  action: string;
  title: string;
}

/** `showNotification` options the DOM lib still does not type. */
interface CallNotificationInit extends NotificationOptions {
  actions?: NotificationAction[];
  requireInteraction?: boolean;
}

/** The tag a call's notification carries. One per call, so repeats collapse. */
export function callNotificationTag(callSid: string): string {
  return `cyg-call-${callSid}`;
}

/**
 * Raise the ringing-call notification, with Answer and Decline.
 *
 * ── WHY THIS ONE MUST GO THROUGH THE SERVICE WORKER ────────────────────────────
 * Action buttons only exist on `registration.showNotification()`; the page-level
 * constructor has no `actions` at all. With no worker (development) this degrades to the
 * plain constructor above — an alert with no buttons, which is still the difference
 * between noticing a call and missing it.
 *
 * Returns whether anything was shown, so the caller can log honestly.
 */
export async function showCallNotification(input: {
  callSid: string;
  companyId: number;
  title: string;
  body: string;
  /** True when our own ringtone is already audible in this tab. */
  silent: boolean;
}): Promise<boolean> {
  if (notificationPermission() !== 'granted') return false;
  const tag = callNotificationTag(input.callSid);

  const registration = await swRegistration();
  if (registration) {
    try {
      const options: CallNotificationInit = {
        body: input.body,
        tag,
        silent: input.silent,
        icon: '/pwa-192x192.png',
        badge: '/pwa-64x64.png',
        // A ring deserves to stay on screen for its whole thirty seconds rather than
        // auto-hiding after a few. `endSlot` is what takes it away again.
        requireInteraction: true,
        data: { kind: 'call', callSid: input.callSid, companyId: input.companyId },
        actions: [
          { action: 'answer', title: 'Answer' },
          { action: 'decline', title: 'Decline' },
        ],
      };
      await registration.showNotification(input.title, options);
      return true;
    } catch {
      // Fall through to the constructor rather than leaving the call unannounced.
    }
  }

  // No worker (development, or a first-ever load): a plain notification with no
  // buttons. Still the difference between noticing a call and missing it.
  if (notificationPermission() !== 'granted') return false;
  try {
    const notification = new Notification(input.title, {
      body: input.body,
      tag,
      silent: input.silent,
      icon: '/pwa-192x192.png',
    });
    notification.onclick = () => {
      window.focus();
      notification.close();
    };
    fallbackNotifications.set(tag, notification);
    notification.addEventListener('close', () => {
      if (fallbackNotifications.get(tag) === notification) {
        fallbackNotifications.delete(tag);
      }
    });
    return true;
  } catch {
    return false;
  }
}

/**
 * Take a call's notification back down — answered, declined, hung up or rang out.
 *
 * It carries `requireInteraction`, so without this it would sit on the desktop until
 * somebody clicked a button for a call that no longer exists. Both paths are covered:
 * the worker's own list, and the constructor fallback's handle map.
 */
export async function closeNotification(tag: string): Promise<void> {
  const fallback = fallbackNotifications.get(tag);
  if (fallback) {
    fallbackNotifications.delete(tag);
    try {
      fallback.close();
    } catch {
      /* already gone */
    }
  }

  const registration = await swRegistration();
  if (!registration) return;
  try {
    const open = await registration.getNotifications({ tag });
    for (const notification of open) notification.close();
  } catch {
    /* best effort */
  }
}
