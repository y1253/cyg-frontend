// Thin wrapper over the browser Notification API. Kept separate from React so the
// feature detection lives in one place — the API is absent on insecure origins and
// its constructor throws outright on Android Chrome (where notifications require a
// service worker), so every call site would otherwise need the same guards.

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

export interface DesktopNotificationOptions {
  title: string;
  body: string;
  /** Notifications sharing a tag replace each other instead of stacking. */
  tag: string;
  /** Pass true when we already played our own chime, so the OS doesn't double it. */
  silent: boolean;
  onClick?: () => void;
}

export function showDesktopNotification({
  title,
  body,
  tag,
  silent,
  onClick,
}: DesktopNotificationOptions): void {
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
    // service worker. Swallow: the chime already fired, and there is nothing useful
    // to tell the user here.
  }
}
