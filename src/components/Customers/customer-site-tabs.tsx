import type { ReactNode } from 'react';
import { Coins, CreditCard, Inbox, Lightbulb, Mail, MessageSquareText, Phone, Receipt, ShieldAlert, Sparkles, Tag, Users2 } from 'lucide-react';

/** The Customer site area's pages, by `?tab=` key (`CustomerSiteShell`). */
export type CustomerSiteTab =
  | 'customers'
  | 'numbers'
  | 'inbox'
  | 'ai'
  | 'instructions'
  | 'requests'
  | 'voice'
  | 'pricing'
  | 'promo'
  | 'payments'
  | 'costs';

export const CUSTOMER_SITE_TABS: {
  key: CustomerSiteTab;
  label: string;
  icon: ReactNode;
  blurb: string;
}[] = [
  {
    key: 'customers',
    label: 'Customers',
    icon: <Users2 size={14} />,
    blurb: 'Everyone who signed up on cygfinance.com, and the bookkeeping they did there.',
  },
  {
    key: 'ai',
    label: 'Rules',
    icon: <Sparkles size={14} />,
    blurb: 'Rules the AI assistant learned from customer chats. Firm-wide ones wait here for your approval.',
  },
  {
    key: 'instructions',
    label: 'Instructions',
    icon: <ShieldAlert size={14} />,
    blurb: 'What the AI is told, the problems customers reported, and every fix the strong AI made — revert any of them.',
  },
  {
    key: 'requests',
    label: 'Requests',
    icon: <Lightbulb size={14} />,
    blurb: 'Things customers asked the AI for that we don’t do yet — mark them, and the customer is told when it’s done.',
  },
  {
    key: 'voice',
    label: 'Phone',
    icon: <Phone size={14} />,
    blurb: 'Customers can call the receipt numbers and talk to the AI assistant — pick its voice here.',
  },
  {
    key: 'numbers',
    label: 'Text numbers',
    icon: <MessageSquareText size={14} />,
    blurb: 'Numbers customers text their receipts to. Every connected number is shown on cygfinance.com.',
  },
  {
    key: 'inbox',
    label: 'Email inbox',
    icon: <Mail size={14} />,
    blurb: 'The mailbox customers email statements, receipts and questions to — the AI answers in the thread.',
  },
  {
    key: 'pricing',
    label: 'Pricing',
    icon: <CreditCard size={14} />,
    blurb: 'What a customer pays to Generate — live on cygfinance.com as soon as you save.',
  },
  {
    key: 'promo',
    label: 'Promo codes',
    icon: <Tag size={14} />,
    blurb: 'Discounts customers enter before paying: a percentage off, or a fixed price.',
  },
  {
    key: 'payments',
    label: 'Payments',
    icon: <Receipt size={14} />,
    blurb: 'Every Generate a customer paid for (or got free with a promo code).',
  },
  {
    key: 'costs',
    label: 'Costs',
    icon: <Coins size={14} />,
    blurb: 'What each customer costs us — AI, texts, WhatsApp and calls — with every provider’s prices.',
  },
];

export type CustomerSiteGroup = 'customers' | 'ai' | 'inbound' | 'money';

/**
 * The band's four tabs. A group with more than one page shows its pages as pills under the
 * band, so the strip never needs to scroll sideways.
 */
export const CUSTOMER_SITE_GROUPS: {
  key: CustomerSiteGroup;
  label: string;
  icon: ReactNode;
  tabs: CustomerSiteTab[];
}[] = [
  { key: 'customers', label: 'Customers', icon: <Users2 size={15} />, tabs: ['customers'] },
  { key: 'ai', label: 'AI assistant', icon: <Sparkles size={15} />, tabs: ['ai', 'instructions', 'requests', 'voice'] },
  { key: 'inbound', label: 'Inbound', icon: <Inbox size={15} />, tabs: ['numbers', 'inbox'] },
  { key: 'money', label: 'Money', icon: <Coins size={15} />, tabs: ['pricing', 'promo', 'payments', 'costs'] },
];

export function groupOf(tab: CustomerSiteTab): (typeof CUSTOMER_SITE_GROUPS)[number] {
  return CUSTOMER_SITE_GROUPS.find(g => g.tabs.includes(tab)) ?? CUSTOMER_SITE_GROUPS[0];
}

export function tabHref(tab: CustomerSiteTab): string {
  return tab === 'customers' ? '/admin/customers' : `/admin/customers?tab=${tab}`;
}
