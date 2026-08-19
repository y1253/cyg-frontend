/**
 * Brand colours, shared by the login page's custom dark design and by the camera
 * component that both the login page and the (light, Tailwind) admin dialogs use.
 *
 * Lives in lib/ rather than components/Login/ so `components/ui/` can import it
 * without depending on a feature folder.
 */
export const TEAL = '#3BBFB4';
export const NAVY_DEEP = '#0B1C2C';
export const NAVY_MID = '#0E2033';
export const TEXT_PRIMARY = '#EDF2F7';
export const TEXT_MUTED = '#5E7A96';
export const TEXT_LABEL = '#7A98B4';

/** Shown while a face is detected but still failing a quality check. */
export const AMBER = '#E8B14C';
