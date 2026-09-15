import { useEffect, useRef } from 'react';
import { Check } from 'lucide-react';
import { cn } from '@/lib/utils';

interface StepConfig {
  label: string;
}

interface Props {
  steps: StepConfig[];
  currentStep: number;
}

export function StepIndicator({ steps, currentStep }: Props) {
  const activeRef = useRef<HTMLDivElement>(null);

  /**
   * Keep the current step on screen.
   *
   * The rail is ~84px per step, so fourteen of them need ~1176px — and its container is
   * `max-w-xl` (576px). It has therefore NEVER fitted, at any window size: it was simply
   * clipped at both ends, which on a phone meant the step you are actually on was often
   * the one you could not see. Scrolling is what makes the rail honest; this keeps the
   * active circle centred as the wizard advances.
   */
  useEffect(() => {
    activeRef.current?.scrollIntoView({
      behavior: 'smooth',
      block: 'nearest',
      inline: 'center',
    });
  }, [currentStep]);

  return (
    <div className="w-full">
      {/* A count, because a scrolled rail no longer shows how far along you are at a
          glance. Small screens only — the rail says it well enough when most of it is
          visible. */}
      <p className="mb-2 text-center text-[11px] text-muted-foreground sm:hidden">
        Step {currentStep + 1} of {steps.length} ·{' '}
        <span className="font-medium text-foreground">
          {steps[currentStep]?.label}
        </span>
      </p>
      {/* ⚠️ justify-START, never justify-center. A centred flex row whose content
          overflows is clipped at BOTH ends and cannot be scrolled back to the start —
          which is how step 1 ended up off-screen while step 1 was the active one. */}
      <div className="flex items-center justify-start gap-0 overflow-x-auto overscroll-x-contain px-1 pb-1 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {steps.map((step, index) => {
          const isCompleted = index < currentStep;
          const isActive = index === currentStep;

          return (
            <div
              key={index}
              ref={isActive ? activeRef : undefined}
              className="flex shrink-0 items-center"
            >
              {/* Circle */}
              <div className="flex flex-col items-center gap-1">
                <div
                  className={cn(
                    'flex h-8 w-8 shrink-0 items-center justify-center rounded-full border-2 text-xs font-semibold transition-all',
                    isCompleted &&
                      'border-primary bg-primary text-primary-foreground',
                    isActive &&
                      'border-primary bg-primary text-primary-foreground ring-4 ring-primary/20',
                    !isCompleted &&
                      !isActive &&
                      'border-muted-foreground/30 bg-background text-muted-foreground/50',
                  )}
                >
                  {isCompleted ? <Check size={14} strokeWidth={2.5} /> : index + 1}
                </div>
                <span
                  className={cn(
                    'hidden w-16 text-center text-[10px] leading-tight sm:block',
                    isActive ? 'font-medium text-foreground' : 'text-muted-foreground',
                  )}
                >
                  {step.label}
                </span>
              </div>

              {/* Connector line */}
              {index < steps.length - 1 && (
                <div
                  className={cn(
                    'mb-4 h-0.5 w-8 shrink-0 transition-all sm:w-10',
                    index < currentStep ? 'bg-primary' : 'bg-muted-foreground/20',
                  )}
                />
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
