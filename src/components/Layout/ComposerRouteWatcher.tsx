import { useLayoutEffect, useRef } from 'react';
import { useLocation } from 'react-router-dom';
import { useComposer } from '@/context/ComposerContext';

/**
 * Publishes the current route up to the composer provider, which paints only the
 * windows opened from it. Nothing is closed on navigation any more — a draft is
 * hidden, not destroyed, so coming back returns it untouched.
 *
 * It has to be a separate component mounted *inside* the router: `ComposerProvider`
 * sits above `RouterProvider` (so the windows can outlive a tab switch), which puts
 * `useLocation` out of its reach — the hook reads router context, and being portaled
 * to `document.body` doesn't change where the provider sits in the React tree. Same
 * reason `NotificationProvider` is mounted from `AppLayout`.
 *
 * This is also the *only* source of the path a draft is stamped with. Reading
 * `window.location.pathname` at open time instead would eventually disagree with it:
 * React Router 7 navigates inside `startTransition`, so between a click and its
 * commit `window.location` already reports the new path while `useLocation` still
 * reports the old one. A draft stamped in that window would match no route at all —
 * mounted, invisible and impossible to close, with the user's attachments inside it.
 *
 * Renders nothing; it only watches.
 */
export function ComposerRouteWatcher() {
  const { pathname } = useLocation();
  const { setRoutePath, clearRoutePath } = useComposer();
  const pathRef = useRef(pathname);

  // Layout, not passive: a passive effect lets the new page paint one frame with the
  // previous page's composers still on screen.
  useLayoutEffect(() => {
    pathRef.current = pathname;
    setRoutePath(pathname);
  }, [pathname, setRoutePath]);

  // Leaving the authenticated shell altogether (/login, /privacy, /gmail/success)
  // unmounts this without ever handing it a new pathname. Clearing hides every
  // window without destroying it. Reading the path from a ref keeps this an
  // unmount-only cleanup, and passing it makes StrictMode's one spurious dev cleanup
  // a no-op instead of a clobber.
  useLayoutEffect(() => () => clearRoutePath(pathRef.current), [clearRoutePath]);

  return null;
}
