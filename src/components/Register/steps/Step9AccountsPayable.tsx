import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { FormData } from "../RegisterPage";

const SELECT_CLASS =
  "flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm focus:outline-none focus:ring-1 focus:ring-ring";

const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const ORDINALS = ["1st", "2nd", "3rd", "4th"];
const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

interface Props {
  data: FormData;
  onChange: (patch: Partial<FormData>) => void;
}

export function Step9AccountsPayable({ data, onChange }: Props) {
  const cycleType = data.apCycleType;
  const cycleDay = String(data.apCycleDay ?? 1);
  const cycleNth = String(data.apCycleNth ?? 1);

  return (
    <div className="flex flex-col gap-6">
      {/* Yes / No question */}
      <div>
        <p className="mb-3 text-sm font-medium text-foreground">
          Should we enter the bills?
        </p>
        <div className="grid grid-cols-2 gap-3">
          <button
            type="button"
            onClick={() => onChange({ apManageBills: true })}
            className={cn(
              "flex flex-col items-center gap-2 rounded-xl border-2 p-5 text-sm font-medium transition-all",
              data.apManageBills === true
                ? "border-primary bg-primary/5 text-primary"
                : "border-border bg-background text-foreground hover:border-primary/40 hover:bg-muted/30",
            )}
          >
            <span className="text-2xl">✓</span>
            Yes
          </button>
          <button
            type="button"
            onClick={() => onChange({ apManageBills: false })}
            className={cn(
              "flex flex-col items-center gap-2 rounded-xl border-2 p-5 text-sm font-medium transition-all",
              data.apManageBills === false
                ? "border-primary bg-primary/5 text-primary"
                : "border-border bg-background text-foreground hover:border-primary/40 hover:bg-muted/30",
            )}
          >
            <span className="text-2xl">✕</span>
            No
          </button>
        </div>
      </div>

      {/* Cycle configuration — only when YES */}
      {data.apManageBills === true && (
        <div className="flex flex-col gap-4">
          {/* Starting date */}
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="ap-start-date">
              Starting Date <span className="text-destructive">*</span>
            </Label>
            <Input
              id="ap-start-date"
              type="date"
              value={data.apStartDate}
              onChange={(e) => onChange({ apStartDate: e.target.value })}
            />
          </div>

          {/* Cycle type */}
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="ap-cycle-type">Repeat</Label>
            <select
              id="ap-cycle-type"
              value={cycleType}
              onChange={(e) =>
                onChange({
                  apCycleType: e.target.value,
                  apCycleDay: null,
                  apCycleNth: null,
                  apCycle: 30,
                })
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
              <Label htmlFor="ap-cycle-days">Every (days)</Label>
              <Input
                id="ap-cycle-days"
                type="number"
                min={1}
                value={data.apCycle}
                onChange={(e) => onChange({ apCycle: Number(e.target.value) || 30 })}
                placeholder="30"
              />
              <p className="text-xs text-muted-foreground">
                First todo due in {data.apCycle || 30} days from the starting date.
              </p>
            </div>
          )}

          {/* MONTHLY_DATE */}
          {cycleType === "MONTHLY_DATE" && (
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="ap-cycle-date">Day of month</Label>
              <select
                id="ap-cycle-date"
                value={cycleDay}
                onChange={(e) => onChange({ apCycleDay: Number(e.target.value) })}
                className={SELECT_CLASS}
              >
                {Array.from({ length: 31 }, (_, i) => i + 1).map((d) => (
                  <option key={d} value={d}>{d}</option>
                ))}
              </select>
              <p className="text-xs text-muted-foreground">
                Repeats on the {cycleDay}{["1","21","31"].includes(cycleDay) ? "st" : ["2","22"].includes(cycleDay) ? "nd" : ["3","23"].includes(cycleDay) ? "rd" : "th"} of each month.
              </p>
            </div>
          )}

          {/* WEEKLY_DAY */}
          {cycleType === "WEEKLY_DAY" && (
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="ap-cycle-weekday">Day of week</Label>
              <select
                id="ap-cycle-weekday"
                value={cycleDay}
                onChange={(e) => onChange({ apCycleDay: Number(e.target.value) })}
                className={SELECT_CLASS}
              >
                {WEEKDAYS.map((d, i) => (
                  <option key={i} value={i}>{d}</option>
                ))}
              </select>
              <p className="text-xs text-muted-foreground">
                Repeats every {WEEKDAYS[Number(cycleDay)]}.
              </p>
            </div>
          )}

          {/* MONTHLY_WEEKDAY */}
          {cycleType === "MONTHLY_WEEKDAY" && (
            <div className="flex flex-col gap-3">
              <div className="flex gap-3">
                <div className="flex flex-col gap-1.5 flex-1">
                  <Label htmlFor="ap-cycle-nth">Which</Label>
                  <select
                    id="ap-cycle-nth"
                    value={cycleNth}
                    onChange={(e) => onChange({ apCycleNth: Number(e.target.value) })}
                    className={SELECT_CLASS}
                  >
                    {ORDINALS.map((o, i) => (
                      <option key={i + 1} value={i + 1}>{o}</option>
                    ))}
                  </select>
                </div>
                <div className="flex flex-col gap-1.5 flex-1">
                  <Label htmlFor="ap-cycle-mwd">Weekday</Label>
                  <select
                    id="ap-cycle-mwd"
                    value={cycleDay}
                    onChange={(e) => onChange({ apCycleDay: Number(e.target.value) })}
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
              <Label htmlFor="ap-cycle-quarterly">Day of month</Label>
              <select
                id="ap-cycle-quarterly"
                value={cycleDay}
                onChange={(e) => onChange({ apCycleDay: Number(e.target.value) })}
                className={SELECT_CLASS}
              >
                {Array.from({ length: 31 }, (_, i) => i + 1).map((d) => (
                  <option key={d} value={d}>{d}</option>
                ))}
              </select>
              <p className="text-xs text-muted-foreground">
                Repeats every 3 months on the {cycleDay}{["1","21","31"].includes(cycleDay) ? "st" : ["2","22"].includes(cycleDay) ? "nd" : ["3","23"].includes(cycleDay) ? "rd" : "th"}.
              </p>
            </div>
          )}

          {/* YEARLY */}
          {cycleType === "YEARLY" && (
            <div className="flex flex-col gap-3">
              <div className="flex gap-3">
                <div className="flex flex-col gap-1.5 flex-1">
                  <Label htmlFor="ap-cycle-yearly-month">Month</Label>
                  <select
                    id="ap-cycle-yearly-month"
                    value={cycleNth}
                    onChange={(e) => onChange({ apCycleNth: Number(e.target.value) })}
                    className={SELECT_CLASS}
                  >
                    {MONTHS.map((m, i) => (
                      <option key={i + 1} value={i + 1}>{m}</option>
                    ))}
                  </select>
                </div>
                <div className="flex flex-col gap-1.5 flex-1">
                  <Label htmlFor="ap-cycle-yearly-day">Day</Label>
                  <select
                    id="ap-cycle-yearly-day"
                    value={cycleDay}
                    onChange={(e) => onChange({ apCycleDay: Number(e.target.value) })}
                    className={SELECT_CLASS}
                  >
                    {Array.from({ length: 31 }, (_, i) => i + 1).map((d) => (
                      <option key={d} value={d}>{d}</option>
                    ))}
                  </select>
                </div>
              </div>
              <p className="text-xs text-muted-foreground">
                Repeats every year on {MONTHS[Number(cycleNth) - 1]} {cycleDay}{["1","21","31"].includes(cycleDay) ? "st" : ["2","22"].includes(cycleDay) ? "nd" : ["3","23"].includes(cycleDay) ? "rd" : "th"}.
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
