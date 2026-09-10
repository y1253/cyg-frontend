import type { SignatureImage } from '@/api/emailSignature';

/**
 * The "no logo" sentinel, as the string a picker uses for its value.
 *
 * `0` means NO LOGO and `null` means INHERIT — two different states, which is why the
 * settings tables carry no `logoEnabled` flag beside the id. Everything that reads an id
 * on the client goes through the helpers here so the sentinel is spelled out once.
 */
export const NO_LOGO_ID = 0;

export const NO_LOGO_LABEL = 'No logo';

/**
 * What a picker offers, keyed by id-as-string.
 *
 * `NO_LOGO_ID` is ALWAYS present: without it a company that has been given a logo could
 * never be put back to none. Same rule as `holdOptions` in `PhoneSettingsSection`, where
 * the missing option would be silence.
 */
export function logoOptions(
  images: SignatureImage[] | undefined,
): Record<string, string> {
  return {
    [String(NO_LOGO_ID)]: NO_LOGO_LABEL,
    ...Object.fromEntries((images ?? []).map((i) => [String(i.id), i.name])),
  };
}

/**
 * The label for a stored id.
 *
 * The fallback is load-bearing. A logo is SOFT-deleted, and a settings row may still name
 * it — so an id with no matching image is a real, reachable state, not a bug. Saying
 * "Unavailable logo" is what turns "where did my logo go?" into something an admin can act
 * on; falling back to the id, or to "No logo", would hide it.
 */
export function logoLabel(
  images: SignatureImage[] | undefined,
  id: number,
): string {
  return logoOptions(images)[String(id)] ?? 'Unavailable logo';
}
