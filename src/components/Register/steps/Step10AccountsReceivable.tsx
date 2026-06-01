import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { FormData } from "../RegisterPage";

const SELECT_CLASS =
  "flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm focus:outline-none focus:ring-1 focus:ring-ring";

const TEXTAREA_CLASS =
  "flex min-h-[72px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm focus:outline-none focus:ring-1 focus:ring-ring placeholder:text-muted-foreground resize-none";

const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const ORDINALS = ["1st", "2nd", "3rd", "4th"];
const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

function ordinalSuffix(n: string) {
  return ["1", "21", "31"].includes(n) ? "st" : ["2", "22"].includes(n) ? "nd" : ["3", "23"].includes(n) ? "rd" : "th";
}

interface Props {
  data: FormData;
  onChange: (patch: Partial<FormData>) => void;
}

interface RuleConfig {
  question: string;
  enabledKey: keyof FormData;
  startDateKey: keyof FormData;
  cycleTypeKey: keyof FormData;
  cycleKey: keyof FormData;
  cycleDayKey: keyof FormData;
  cycleNthKey: keyof FormData;
  noteKey: keyof FormData;
  idPrefix: string;
}

const RULES: RuleConfig[] = [
  {
    question: "Should we handle invoicing?",
    enabledKey: "arInvoicingEnabled",
    startDateKey: "arInvoicingStartDate",
    cycleTypeKey: "arInvoicingCycleType",
    cycleKey: "arInvoicingCycle",
    cycleDayKey: "arInvoicingCycleDay",
    cycleNthKey: "arInvoicingCycleNth",
    noteKey: "arInvoicingNote",
    idPrefix: "ar-inv",
  },
  {
    question: "Should we send statements and notices?",
    enabledKey: "arStatementsEnabled",
    startDateKey: "arStatementsStartDate",
    cycleTypeKey: "arStatementsCycleType",
    cycleKey: "arStatementsCycle",
    cycleDayKey: "arStatementsCycleDay",
    cycleNthKey: "arStatementsCycleNth",
    noteKey: "arStatementsNote",
    idPrefix: "ar-stmt",
  },
  {
    question: "Should we handle collections?",
    enabledKey: "arCollectionEnabled",
    startDateKey: "arCollectionStartDate",
    cycleTypeKey: "arCollectionCycleType",
    cycleKey: "arCollectionCycle",
    cycleDayKey: "arCollectionCycleDay",
    cycleNthKey: "arCollectionCycleNth",
    noteKey: "arCollectionNote",
    idPrefix: "ar-col",
  },
  {
    question: "Should we produce an open invoices report?",
    enabledKey: "arReportEnabled",
    startDateKey: "arReportStartDate",
    cycleTypeKey: "arReportCycleType",
    cycleKey: "arReportCycle",
    cycleDayKey: "arReportCycleDay",
    cycleNthKey: "arReportCycleNth",
    noteKey: "arReportNote",
    idPrefix: "ar-rep",
  },
];

