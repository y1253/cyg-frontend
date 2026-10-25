import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { ExternalLink, Globe } from 'lucide-react';
import { CUSTOMER_SITE_GROUPS, CUSTOMER_SITE_TABS, groupOf, tabHref, type CustomerSiteTab } from './customer-site-tabs';
import { useAiRulePendingCount } from '@/hooks/useAiRules';
import { useFeatureRequestOpenCount } from '@/hooks/useFeatureRequests';
import { cn } from '@/lib/utils';

/**
 * The frame every Customer-site page sits in, so the public site's admin reads as its own
 * area rather than another staff page: an indigo band naming cygfinance.com and its own
 * sub-navigation (links, so a customer's detail page keeps the same tabs): four group tabs in
 * the band, and pills under it for the pages of the open group — nothing scrolls sideways. Indigo is used
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
  // AI rules waiting for review — the Rules pill (and the AI assistant tab) carry the count.
  const pending = useAiRulePendingCount().data ?? 0;
  // step12e: feature requests nobody has looked at yet.
  const openRequests = useFeatureRequestOpenCount().data ?? 0;
  // A customer's detail page (active null) sits under Customers.
  const group = groupOf(active ?? 'customers');
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
          <nav className="flex flex-wrap gap-1 bg-indigo-900/60 px-3 py-2 sm:px-4">
            {CUSTOMER_SITE_GROUPS.map((g) => {
              const count = g.key === 'ai' ? pending + openRequests : 0;
              return (
                <Link
                  key={g.key}
                  to={tabHref(g.tabs[0])}
                  replace={active !== null}
                  className={cn(
                    'flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium whitespace-nowrap transition-colors',
                    group.key === g.key
                      ? 'bg-white text-indigo-950 shadow-sm'
                      : 'text-indigo-200 hover:bg-white/10 hover:text-white',
                  )}
                >
                  {g.icon}
                  {g.label}
                  {count > 0 && <CountBadge n={count} />}
                </Link>
              );
            })}
          </nav>
        </div>
        {active !== null && group.tabs.length > 1 && (
          <div className="mb-5 flex flex-wrap gap-1.5">
            {group.tabs.map((key) => {
              const t = CUSTOMER_SITE_TABS.find((x) => x.key === key)!;
              const count = key === 'ai' ? pending : key === 'requests' ? openRequests : 0;
              return (
                <Link
                  key={key}
                  to={tabHref(key)}
                  replace
                  className={cn(
                    'flex items-center gap-1.5 rounded-full px-3 py-1 text-sm font-medium transition-colors',
                    active === key
                      ? 'bg-indigo-600 text-white shadow-sm'
                      : 'bg-white text-indigo-900 ring-1 ring-indigo-100 hover:bg-indigo-50',
                  )}
                >
                  {t.icon}
                  {t.label}
                  {count > 0 && <CountBadge n={count} />}
                </Link>
              );
            })}
          </div>
        )}
        {children}
      </div>
    </div>
  );
}

function CountBadge({ n }: { n: number }) {
  return (
    <span className="rounded-full bg-amber-400 px-1.5 text-[11px] leading-[18px] font-semibold text-amber-950">{n}</span>
  );
}
