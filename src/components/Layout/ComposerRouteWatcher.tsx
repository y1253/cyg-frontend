import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { useComposer } from '@/context/ComposerContext';

/**
 * Closes the docked composer once the user leaves the page it was opened from.
 *
 * It has to be a separate component mounted *inside* the router: `ComposerProvider`
 * sits above `RouterProvider` (so the window can outlive a tab switch), which puts
 * `useLocation` out of its reach — the hook reads router context, and being
 * portaled to `document.body` doesn't change where the provider sits in the React
 * tree. Same reason `NotificationProvider` is mounted from `AppLayout`.
 *
 * Renders nothing; it only watches.
 */
export function ComposerRouteWatcher() {
  const { pathname } = useLocation();
  const { draft, closeOnNavigate } = useComposer();
  const ownerPath = draft?.ownerPath ?? null;

  useEffect(() => {
    if (ownerPath && ownerPath !== pathname) closeOnNavigate();
  }, [pathname, ownerPath, closeOnNavigate]);

  // Leaving the authenticated shell altogether (/privacy, /gmail/success) unmounts
  // this without ever handing it a new pathname, so close on the way out too.
  useEffect(() => () => closeOnNavigate(), [closeOnNavigate]);

  return null;
}