function CyclePicker({
  data,
  onChange,
  rule,
}: {
  data: FormData;
  onChange: (patch: Partial<FormData>) => void;
  rule: RuleConfig;
}) {
  const cycleType = data[rule.cycleTypeKey] as string;
  const cycleDay = String((data[rule.cycleDayKey] as number | null) ?? 1);
  const cycleNth = String((data[rule.cycleNthKey] as number | null) ?? 1);
  const cycle = data[rule.cycleKey] as number;

  return (
    <div className="flex flex-col gap-3 pl-1">
      {/* Starting date */}
      <div className="flex flex-col gap-1.5">
        <Label htmlFor={`${rule.idPrefix}-start-date`}>Starting Date</Label>
        <Input
          id={`${rule.idPrefix}-start-date`}
          type="date"
          value={data[rule.startDateKey] as string}
          onChange={(e) => onChange({ [rule.startDateKey]: e.target.value } as Partial<FormData>)}
        />
        <p className="text-xs text-muted-foreground">Past dates will backfill all todos up to today.</p>
      </div>

      {/* Cycle type */}
      <div className="flex flex-col gap-1.5">
        <Label htmlFor={`${rule.idPrefix}-cycle-type`}>Repeat</Label>
        <select
          id={`${rule.idPrefix}-cycle-type`}
          value={cycleType}
          onChange={(e) =>
            onChange({
              [rule.cycleTypeKey]: e.target.value,
              [rule.cycleDayKey]: null,
              [rule.cycleNthKey]: null,
              [rule.cycleKey]: 30,
            } as Partial<FormData>)
          }
          className={SELECT_CLASS}
        >
          <option value="DAYS">Every N days</option>
          <option value="MONTHLY_DATE">Monthly — specific date</option>
          <option value="WEEKLY_DAY">Weekly — specific day</option>
          <option value="MONTHLY_WEEKDAY">Monthly — Nth weekday</option>
          <option value="QUARTERLY">Quarterly — specific date</option>
          <option value="YEARLY">Yearly — specific date</option>
        </select>
      </div>

      {/* DAYS */}
      {cycleType === "DAYS" && (
        <div className="flex flex-col gap-1.5">
          <Label htmlFor={`${rule.idPrefix}-cycle-days`}>Every (days)</Label>
          <Input
            id={`${rule.idPrefix}-cycle-days`}
            type="number"
            min={1}
            value={cycle}
            onChange={(e) => onChange({ [rule.cycleKey]: Number(e.target.value) || 30 } as Partial<FormData>)}
            placeholder="30"
          />
          <p className="text-xs text-muted-foreground">First todo due in {cycle || 30} days.</p>
        </div>
      )}

      {/* MONTHLY_DATE */}
      {cycleType === "MONTHLY_DATE" && (
        <div className="flex flex-col gap-1.5">
          <Label htmlFor={`${rule.idPrefix}-cycle-date`}>Day of month</Label>
          <select
            id={`${rule.idPrefix}-cycle-date`}
            value={cycleDay}
            onChange={(e) => onChange({ [rule.cycleDayKey]: Number(e.target.value) } as Partial<FormData>)}
            className={SELECT_CLASS}
          >
            {Array.from({ length: 31 }, (_, i) => i + 1).map((d) => (
              <option key={d} value={d}>{d}</option>
            ))}
          </select>
          <p className="text-xs text-muted-foreground">
            Repeats on the {cycleDay}{ordinalSuffix(cycleDay)} of each month.
          </p>
        </div>
      )}

      {/* WEEKLY_DAY */}
      {cycleType === "WEEKLY_DAY" && (
        <div className="flex flex-col gap-1.5">
          <Label htmlFor={`${rule.idPrefix}-cycle-weekday`}>Day of week</Label>
          <select
            id={`${rule.idPrefix}-cycle-weekday`}
            value={cycleDay}
            onChange={(e) => onChange({ [rule.cycleDayKey]: Number(e.target.value) } as Partial<FormData>)}
            className={SELECT_CLASS}
          >
            {WEEKDAYS.map((d, i) => (
              <option key={i} value={i}>{d}</option>
            ))}
          </select>
          <p className="text-xs text-muted-foreground">Repeats every {WEEKDAYS[Number(cycleDay)]}.</p>
        </div>
      )}

      {/* MONTHLY_WEEKDAY */}
      {cycleType === "MONTHLY_WEEKDAY" && (
        <div className="flex flex-col gap-3">
          <div className="flex gap-3">
            <div className="flex flex-col gap-1.5 flex-1">
              <Label htmlFor={`${rule.idPrefix}-cycle-nth`}>Which</Label>
              <select
                id={`${rule.idPrefix}-cycle-nth`}
                value={cycleNth}
                onChange={(e) => onChange({ [rule.cycleNthKey]: Number(e.target.value) } as Partial<FormData>)}
                className={SELECT_CLASS}
              >
                {ORDINALS.map((o, i) => (
                  <option key={i + 1} value={i + 1}>{o}</option>
                ))}
              </select>
            </div>
            <div className="flex flex-col gap-1.5 flex-1">
              <Label htmlFor={`${rule.idPrefix}-cycle-mwd`}>Weekday</Label>
              <select
                id={`${rule.idPrefix}-cycle-mwd`}
                value={cycleDay}
                onChange={(e) => onChange({ [rule.cycleDayKey]: Number(e.target.value) } as Partial<FormData>)}
                className={SELECT_CLASS}
              >
                {WEEKDAYS.map((d, i) => (
                  <option key={i} value={i}>{d}</option>
                ))}
              </select>
            </div>
          </div>
          <p className="text-xs text-muted-foreground">
            Repeats on the {ORDINALS[Number(cycleNth) - 1]} {WEEKDAYS[Number(cycleDay)]} of each month.
          </p>
        </div>
      )}

      {/* QUARTERLY */}
      {cycleType === "QUARTERLY" && (
        <div className="flex flex-col gap-1.5">
          <Label htmlFor={`${rule.idPrefix}-cycle-quarterly`}>Day of month</Label>
          <select
            id={`${rule.idPrefix}-cycle-quarterly`}
            value={cycleDay}
            onChange={(e) => onChange({ [rule.cycleDayKey]: Number(e.target.value) } as Partial<FormData>)}
            className={SELECT_CLASS}
          >
            {Array.from({ length: 31 }, (_, i) => i + 1).map((d) => (
              <option key={d} value={d}>{d}</option>
            ))}
          </select>
          <p className="text-xs text-muted-foreground">
            Repeats every 3 months on the {cycleDay}{ordinalSuffix(cycleDay)}.
          </p>
        </div>
      )}

      {/* YEARLY */}
      {cycleType === "YEARLY" && (
        <div className="flex flex-col gap-3">
          <div className="flex gap-3">
            <div className="flex flex-col gap-1.5 flex-1">
              <Label htmlFor={`${rule.idPrefix}-cycle-yearly-month`}>Month</Label>
              <select
                id={`${rule.idPrefix}-cycle-yearly-month`}
                value={cycleNth}
                onChange={(e) => onChange({ [rule.cycleNthKey]: Number(e.target.value) } as Partial<FormData>)}
                className={SELECT_CLASS}
              >
                {MONTHS.map((m, i) => (
                  <option key={i + 1} value={i + 1}>{m}</option>
                ))}
              </select>
            </div>
            <div className="flex flex-col gap-1.5 flex-1">
              <Label htmlFor={`${rule.idPrefix}-cycle-yearly-day`}>Day</Label>
              <select
                id={`${rule.idPrefix}-cycle-yearly-day`}
                value={cycleDay}
                onChange={(e) => onChange({ [rule.cycleDayKey]: Number(e.target.value) } as Partial<FormData>)}
                className={SELECT_CLASS}
              >
                {Array.from({ length: 31 }, (_, i) => i + 1).map((d) => (
                  <option key={d} value={d}>{d}</option>
                ))}
              </select>
            </div>
          </div>
          <p className="text-xs text-muted-foreground">
            Repeats every year on {MONTHS[Number(cycleNth) - 1]} {cycleDay}{ordinalSuffix(cycleDay)}.
          </p>
        </div>
      )}

      {/* Note (optional) */}
      <div className="flex flex-col gap-1.5">
        <Label htmlFor={`${rule.idPrefix}-note`}>Note <span className="text-muted-foreground font-normal">(optional)</span></Label>
        <textarea
          id={`${rule.idPrefix}-note`}
          value={data[rule.noteKey] as string}
          onChange={(e) => onChange({ [rule.noteKey]: e.target.value } as Partial<FormData>)}
          placeholder="Any additional instructions..."
          className={TEXTAREA_CLASS}
        />
      </div>
    </div>
  );
}

