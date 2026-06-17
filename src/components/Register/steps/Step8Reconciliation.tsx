import { Trash2, Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import type { FormData, ReconciliationAccount } from '../RegisterPage';

const ACCOUNT_TYPES = ['Checking', 'Savings', 'Credit Card', 'Line of Credit', 'Other'];

interface Props {
  data: FormData;
  onChange: (patch: Partial<FormData>) => void;
}

export function Step8Reconciliation({ data, onChange }: Props) {
  const accounts = data.reconciliationAccounts;

  function updateAccount(index: number, patch: Partial<ReconciliationAccount>) {
    const updated = accounts.map((a, i) => (i === index ? { ...a, ...patch } : a));
    onChange({ reconciliationAccounts: updated });
  }

  function addAccount() {
    onChange({ reconciliationAccounts: [...accounts, { name: '', type: '', startDate: '', note: '' }] });
  }

  function removeAccount(index: number) {
    onChange({ reconciliationAccounts: accounts.filter((_, i) => i !== index) });
  }

  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-center gap-2 rounded-md border border-teal-200 bg-teal-50 px-3 py-2 text-sm text-teal-700">
        <span className="font-medium">30-day cycle</span>
        <span className="text-teal-500">·</span>
        <span>Each account will be reconciled on a 30-day recurring schedule.</span>
      </div>

      <div className="flex flex-col gap-4">
        {accounts.map((account, index) => (
          <div key={index} className="rounded-lg border bg-muted/30 p-4">
            <div className="mb-3 flex items-center justify-between">
              <span className="text-sm font-medium text-muted-foreground">
                Account {index + 1}
              </span>
              {index > 0 && (
                <button
                  type="button"
                  onClick={() => removeAccount(index)}
                  className="text-muted-foreground hover:text-destructive transition-colors"
                  aria-label="Remove account"
                >
                  <Trash2 size={15} />
                </button>
              )}
            </div>

            <div className="flex flex-col gap-3">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor={`acct-name-${index}`}>
                  Account Name <span className="text-destructive">*</span>
                </Label>
                <Input
                  id={`acct-name-${index}`}
                  value={account.name}
                  onChange={e => updateAccount(index, { name: e.target.value })}
                  placeholder="e.g. Main Business Checking"
                />
              </div>

              <div className="flex flex-col gap-1.5">
                <Label htmlFor={`acct-note-${index}`}>
                  Note <span className="text-muted-foreground font-normal">(optional)</span>
                </Label>
                <textarea
                  id={`acct-note-${index}`}
                  value={account.note}
                  onChange={e => updateAccount(index, { note: e.target.value })}
                  placeholder="Any additional instructions..."
                  className="flex min-h-[72px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm focus:outline-none focus:ring-1 focus:ring-ring placeholder:text-muted-foreground resize-none"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="flex flex-col gap-1.5">
                  <Label>
                    Account Type <span className="text-destructive">*</span>
                  </Label>
                  <Select
                    value={account.type || null}
                    onValueChange={val => updateAccount(index, { type: val ?? '' })}
                  >
                    <SelectTrigger className="w-full">
                      <SelectValue placeholder="Select type" />
                    </SelectTrigger>
                    <SelectContent>
                      {ACCOUNT_TYPES.map(t => (
                        <SelectItem key={t} value={t}>
                          {t}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="flex flex-col gap-1.5">
                  <Label htmlFor={`acct-date-${index}`}>
                    Starting Date <span className="text-destructive">*</span>
                  </Label>
                  <Input
                    id={`acct-date-${index}`}
                    type="date"
                    value={account.startDate}
                    onChange={e => updateAccount(index, { startDate: e.target.value })}
                  />
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>

      <Button type="button" variant="outline" onClick={addAccount} className="w-full gap-1.5">
        <Plus size={15} />
        Add Another Account
      </Button>
    </div>
  );
}
