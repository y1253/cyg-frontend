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

interface CyclePickerConfig {
  cycleTypeKey: keyof FormData;
  cycleKey: keyof FormData;
  cycleDayKey: keyof FormData;
  cycleNthKey: keyof FormData;
  noteKey: keyof FormData;
  idPrefix: string;
}

function CyclePicker({
  data,
  onChange,
  config,
}: {
  data: FormData;
  onChange: (patch: Partial<FormData>) => void;
  config: CyclePickerConfig;
}) {
  const cycleType = data[config.cycleTypeKey] as string;
  const cycleDay = String((data[config.cycleDayKey] as number | null) ?? 1);
  const cycleNth = String((data[config.cycleNthKey] as number | null) ?? 1);
  const cycle = data[config.cycleKey] as number;

  return (
    <div className="flex flex-col gap-3 pl-1">
      <div className="flex flex-col gap-1.5">
        <Label htmlFor={`${config.idPrefix}-cycle-type`}>Repeat</Label>
        <select
          id={`${config.idPrefix}-cycle-type`}
          value={cycleType}
          onChange={(e) =>
            onChange({
              [config.cycleTypeKey]: e.target.value,
              [config.cycleDayKey]: null,
              [config.cycleNthKey]: null,
              [config.cycleKey]: 30,
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

      {cycleType === "DAYS" && (
        <div className="flex flex-col gap-1.5">
          <Label htmlFor={`${config.idPrefix}-cycle-days`}>Every (days)</Label>
          <Input
            id={`${config.idPrefix}-cycle-days`}
            type="number"
            min={1}
            value={cycle}
            onChange={(e) => onChange({ [config.cycleKey]: Number(e.target.value) || 30 } as Partial<FormData>)}
            placeholder="30"
          />
          <p className="text-xs text-muted-foreground">First todo due in {cycle || 30} days.</p>
        </div>
      )}

      {cycleType === "MONTHLY_DATE" && (
        <div className="flex flex-col gap-1.5">
          <Label htmlFor={`${config.idPrefix}-cycle-date`}>Day of month</Label>
          <select
            id={`${config.idPrefix}-cycle-date`}
            value={cycleDay}
            onChange={(e) => onChange({ [config.cycleDayKey]: Number(e.target.value) } as Partial<FormData>)}
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

      {cycleType === "WEEKLY_DAY" && (
        <div className="flex flex-col gap-1.5">
          <Label htmlFor={`${config.idPrefix}-cycle-weekday`}>Day of week</Label>
          <select
            id={`${config.idPrefix}-cycle-weekday`}
            value={cycleDay}
            onChange={(e) => onChange({ [config.cycleDayKey]: Number(e.target.value) } as Partial<FormData>)}
            className={SELECT_CLASS}
          >
            {WEEKDAYS.map((d, i) => (
              <option key={i} value={i}>{d}</option>
            ))}
          </select>
          <p className="text-xs text-muted-foreground">Repeats every {WEEKDAYS[Number(cycleDay)]}.</p>
        </div>
      )}

      {cycleType === "MONTHLY_WEEKDAY" && (
        <div className="flex flex-col gap-3">
          <div className="flex gap-3">
            <div className="flex flex-col gap-1.5 flex-1">
              <Label htmlFor={`${config.idPrefix}-cycle-nth`}>Which</Label>
              <select
                id={`${config.idPrefix}-cycle-nth`}
                value={cycleNth}
                onChange={(e) => onChange({ [config.cycleNthKey]: Number(e.target.value) } as Partial<FormData>)}
                className={SELECT_CLASS}
              >
                {ORDINALS.map((o, i) => (
                  <option key={i + 1} value={i + 1}>{o}</option>
                ))}
              </select>
            </div>
            <div className="flex flex-col gap-1.5 flex-1">
              <Label htmlFor={`${config.idPrefix}-cycle-mwd`}>Weekday</Label>
              <select
                id={`${config.idPrefix}-cycle-mwd`}
                value={cycleDay}
                onChange={(e) => onChange({ [config.cycleDayKey]: Number(e.target.value) } as Partial<FormData>)}
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

      {cycleType === "QUARTERLY" && (
        <div className="flex flex-col gap-1.5">
          <Label htmlFor={`${config.idPrefix}-cycle-quarterly`}>Day of month</Label>
          <select
            id={`${config.idPrefix}-cycle-quarterly`}
            value={cycleDay}
            onChange={(e) => onChange({ [config.cycleDayKey]: Number(e.target.value) } as Partial<FormData>)}
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

      {cycleType === "YEARLY" && (
        <div className="flex flex-col gap-3">
          <div className="flex gap-3">
            <div className="flex flex-col gap-1.5 flex-1">
              <Label htmlFor={`${config.idPrefix}-cycle-yearly-month`}>Month</Label>
              <select
                id={`${config.idPrefix}-cycle-yearly-month`}
                value={cycleNth}
                onChange={(e) => onChange({ [config.cycleNthKey]: Number(e.target.value) } as Partial<FormData>)}
                className={SELECT_CLASS}
              >
                {MONTHS.map((m, i) => (
                  <option key={i + 1} value={i + 1}>{m}</option>
                ))}
              </select>
            </div>
            <div className="flex flex-col gap-1.5 flex-1">
              <Label htmlFor={`${config.idPrefix}-cycle-yearly-day`}>Day</Label>
              <select
                id={`${config.idPrefix}-cycle-yearly-day`}
                value={cycleDay}
                onChange={(e) => onChange({ [config.cycleDayKey]: Number(e.target.value) } as Partial<FormData>)}
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

      <div className="flex flex-col gap-1.5">
        <Label htmlFor={`${config.idPrefix}-note`}>
          Note <span className="text-muted-foreground font-normal">(optional)</span>
        </Label>
        <textarea
          id={`${config.idPrefix}-note`}
          value={data[config.noteKey] as string}
          onChange={(e) => onChange({ [config.noteKey]: e.target.value } as Partial<FormData>)}
          placeholder="Any additional instructions..."
          className={TEXTAREA_CLASS}
        />
      </div>
    </div>
  );
}

const PAYROLL_CYCLE_CONFIG: CyclePickerConfig = {
  cycleTypeKey: "payrollCycleType",
  cycleKey: "payrollCycle",
  cycleDayKey: "payrollCycleDay",
  cycleNthKey: "payrollCycleNth",
  noteKey: "payrollNote",
  idPrefix: "pr",
};

const PAYROLL_TAX_CYCLE_CONFIG: CyclePickerConfig = {
  cycleTypeKey: "payrollTaxCycleType",
  cycleKey: "payrollTaxCycle",
  cycleDayKey: "payrollTaxCycleDay",
  cycleNthKey: "payrollTaxCycleNth",
  noteKey: "payrollTaxNote",
  idPrefix: "pr-tax",
};

export function Step11Payroll({ data, onChange }: Props) {
  const isCanada = data.country === 'CANADA';

  return (
    <div className="flex flex-col gap-8">
      {/* Section 1 — Payroll Management */}
      <div className="flex flex-col gap-3">
        <p className="text-sm font-medium text-foreground">Should we prepare payroll checks?</p>
        <div className="grid grid-cols-2 gap-3">
          <button
            type="button"
            onClick={() => onChange({ payrollEnabled: true })}
            className={cn(
              "flex flex-col items-center gap-2 rounded-xl border-2 p-5 text-sm font-medium transition-all",
              data.payrollEnabled === true
                ? "border-primary bg-primary/5 text-primary"
                : "border-border bg-background text-foreground hover:border-primary/40 hover:bg-muted/30",
            )}
          >
            <span className="text-2xl">✓</span>
            Yes
          </button>
          <button
            type="button"
            onClick={() => onChange({ payrollEnabled: false })}
            className={cn(
              "flex flex-col items-center gap-2 rounded-xl border-2 p-5 text-sm font-medium transition-all",
              data.payrollEnabled === false
                ? "border-primary bg-primary/5 text-primary"
                : "border-border bg-background text-foreground hover:border-primary/40 hover:bg-muted/30",
            )}
          >
            <span className="text-2xl">✕</span>
            No
          </button>
        </div>

        {data.payrollEnabled === true && (
          <CyclePicker data={data} onChange={onChange} config={PAYROLL_CYCLE_CONFIG} />
        )}
      </div>

      {/* Section 2 — Payroll Tax Filing (Canada only) */}
      {isCanada && (
        <div className="flex flex-col gap-3">
          <p className="text-sm font-medium text-foreground">Should we handle payroll tax filing?</p>
          <div className="grid grid-cols-2 gap-3">
            <button
              type="button"
              onClick={() => onChange({ payrollTaxEnabled: true })}
              className={cn(
                "flex flex-col items-center gap-2 rounded-xl border-2 p-5 text-sm font-medium transition-all",
                data.payrollTaxEnabled === true
                  ? "border-primary bg-primary/5 text-primary"
                  : "border-border bg-background text-foreground hover:border-primary/40 hover:bg-muted/30",
              )}
            >
              <span className="text-2xl">✓</span>
              Yes
            </button>
            <button
              type="button"
              onClick={() => onChange({ payrollTaxEnabled: false, payrollTaxRegion: null })}
              className={cn(
                "flex flex-col items-center gap-2 rounded-xl border-2 p-5 text-sm font-medium transition-all",
                data.payrollTaxEnabled === false
                  ? "border-primary bg-primary/5 text-primary"
                  : "border-border bg-background text-foreground hover:border-primary/40 hover:bg-muted/30",
              )}
            >
              <span className="text-2xl">✕</span>
              No
            </button>
          </div>

          {data.payrollTaxEnabled === true && (
            <div className="flex flex-col gap-4 pl-1">
              <div className="flex flex-col gap-1.5">
                <p className="text-sm font-medium text-foreground">Which type?</p>
                <div className="grid grid-cols-2 gap-3">
                  <button
                    type="button"
                    onClick={() => onChange({ payrollTaxRegion: 'CAD' })}
                    className={cn(
                      "flex flex-col items-center gap-1 rounded-xl border-2 p-4 text-sm font-medium transition-all",
                      data.payrollTaxRegion === 'CAD'
                        ? "border-primary bg-primary/5 text-primary"
                        : "border-border bg-background text-foreground hover:border-primary/40 hover:bg-muted/30",
                    )}
                  >
                    🍁 Canadian
                  </button>
                  <button
                    type="button"
                    onClick={() => onChange({ payrollTaxRegion: 'QC' })}
                    className={cn(
                      "flex flex-col items-center gap-1 rounded-xl border-2 p-4 text-sm font-medium transition-all",
                      data.payrollTaxRegion === 'QC'
                        ? "border-primary bg-primary/5 text-primary"
                        : "border-border bg-background text-foreground hover:border-primary/40 hover:bg-muted/30",
                    )}
                  >
                    🏙️ Quebec
                  </button>
                </div>
              </div>

              {data.payrollTaxRegion && (
                <CyclePicker data={data} onChange={onChange} config={PAYROLL_TAX_CYCLE_CONFIG} />
              )}
            </div>
          )}
        </div>
      )}

      {/* Section 3 — Payroll Year End (Canada only) */}
      {isCanada && (
        <div className="flex flex-col gap-3">
          <p className="text-sm font-medium text-foreground">Should we handle payroll year-end filing?</p>
          <div className="grid grid-cols-2 gap-3">
            <button
              type="button"
              onClick={() => onChange({ payrollYearEndEnabled: true })}
              className={cn(
                "flex flex-col items-center gap-2 rounded-xl border-2 p-5 text-sm font-medium transition-all",
                data.payrollYearEndEnabled === true
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
                onChange({
                  payrollYearEndEnabled: false,
                  payrollYearEndRl1: false,
                  payrollYearEndT4: false,
                  payrollYearEndCnesst: false,
                })
              }
              className={cn(
                "flex flex-col items-center gap-2 rounded-xl border-2 p-5 text-sm font-medium transition-all",
                data.payrollYearEndEnabled === false
                  ? "border-primary bg-primary/5 text-primary"
                  : "border-border bg-background text-foreground hover:border-primary/40 hover:bg-muted/30",
              )}
            >
              <span className="text-2xl">✕</span>
              No
            </button>
          </div>

          {data.payrollYearEndEnabled === true && (
            <div className="flex flex-col gap-3 pl-1">
              <p className="text-xs text-muted-foreground">Select all that apply. Year-end tasks are scheduled annually on January 15.</p>
              {(
                [
                  { label: "RL-1 and Summary", key: "payrollYearEndRl1" as keyof FormData },
                  { label: "T4 and T4A and Summaries", key: "payrollYearEndT4" as keyof FormData },
                  { label: "CNESST Statement of Wages", key: "payrollYearEndCnesst" as keyof FormData },
                ] as const
              ).map(({ label, key }) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => onChange({ [key]: !data[key] } as Partial<FormData>)}
                  className={cn(
                    "flex items-center gap-3 rounded-xl border-2 px-4 py-3 text-sm font-medium text-left transition-all",
                    data[key]
                      ? "border-primary bg-primary/5 text-primary"
                      : "border-border bg-background text-foreground hover:border-primary/40 hover:bg-muted/30",
                  )}
                >
                  <span className="text-base">{data[key] ? "✓" : "○"}</span>
                  {label}
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
