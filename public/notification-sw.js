/* eslint-disable no-undef */
/**
 * Service-worker code for CALL NOTIFICATIONS — the Answer / Decline buttons.
 *
 * ── WHY THIS IS A PLAIN .js FILE IN public/ ────────────────────────────────────
 * `vite.config.ts` runs VitePWA in `generateSW` mode: workbox writes the whole service
 * worker and there is no SW source file to add a listener to. Action buttons need a
 * `notificationclick` handler INSIDE the worker, so this file is pulled in with
 * `workbox.importScripts` — which is exactly what that option is documented for
 * ("useful when you want to let Workbox create your top-level service worker file, but
 * want to include some additional code, such as a push event listener").
 *
 * The alternative was `injectManifest`, i.e. hand-writing a worker that reproduces
 * precacheAndRoute, cleanupOutdatedCaches, skipWaiting, clientsClaim, the navigation
 * fallback with its /api denylist AND the /mediapipe/ CacheFirst rule. Getting any of
 * that subtly wrong breaks offline behaviour or re-downloads 11MB of MediaPipe wasm —
 * neither of which a notification test would catch. Forty lines outside TypeScript is
 * the cheaper risk.
 *
 * ⚠️ Nothing here is bundled, transpiled or type-checked. Keep it small, keep it plain,
 * and do not import anything.
 */

/** Matches SW_MESSAGE_SOURCE in `src/lib/desktopNotification.ts`. */
const CALL_ACTION_SOURCE = 'cyg-call-action';

self.addEventListener('notificationclick', (event) => {
  const data = event.notification.data || {};

  // '' when the body was clicked rather than a button — that means "show me", which is
  // the focus below with no action attached.
  const action = event.action || 'open';
  event.notification.close();

  // A MESSAGE notification only reaches this worker on platforms where the page-level
  // constructor throws (Android Chrome). It carries no action and no closure to run, so
  // all it can do is bring the app forward — which is still better than the nothing that
  // happened there before.
  const isCall = data.kind === 'call';

  event.waitUntil(
    (async () => {
      const windows = await self.clients.matchAll({
        type: 'window',
        // Without this, a tab the worker has not claimed yet is invisible here — and
        // the whole feature is about a tab that has been sitting in the background.
        includeUncontrolled: true,
      });

      const target = windows[0];
      if (target) {
        // Focus first: the agent should be looking at the call card whichever button
        // they pressed, including Decline (so they can see it was dealt with).
        try {
          await target.focus();
        } catch {
          /* focus can be refused; the message below still does the work */
        }
        if (isCall) {
          target.postMessage({
            source: CALL_ACTION_SOURCE,
            action,
            callSid: data.callSid,
          });
        }
        return;
      }

      // No window at all. Honestly degraded: a window that is still booting cannot
      // receive a postMessage, so this navigates and does NOT carry the action — the
      // agent lands on the company and answers from the card if the call is still up.
      // Out of scope by design (the feature assumes an open tab), but it must not throw.
      const url = data.companyId ? `/companies/${data.companyId}` : '/dashboard';
      try {
        await self.clients.openWindow(url);
      } catch {
        /* nothing further to try */
      }
    })(),
  );
});
