import { cn } from "@/lib/utils";
import type { FormData } from "../RegisterPage";

const TEXTAREA_CLASS =
  "flex min-h-[72px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm focus:outline-none focus:ring-1 focus:ring-ring placeholder:text-muted-foreground resize-none";

interface Props {
  data: FormData;
  onChange: (patch: Partial<FormData>) => void;
}

interface DocRule {
  question: string;
  enabledKey: keyof FormData;
  noteKey: keyof FormData;
}

const CANADIAN_DOC_RULES: DocRule[] = [
  {
    question: "Should we manage Revenue QC government documents?",
    enabledKey: "qcDocsEnabled",
    noteKey: "qcDocsNote",
  },
  {
    question: "Should we manage CRA government documents?",
    enabledKey: "craDocsEnabled",
    noteKey: "craDocsNote",
  },
  {
    question: "Should we handle sales tax filing?",
    enabledKey: "salesTaxEnabled",
    noteKey: "salesTaxNote",
  },
];

export function Step12General({ data, onChange }: Props) {
  const isCanada = data.country === "CANADA";

  return (
    <div className="flex flex-col gap-8">
      {/* Section 1 — Location visit (all companies) */}
      <div className="flex flex-col gap-3">
        <p className="text-sm font-medium text-foreground">
          Should we come down to your location to go over the books with you?
        </p>
        <div className="grid grid-cols-2 gap-3">
          <button
            type="button"
            onClick={() => onChange({ locationVisitEnabled: true })}
            className={cn(
              "flex flex-col items-center gap-2 rounded-xl border-2 p-5 text-sm font-medium transition-all",
              data.locationVisitEnabled === true
                ? "border-primary bg-primary/5 text-primary"
                : "border-border bg-background text-foreground hover:border-primary/40 hover:bg-muted/30",
            )}
          >
            <span className="text-2xl">✓</span>
            Yes
          </button>
          <button
            type="button"
            onClick={() => onChange({ locationVisitEnabled: false, locationVisitFrequency: null })}
            className={cn(
              "flex flex-col items-center gap-2 rounded-xl border-2 p-5 text-sm font-medium transition-all",
              data.locationVisitEnabled === false
                ? "border-primary bg-primary/5 text-primary"
                : "border-border bg-background text-foreground hover:border-primary/40 hover:bg-muted/30",
            )}
          >
            <span className="text-2xl">✕</span>
            No
          </button>
        </div>

        {data.locationVisitEnabled === true && (
          <div className="flex flex-col gap-2 pl-1">
            <p className="text-sm text-muted-foreground">How often?</p>
            <div className="grid grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => onChange({ locationVisitFrequency: "monthly" })}
                className={cn(
                  "flex flex-col items-center gap-1 rounded-xl border-2 p-4 text-sm font-medium transition-all",
                  data.locationVisitFrequency === "monthly"
                    ? "border-primary bg-primary/5 text-primary"
                    : "border-border bg-background text-foreground hover:border-primary/40 hover:bg-muted/30",
                )}
              >
                📅 Monthly
              </button>
              <button
                type="button"
                onClick={() => onChange({ locationVisitFrequency: "quarterly" })}
                className={cn(
                  "flex flex-col items-center gap-1 rounded-xl border-2 p-4 text-sm font-medium transition-all",
                  data.locationVisitFrequency === "quarterly"
                    ? "border-primary bg-primary/5 text-primary"
                    : "border-border bg-background text-foreground hover:border-primary/40 hover:bg-muted/30",
                )}
              >
                🗓️ Quarterly
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Section 2 — Canadian-only doc/tax rules */}
      {isCanada &&
        CANADIAN_DOC_RULES.map((rule) => (
          <div key={rule.enabledKey} className="flex flex-col gap-3">
            <p className="text-sm font-medium text-foreground">{rule.question}</p>
            <div className="grid grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => onChange({ [rule.enabledKey]: true } as Partial<FormData>)}
                className={cn(
                  "flex flex-col items-center gap-2 rounded-xl border-2 p-5 text-sm font-medium transition-all",
                  data[rule.enabledKey] === true
                    ? "border-primary bg-primary/5 text-primary"
                    : "border-border bg-background text-foreground hover:border-primary/40 hover:bg-muted/30",
                )}
              >
                <span className="text-2xl">✓</span>
                Yes
              </button>
              <button
                type="button"
                onClick={() =>
                  onChange({ [rule.enabledKey]: false, [rule.noteKey]: "" } as Partial<FormData>)
                }
                className={cn(
                  "flex flex-col items-center gap-2 rounded-xl border-2 p-5 text-sm font-medium transition-all",
                  data[rule.enabledKey] === false
                    ? "border-primary bg-primary/5 text-primary"
                    : "border-border bg-background text-foreground hover:border-primary/40 hover:bg-muted/30",
                )}
              >
                <span className="text-2xl">✕</span>
                No
              </button>
            </div>

            {data[rule.enabledKey] === true && (
              <div className="pl-1">
                <textarea
                  value={data[rule.noteKey] as string}
                  onChange={(e) =>
                    onChange({ [rule.noteKey]: e.target.value } as Partial<FormData>)
                  }
                  placeholder="Any additional instructions… (optional)"
                  className={TEXTAREA_CLASS}
                />
              </div>
            )}
          </div>
        ))}
    </div>
  );
}