export function Step10AccountsReceivable({ data, onChange }: Props) {
  return (
    <div className="flex flex-col gap-8">
      {RULES.map((rule) => {
        const enabled = data[rule.enabledKey] as boolean | null;
        return (
          <div key={rule.idPrefix} className="flex flex-col gap-3">
            <p className="text-sm font-medium text-foreground">{rule.question}</p>

            <div className="grid grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => onChange({ [rule.enabledKey]: true } as Partial<FormData>)}
                className={cn(
                  "flex flex-col items-center gap-2 rounded-xl border-2 p-5 text-sm font-medium transition-all",
                  enabled === true
                    ? "border-primary bg-primary/5 text-primary"
                    : "border-border bg-background text-foreground hover:border-primary/40 hover:bg-muted/30",
                )}
              >
                <span className="text-2xl">✓</span>
                Yes
              </button>
              <button
                type="button"
                onClick={() => onChange({ [rule.enabledKey]: false } as Partial<FormData>)}
                className={cn(
                  "flex flex-col items-center gap-2 rounded-xl border-2 p-5 text-sm font-medium transition-all",
                  enabled === false
                    ? "border-primary bg-primary/5 text-primary"
                    : "border-border bg-background text-foreground hover:border-primary/40 hover:bg-muted/30",
                )}
              >
                <span className="text-2xl">✕</span>
                No
              </button>
            </div>

            {enabled === true && (
              <CyclePicker data={data} onChange={onChange} rule={rule} />
            )}
          </div>
        );
      })}
    </div>
  );
}
