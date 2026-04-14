import { useState } from 'react';
import { Eye, EyeOff } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import type { FormData } from '../RegisterPage';

interface Props {
  data: FormData;
  onChange: (patch: Partial<FormData>) => void;
}

export function Step6Billing({ data, onChange }: Props) {
  const [showPassword, setShowPassword] = useState(false);

  return (
    <div className="flex flex-col gap-4">
      <div className="rounded-lg border border-muted bg-muted/30 px-4 py-3 text-xs text-muted-foreground">
        Your billing password is stored securely using AES-256 encryption and is only accessible to your accountant.
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="billingEmail">Billing Email</Label>
        <Input
          id="billingEmail"
          type="email"
          value={data.billingEmail}
          onChange={e => onChange({ billingEmail: e.target.value })}
          placeholder="billing@yourcompany.com"
        />
        {data.billingEmail && !data.billingEmail.includes('@') && (
          <p className="text-xs text-destructive">Please enter a valid email address.</p>
        )}
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="billingPassword">Billing Password</Label>
        <div className="relative">
          <Input
            id="billingPassword"
            type={showPassword ? 'text' : 'password'}
            value={data.billingPassword}
            onChange={e => onChange({ billingPassword: e.target.value })}
            placeholder="Enter billing account password"
            className="pr-10"
          />
          <button
            type="button"
            onClick={() => setShowPassword(v => !v)}
            className="absolute inset-y-0 right-0 flex items-center px-3 text-muted-foreground hover:text-foreground transition-colors"
            tabIndex={-1}
            aria-label={showPassword ? 'Hide password' : 'Show password'}
          >
            {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
          </button>
        </div>
      </div>
    </div>
  );
}
