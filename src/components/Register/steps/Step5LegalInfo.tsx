import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import type { FormData } from '../RegisterPage';

interface Props {
  data: FormData;
  onChange: (patch: Partial<FormData>) => void;
}

export function Step5LegalInfo({ data, onChange }: Props) {
  return (
    <div className="flex flex-col gap-4">
      <div className="rounded-lg border border-blue-200 bg-blue-50 px-4 py-3 text-xs text-blue-800 dark:border-blue-800/40 dark:bg-blue-900/20 dark:text-blue-300">
        The following information is required for Canadian businesses. All fields are optional — fill in what applies to you.
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="neq">NEQ</Label>
          <Input
            id="neq"
            value={data.neq}
            onChange={e => onChange({ neq: e.target.value })}
            placeholder="Numéro d'entreprise QC"
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="revenueQcId">Revenue QC ID</Label>
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
          <Label htmlFor="craBn">CRA Business Number</Label>
          <Input
            id="craBn"
            value={data.craBn}
            onChange={e => onChange({ craBn: e.target.value })}
            placeholder="123456789RT0001"
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="fiscalYear">Fiscal Year End</Label>
          <Input
            id="fiscalYear"
            value={data.fiscalYear}
            onChange={e => onChange({ fiscalYear: e.target.value })}
            placeholder="e.g. December 31"
          />
        </div>
      </div>
    </div>
  );
}
