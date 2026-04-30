import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import type { FormData } from '../RegisterPage';

interface Props {
  data: FormData;
  onChange: (patch: Partial<FormData>) => void;
}

const MONTHS = [
  { value: '01', label: 'January',  maxDay: 31 },
  { value: '02', label: 'February', maxDay: 29 },
  { value: '03', label: 'March',    maxDay: 31 },
  { value: '04', label: 'April',    maxDay: 30 },
  { value: '05', label: 'May',      maxDay: 31 },
  { value: '06', label: 'June',     maxDay: 30 },
  { value: '07', label: 'July',     maxDay: 31 },
  { value: '08', label: 'August',   maxDay: 31 },
  { value: '09', label: 'September',maxDay: 30 },
  { value: '10', label: 'October',  maxDay: 31 },
  { value: '11', label: 'November', maxDay: 30 },
  { value: '12', label: 'December', maxDay: 31 },
];

export function Step5LegalInfo({ data, onChange }: Props) {
  // data.fiscalYear is stored as "2000-MM-DD" or ""
  const parts = data.fiscalYear ? data.fiscalYear.split('-') : [];
  const selectedMonth = parts.length >= 2 ? parts[1] : null;
  const selectedDay   = parts.length >= 3 ? parts[2] : null;

  const maxDays = selectedMonth
    ? (MONTHS.find(m => m.value === selectedMonth)?.maxDay ?? 31)
    : 31;

  function handleMonthChange(m: string | null) {
    if (!m) { onChange({ fiscalYear: '' }); return; }
    const max = MONTHS.find(x => x.value === m)?.maxDay ?? 31;
    // Keep existing day if still valid; otherwise default to 01
    const day = selectedDay && parseInt(selectedDay) <= max ? selectedDay : '01';
    onChange({ fiscalYear: `2000-${m}-${day}` });
  }

  function handleDayChange(d: string | null) {
    if (!d || !selectedMonth) return;
    onChange({ fiscalYear: `2000-${selectedMonth}-${d}` });
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="rounded-lg border border-blue-200 bg-blue-50 px-4 py-3 text-xs text-blue-800">
        The following information is required for Canadian businesses. Please fill in all fields.
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="neq">
            NEQ <span className="text-destructive">*</span>
          </Label>
          <Input
            id="neq"
            value={data.neq}
            onChange={e => onChange({ neq: e.target.value })}
            placeholder="Numéro d'entreprise QC"
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="revenueQcId">
            Revenue QC ID <span className="text-destructive">*</span>
          </Label>
          <Input
            id="revenueQcId"
            value={data.revenueQcId}
            onChange={e => onChange({ revenueQcId: e.target.value })}
            placeholder="Revenu Québec ID"
          />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="craBn">
            CRA Business Number <span className="text-destructive">*</span>
          </Label>
          <Input
            id="craBn"
            value={data.craBn}
            onChange={e => onChange({ craBn: e.target.value })}
            placeholder="123456789RT0001"
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <Label>
            Fiscal Year End <span className="text-destructive">*</span>
          </Label>
          <div className="flex gap-2">
            <Select value={selectedMonth} onValueChange={handleMonthChange}>
              <SelectTrigger className="flex-1">
                <SelectValue placeholder="Month" />
              </SelectTrigger>
              <SelectContent>
                {MONTHS.map(m => (
                  <SelectItem key={m.value} value={m.value}>
                    {m.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select
              value={selectedDay}
              onValueChange={handleDayChange}
            >
              <SelectTrigger className="w-20">
                <SelectValue placeholder="Day" />
              </SelectTrigger>
              <SelectContent>
                {Array.from({ length: maxDays }, (_, i) => {
                  const d = (i + 1).toString().padStart(2, '0');
                  return (
                    <SelectItem key={d} value={d}>
                      {i + 1}
                    </SelectItem>
                  );
                })}
              </SelectContent>
            </Select>
          </div>
        </div>
      </div>
    </div>
  );
}
