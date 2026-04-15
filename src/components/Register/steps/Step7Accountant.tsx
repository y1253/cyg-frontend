import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import type { FormData } from '../RegisterPage';

interface Props {
  data: FormData;
  onChange: (patch: Partial<FormData>) => void;
}

export function Step7Accountant({ data, onChange }: Props) {
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="accountantName">
          Accountant Name <span className="text-destructive">*</span>
        </Label>
        <Input
          id="accountantName"
          value={data.accountantName}
          onChange={e => onChange({ accountantName: e.target.value })}
          placeholder="Jane Doe"
        />
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="accountantEmail">
            Accountant Email <span className="text-destructive">*</span>
          </Label>
          <Input
            id="accountantEmail"
            type="email"
            value={data.accountantEmail}
            onChange={e => onChange({ accountantEmail: e.target.value })}
            placeholder="accountant@firm.com"
          />
          {data.accountantEmail && !data.accountantEmail.includes('@') && (
            <p className="text-xs text-destructive">Please enter a valid email address.</p>
          )}
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="accountantPhone">
            Accountant Phone <span className="text-destructive">*</span>
          </Label>
          <Input
            id="accountantPhone"
            type="tel"
            value={data.accountantPhone}
            onChange={e => onChange({ accountantPhone: e.target.value })}
            placeholder="+1 (555) 000-0000"
          />
        </div>
      </div>
    </div>
  );
}
