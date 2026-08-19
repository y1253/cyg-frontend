// Brand colors for the login page's custom dark design (see CLAUDE.md -- this page
// intentionally uses inline styles rather than Tailwind).
//
// The values live in lib/brand.ts so components/ui/ can use them without importing
// from a feature folder. Re-exported here so existing login imports keep working.
export {
  TEAL,
  NAVY_DEEP,
  NAVY_MID,
  TEXT_PRIMARY,
  TEXT_MUTED,
  TEXT_LABEL,
  AMBER,
} from '../../lib/brand';
