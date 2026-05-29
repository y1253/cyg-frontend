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
  enabledKey: keyof FormData;
  cycleTypeKey: keyof FormData;
  cycleKey: keyof FormData;
  cycleDayKey: keyof FormData;
  cycleNthKey: keyof FormData;
  idPrefix: string;
}

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
    </div>
  );
}

export function Step13SecretarialManagement({ data, onChange }: Props) {
  return (
    <div className="flex flex-col gap-8">

      {/* Cash Flow Management */}
      <div className="flex flex-col gap-3">
        <div>
          <p className="text-sm font-medium text-foreground">Cash Flow Management Service</p>
          <p className="text-xs text-muted-foreground mt-1">
            By default we update the account every day and we keep track on outstanding checks and upcoming and recurring
            transactions of the next 5 days, and we send available balance report each day showing list of uncleared and upcoming
            transactions. If the account is at risk of going negative, we will contact you.
          </p>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <button
            type="button"
            onClick={() => onChange({ cashFlowEnabled: true })}
            className={cn(
              "flex flex-col items-center gap-2 rounded-xl border-2 p-5 text-sm font-medium transition-all",
              data.cashFlowEnabled === true
                ? "border-primary bg-primary/5 text-primary"
                : "border-border bg-background text-foreground hover:border-primary/40 hover:bg-muted/30",
            )}
          >
            <span className="text-2xl">✓</span>
            Yes
          </button>
          <button
            type="button"
            onClick={() => onChange({ cashFlowEnabled: false })}
            className={cn(
              "flex flex-col items-center gap-2 rounded-xl border-2 p-5 text-sm font-medium transition-all",
              data.cashFlowEnabled === false
                ? "border-primary bg-primary/5 text-primary"
                : "border-border bg-background text-foreground hover:border-primary/40 hover:bg-muted/30",
            )}
          >
            <span className="text-2xl">✕</span>
            No
          </button>
        </div>
        {data.cashFlowEnabled === true && (
          <div className="flex flex-col gap-3 pl-1">
            <CyclePicker
              data={data}
              onChange={onChange}
              rule={{
                enabledKey: "cashFlowEnabled",
                cycleTypeKey: "cashFlowCycleType",
                cycleKey: "cashFlowCycle",
                cycleDayKey: "cashFlowCycleDay",
                cycleNthKey: "cashFlowCycleNth",
                idPrefix: "cf",
              }}
            />
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="cf-note">Note <span className="text-muted-foreground font-normal">(optional)</span></Label>
              <textarea
                id="cf-note"
                value={data.cashFlowNote}
                onChange={(e) => onChange({ cashFlowNote: e.target.value })}
                placeholder="Any additional instructions..."
                className={TEXTAREA_CLASS}
              />
            </div>
          </div>
        )}
      </div>

      {/* Credit Card Management */}
      <div className="flex flex-col gap-3">
        <div>
          <p className="text-sm font-medium text-foreground">Credit Card Management</p>
          <p className="text-xs text-muted-foreground mt-1">
            By default we start sending payments to the credit card starting 5 days after statement date until it's fully paid.
            If not fully paid, we will notify you starting 5 days before the due date.
          </p>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <button
            type="button"
            onClick={() => onChange({ creditCardEnabled: true })}
            className={cn(
              "flex flex-col items-center gap-2 rounded-xl border-2 p-5 text-sm font-medium transition-all",
              data.creditCardEnabled === true
                ? "border-primary bg-primary/5 text-primary"
                : "border-border bg-background text-foreground hover:border-primary/40 hover:bg-muted/30",
            )}
          >
            <span className="text-2xl">✓</span>
            Yes
          </button>
          <button
            type="button"
            onClick={() => onChange({ creditCardEnabled: false, creditCardLimitEnabled: null })}
            className={cn(
              "flex flex-col items-center gap-2 rounded-xl border-2 p-5 text-sm font-medium transition-all",
              data.creditCardEnabled === false
                ? "border-primary bg-primary/5 text-primary"
                : "border-border bg-background text-foreground hover:border-primary/40 hover:bg-muted/30",
            )}
          >
            <span className="text-2xl">✕</span>
            No
          </button>
        </div>
        {data.creditCardEnabled === true && (
          <div className="flex flex-col gap-3 pl-1">
            <CyclePicker
              data={data}
              onChange={onChange}
              rule={{
                enabledKey: "creditCardEnabled",
                cycleTypeKey: "creditCardCycleType",
                cycleKey: "creditCardCycle",
                cycleDayKey: "creditCardCycleDay",
                cycleNthKey: "creditCardCycleNth",
                idPrefix: "cc",
              }}
            />
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="cc-note">Note <span className="text-muted-foreground font-normal">(optional)</span></Label>
              <textarea
                id="cc-note"
                value={data.creditCardNote}
                onChange={(e) => onChange({ creditCardNote: e.target.value })}
                placeholder="Any additional instructions..."
                className={TEXTAREA_CLASS}
              />
            </div>
          </div>
        )}

        {/* Credit card limit sub-question — only when CC Management = Yes */}
        {data.creditCardEnabled === true && (
          <div className="flex flex-col gap-3 border-t pt-4">
            <p className="text-sm font-medium text-foreground">
              Do you want us to make sure there is always available limit to use in credit card?
            </p>
            <div className="grid grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => onChange({ creditCardLimitEnabled: true })}
                className={cn(
                  "flex flex-col items-center gap-2 rounded-xl border-2 p-5 text-sm font-medium transition-all",
                  data.creditCardLimitEnabled === true
                    ? "border-primary bg-primary/5 text-primary"
                    : "border-border bg-background text-foreground hover:border-primary/40 hover:bg-muted/30",
                )}
              >
                <span className="text-2xl">✓</span>
                Yes
              </button>
              <button
                type="button"
                onClick={() => onChange({ creditCardLimitEnabled: false })}
                className={cn(
                  "flex flex-col items-center gap-2 rounded-xl border-2 p-5 text-sm font-medium transition-all",
                  data.creditCardLimitEnabled === false
                    ? "border-primary bg-primary/5 text-primary"
                    : "border-border bg-background text-foreground hover:border-primary/40 hover:bg-muted/30",
                )}
              >
                <span className="text-2xl">✕</span>
                No
              </button>
            </div>
            {data.creditCardLimitEnabled === true && (
              <div className="flex flex-col gap-3 pl-1">
                <CyclePicker
                  data={data}
                  onChange={onChange}
                  rule={{
                    enabledKey: "creditCardLimitEnabled",
                    cycleTypeKey: "creditCardLimitCycleType",
                    cycleKey: "creditCardLimitCycle",
                    cycleDayKey: "creditCardLimitCycleDay",
                    cycleNthKey: "creditCardLimitCycleNth",
                    idPrefix: "ccl",
                  }}
                />
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="ccl-amount">Amount</Label>
                  <Input
                    id="ccl-amount"
                    type="text"
                    value={data.creditCardLimitAmount}
                    onChange={(e) => onChange({ creditCardLimitAmount: e.target.value })}
                    placeholder="e.g. 1000"
                  />
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Receipt Tracking */}
      <div className="flex flex-col gap-3">
        <div>
          <p className="text-sm font-medium text-foreground">Receipt Tracking Service</p>
          <p className="text-xs text-muted-foreground mt-1">
            By default we send once a month a report of missing receipt transactions.
          </p>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <button
            type="button"
            onClick={() => onChange({ receiptTrackingEnabled: true })}
            className={cn(
              "flex flex-col items-center gap-2 rounded-xl border-2 p-5 text-sm font-medium transition-all",
              data.receiptTrackingEnabled === true
                ? "border-primary bg-primary/5 text-primary"
                : "border-border bg-background text-foreground hover:border-primary/40 hover:bg-muted/30",
            )}
          >
            <span className="text-2xl">✓</span>
            Yes
          </button>
          <button
            type="button"
            onClick={() => onChange({ receiptTrackingEnabled: false })}
            className={cn(
              "flex flex-col items-center gap-2 rounded-xl border-2 p-5 text-sm font-medium transition-all",
              data.receiptTrackingEnabled === false
                ? "border-primary bg-primary/5 text-primary"
                : "border-border bg-background text-foreground hover:border-primary/40 hover:bg-muted/30",
            )}
          >
            <span className="text-2xl">✕</span>
            No
          </button>
        </div>
        {data.receiptTrackingEnabled === true && (
          <div className="flex flex-col gap-3 pl-1">
            <CyclePicker
              data={data}
              onChange={onChange}
              rule={{
                enabledKey: "receiptTrackingEnabled",
                cycleTypeKey: "receiptTrackingCycleType",
                cycleKey: "receiptTrackingCycle",
                cycleDayKey: "receiptTrackingCycleDay",
                cycleNthKey: "receiptTrackingCycleNth",
                idPrefix: "rt",
              }}
            />
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="rt-note">Note <span className="text-muted-foreground font-normal">(optional)</span></Label>
              <textarea
                id="rt-note"
                value={data.receiptTrackingNote}
                onChange={(e) => onChange({ receiptTrackingNote: e.target.value })}
                placeholder="Any additional instructions..."
                className={TEXTAREA_CLASS}
              />
            </div>
          </div>
        )}
      </div>

    </div>
  );
}
