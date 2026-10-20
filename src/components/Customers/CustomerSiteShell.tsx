import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { ExternalLink, Globe } from 'lucide-react';
import { CUSTOMER_SITE_TABS, type CustomerSiteTab } from './customer-site-tabs';
import { useAiRulePendingCount } from '@/hooks/useAiRules';
import { cn } from '@/lib/utils';

/**
 * The frame every Customer-site page sits in, so the public site's admin reads as its own
 * area rather than another staff page: an indigo band naming cygfinance.com and its own
 * sub-navigation (links, so a customer's detail page keeps the same tabs). Indigo is used
 * only here and on its sidebar entry — the rest of the staff app is teal.
 */
export function CustomerSiteShell({
  active,
  blurb,
  children,
}: {
  /** The highlighted tab; null on a page under one (a customer's detail). */
  active: CustomerSiteTab | null;
  blurb?: string;
  children: ReactNode;
}) {
  // AI rules waiting for review — the "AI rules" tab carries the count.
  const pending = useAiRulePendingCount().data ?? 0;
  return (
    <div className="min-h-full bg-gradient-to-b from-indigo-50/80 via-indigo-50/20 to-transparent">
      <div className="mx-auto max-w-6xl p-4 sm:p-6">
        <div className="mb-5 overflow-hidden rounded-2xl bg-indigo-950 text-white shadow-sm ring-1 ring-indigo-900">
          <div className="flex flex-wrap items-center gap-4 px-5 py-4 sm:px-6">
            <span className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-indigo-500/20 text-indigo-200 ring-1 ring-indigo-400/30">
              <Globe size={22} />
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-[11px] font-semibold tracking-[0.14em] text-indigo-300 uppercase">Public website</p>
              <h2 className="text-xl font-semibold tracking-tight sm:text-2xl">Customer site</h2>
              {blurb && <p className="mt-0.5 text-sm text-indigo-200/90">{blurb}</p>}
            </div>
            <a
              href="https://cygfinance.com"
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1.5 rounded-full bg-white/10 px-3 py-1.5 text-xs font-medium text-indigo-100 ring-1 ring-white/15 hover:bg-white/15"
            >
              cygfinance.com
              <ExternalLink size={12} />
            </a>
          </div>
          <nav className="flex gap-1 overflow-x-auto bg-indigo-900/60 px-3 py-2 [scrollbar-width:none] sm:px-4 [&::-webkit-scrollbar]:hidden">
            {CUSTOMER_SITE_TABS.map((t) => (
              <Link
                key={t.key}
                to={t.key === 'customers' ? '/admin/customers' : `/admin/customers?tab=${t.key}`}
                replace={active !== null}
                className={cn(
                  'flex shrink-0 items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium whitespace-nowrap transition-colors',
                  active === t.key
                    ? 'bg-white text-indigo-950 shadow-sm'
                    : 'text-indigo-200 hover:bg-white/10 hover:text-white',
                )}
              >
                {t.icon}
                {t.label}
                {t.key === 'ai' && pending > 0 && (
                  <span className="rounded-full bg-amber-400 px-1.5 text-[11px] leading-[18px] font-semibold text-amber-950">
                    {pending}
                  </span>
                )}
              </Link>
            ))}
          </nav>
        </div>
        {children}
      </div>
    </div>
  );
}
