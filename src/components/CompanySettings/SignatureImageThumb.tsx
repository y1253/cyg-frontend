import { cn } from '@/lib/utils';
import type { SignatureImage } from '@/api/emailSignature';

/**
 * One logo, drawn.
 *
 * The `src` is the image's own PUBLIC url — the same one that goes into an email — so what
 * a member of staff sees here is exactly what a recipient gets. No session, no token, no
 * separate preview path that could disagree with the real thing.
 *
 * `object-contain` on a white ground because a logo is usually a transparent PNG designed
 * for a white email body; letting it inherit the card's background would misrepresent it
 * in dark mode.
 */
export function SignatureImageThumb({
  image,
  className,
  imgClassName,
}: {
  image: Pick<SignatureImage, 'url' | 'name'>;
  className?: string;
  imgClassName?: string;
}) {
  return (
    <div
      className={cn(
        'flex h-12 w-16 shrink-0 items-center justify-center rounded border bg-white',
        className,
      )}
    >
      <img
        src={image.url}
        alt=""
        className={cn('max-h-10 max-w-14 object-contain', imgClassName)}
      />
    </div>
  );
}
