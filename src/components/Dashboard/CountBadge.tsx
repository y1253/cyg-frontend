import type { ReactNode } from 'react';

const TONES = {
  purple: 'text-purple-700 bg-purple-50 border-purple-200',
  amber: 'text-amber-700 bg-amber-50 border-amber-200',
  red: 'text-red-700 bg-red-50 border-red-200',
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
