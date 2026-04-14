import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
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

const BUSINESS_TYPES = [
  { value: 'REAL_ESTATE', label: 'Real Estate' },
  { value: 'ADVERTISING', label: 'Advertising' },
  { value: 'RETAIL', label: 'Retail' },
  { value: 'CONSTRUCTION', label: 'Construction' },
  { value: 'TECHNOLOGY', label: 'Technology' },
  { value: 'HEALTHCARE', label: 'Healthcare' },
  { value: 'FINANCE', label: 'Finance' },
  { value: 'OTHER', label: 'Other' },
];

const COMPANY_TYPES = [
  { value: 'CORPORATION', label: 'Corporation' },
  { value: 'LLC', label: 'LLC' },
  { value: 'SOLE_PROPRIETOR', label: 'Sole Proprietor' },
  { value: 'PARTNERSHIP', label: 'Partnership' },
  { value: 'NON_PROFIT', label: 'Non-Profit' },
  { value: 'OTHER', label: 'Other' },
];

export function Step3BusinessInfo({ data, onChange }: Props) {
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="businessName">
          Business Name <span className="text-destructive">*</span>
        </Label>
        <Input
          id="businessName"
          value={data.businessName}
          onChange={e => onChange({ businessName: e.target.value })}
          placeholder="Acme Corp"
        />
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="flex flex-col gap-1.5">
          <Label>Business Type</Label>
          <Select
            value={data.businessType}
            onValueChange={val => onChange({ businessType: val })}
          >
            <SelectTrigger className="w-full">
              <SelectValue placeholder="Select type" />
            </SelectTrigger>
            <SelectContent>
              {BUSINESS_TYPES.map(t => (
                <SelectItem key={t.value} value={t.value}>
                  {t.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="flex flex-col gap-1.5">
          <Label>Company Structure</Label>
          <Select
            value={data.companyType}
            onValueChange={val => onChange({ companyType: val })}
          >
            <SelectTrigger className="w-full">
              <SelectValue placeholder="Select structure" />
            </SelectTrigger>
            <SelectContent>
              {COMPANY_TYPES.map(t => (
                <SelectItem key={t.value} value={t.value}>
                  {t.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="companyActivity">Business Activity</Label>
        <textarea
          id="companyActivity"
          value={data.companyActivity}
          onChange={e => onChange({ companyActivity: e.target.value })}
          placeholder="Briefly describe what your business does..."
          rows={3}
          className="flex w-full rounded-lg border border-input bg-transparent px-3 py-2 text-sm outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 resize-none"
        />
      </div>
    </div>
  );
}
