import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import type { FormData } from '../RegisterPage';

interface Props {
  data: FormData;
  onChange: (patch: Partial<FormData>) => void;
}

export function Step4ContactInfo({ data, onChange }: Props) {
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="personalName">
          Contact Name <span className="text-destructive">*</span>
        </Label>
        <Input
          id="personalName"
          value={data.personalName}
          onChange={e => onChange({ personalName: e.target.value })}
          placeholder="John Smith"
        />
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="privateEmail">
            Email <span className="text-destructive">*</span>
          </Label>
          <Input
            id="privateEmail"
            type="email"
            value={data.privateEmail}
            onChange={e => onChange({ privateEmail: e.target.value })}
            placeholder="john@example.com"
          />
          {data.privateEmail && !data.privateEmail.includes('@') && (
            <p className="text-xs text-destructive">Please enter a valid email address.</p>
          )}
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="privatePhone">
            Phone <span className="text-destructive">*</span>
          </Label>
          <Input
            id="privatePhone"
            type="tel"
            value={data.privatePhone}
            onChange={e => onChange({ privatePhone: e.target.value })}
            placeholder="+1 (555) 000-0000"
          />
        </div>
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="storeNumber">
          Store Phone Number <span className="text-destructive">*</span>
        </Label>
        <Input
          id="storeNumber"
          type="tel"
          value={data.storeNumber}
          onChange={e => onChange({ storeNumber: e.target.value })}
          placeholder="+1 (555) 000-0000"
        />
      </div>
    </div>
  );
}
