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
  return (
    <div className="w-full">
      <div className="flex items-center justify-center gap-0">
        {steps.map((step, index) => {
          const isCompleted = index < currentStep;
          const isActive = index === currentStep;

          return (
            <div key={index} className="flex items-center">
              {/* Circle */}
              <div className="flex flex-col items-center gap-1">
                <div
                  className={cn(
                    'flex h-8 w-8 items-center justify-center rounded-full border-2 text-xs font-semibold transition-all',
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
                    'mb-4 h-0.5 w-8 transition-all sm:w-10',
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
