import type { ReactNode } from 'react';
import { Coins, CreditCard, Lightbulb, Mail, MessageSquareText, Phone, PhoneCall, Receipt, ShieldAlert, Sparkles, Tag, Users2 } from 'lucide-react';

/** The Customer site area's sections, in `?tab=` order (`CustomerSiteShell`). */
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
  | 'costs'
  | 'phone-costs';

export const CUSTOMER_SITE_TABS: {
  key: CustomerSiteTab;
  label: string;
  icon: ReactNode;
  blurb: string;
}[] = [
  {
    key: 'customers',
    label: 'Customers',
    icon: <Users2 size={15} />,
    blurb: 'Everyone who signed up on cygfinance.com, and the bookkeeping they did there.',
  },
  {
    key: 'numbers',
    label: 'Text numbers',
    icon: <MessageSquareText size={15} />,
    blurb: 'Numbers customers text their receipts to. Every connected number is shown on cygfinance.com.',
  },
  {
    key: 'inbox',
    label: 'Customer inbox',
    icon: <Mail size={15} />,
    blurb: 'The mailbox customers email statements, receipts and questions to — the AI answers in the thread.',
  },
  {
    key: 'ai',
    label: 'AI rules',
    icon: <Sparkles size={15} />,
    blurb: 'Rules the AI assistant learned from customer chats. Firm-wide ones wait here for your approval.',
  },
  {
    key: 'instructions',
    label: 'AI instructions',
    icon: <ShieldAlert size={15} />,
    blurb: 'What the AI is told, the problems customers reported, and every fix the strong AI made — revert any of them.',
  },
  {
    key: 'requests',
    label: 'Feature requests',
    icon: <Lightbulb size={15} />,
    blurb: 'Things customers asked the AI for that we don’t do yet — mark them, and the customer is told when it’s done.',
  },
  {
    key: 'voice',
    label: 'AI phone',
    icon: <Phone size={15} />,
    blurb: 'Customers can call the receipt numbers and talk to the AI assistant — pick its voice here.',
  },
  {
    key: 'pricing',
    label: 'Pricing',
    icon: <CreditCard size={15} />,
    blurb: 'What a customer pays to Generate — live on cygfinance.com as soon as you save.',
  },
  {
    key: 'promo',
    label: 'Promo codes',
    icon: <Tag size={15} />,
    blurb: 'Discounts customers enter before paying: a percentage off, or a fixed price.',
  },
  {
    key: 'payments',
    label: 'Payments',
    icon: <Receipt size={15} />,
    blurb: 'Every Generate a customer paid for (or got free with a promo code).',
  },
  {
    key: 'costs',
    label: 'AI costs',
    icon: <Coins size={15} />,
    blurb: 'What each customer costs us in OpenAI — every AI call with its tokens and price, and the price of each model.',
  },
  {
    key: 'phone-costs',
    label: 'Phone & text costs',
    icon: <PhoneCall size={15} />,
    blurb: 'What each customer costs us in SignalWire and WhatsApp — every text, WhatsApp and call with its price, and each provider’s prices.',
  },
];
