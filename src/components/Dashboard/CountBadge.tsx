import type { ReactNode } from 'react';

const TONES = {
  purple: 'text-purple-700 bg-purple-50 border-purple-200',
  amber: 'text-amber-700 bg-amber-50 border-amber-200',
  red: 'text-red-700 bg-red-50 border-red-200',
  // For a count of zero. A coloured badge is a call to action and zero never is
  // one — a red "0 uncompleted" pill was the loudest thing on an otherwise idle
  // row, and it fought the muted treatment those rows now get.
  muted: 'text-muted-foreground bg-muted border-border',
} as const;

export function CountBadge({
  tone,
  children,
}: {
  tone: keyof typeof TONES;
  children: ReactNode;
}) {
  return (
    <span
      className={`text-[10px] font-medium border rounded px-1.5 py-0.5 leading-none ${TONES[tone]}`}
    >
      {children}
    </span>
  );
}
