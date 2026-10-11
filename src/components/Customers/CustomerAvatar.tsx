import { cn } from '@/lib/utils';
import { initials } from './customer-format';

/** The customer's Google photo, or their initials. */
export function CustomerAvatar({ name, url, size = 'sm' }: { name: string; url: string | null; size?: 'sm' | 'lg' }) {
  const box = size === 'lg' ? 'size-14 text-lg' : 'size-9 text-xs';
  return url ? (
    <img src={url} alt="" referrerPolicy="no-referrer" className={cn('shrink-0 rounded-full object-cover', box)} />
  ) : (
    <span className={cn('flex shrink-0 items-center justify-center rounded-full bg-teal-100 font-semibold text-teal-800', box)}>
      {initials(name)}
    </span>
  );
}
