import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import type { FormData } from '../RegisterPage';

interface Props {
  data: FormData;
  onChange: (patch: Partial<FormData>) => void;
}

export function Step14TermsAndConditions({ data, onChange }: Props) {
  return (
    <div className="flex flex-col gap-6">
      {/* Card on File */}
      <div className="rounded-lg border bg-muted/30 p-4 flex flex-col gap-4">
        <div>
          <p className="text-sm font-semibold">
            Card on File <span className="text-destructive">*</span>
          </p>
          <p className="text-xs text-muted-foreground mt-0.5">
            The card will be charged every Monday for the week before.
          </p>
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="cardHolderName">Cardholder Name</Label>
          <Input
            id="cardHolderName"
            value={data.cardHolderName}
            onChange={e => onChange({ cardHolderName: e.target.value })}
            placeholder="John Smith"
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="cardNumber">Card Number</Label>
          <Input
            id="cardNumber"
            value={data.cardNumber}
            onChange={e => onChange({ cardNumber: e.target.value })}
            placeholder="1234 5678 9012 3456"
            maxLength={19}
          />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="cardExpiry">Expiry</Label>
            <Input
              id="cardExpiry"
              value={data.cardExpiry}
              onChange={e => onChange({ cardExpiry: e.target.value })}
              placeholder="MM/YY"
              maxLength={5}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="cardCvv">CVV</Label>
            <Input
              id="cardCvv"
              value={data.cardCvv}
              onChange={e => onChange({ cardCvv: e.target.value })}
              placeholder="123"
              maxLength={4}
            />
          </div>
        </div>
      </div>

      {/* Terms and Conditions */}
      <div className="flex flex-col gap-3">
        <p className="text-sm font-semibold">Please agree to the terms and conditions</p>

        <div className="rounded-lg border bg-muted/20 p-4 text-xs text-muted-foreground flex flex-col gap-2 leading-relaxed">
          <p>
            <span className="font-medium text-foreground">1.</span> The hourly rate is $55/hour.
          </p>
          <p>
            <span className="font-medium text-foreground">2.</span> Please send $250 deposit,
            E-transfer to{' '}
            <span className="font-medium text-foreground">chaim@cygfinance.com</span>, or QuickPay
            to <span className="font-medium text-foreground">chaimyakovgutman@gmail.com</span>.
            <br />
            <span className="text-[11px]">
              (Note that the $250 will go towards the first few invoices and it&apos;s not
              refundable)
            </span>
          </p>
          <p>
            <span className="font-medium text-foreground">3.</span> Things we do to advertise our
            company are:
          </p>
          <ul className="ml-4 flex flex-col gap-1">
            <li>• We will paste link to our website in billing email signature.</li>
            <li>
              • Calls to your representative&apos;s direct extension will include a recorded
              advertisement for our business.
            </li>
            <li>• We might display your logo on our website.</li>
          </ul>
          <p>
            A higher hourly rate applies for white-label services where third-party involvement
            remains undisclosed.
          </p>
          <p>
            Detailed Terms and Conditions are available at the following link:{' '}
            <a
              href="https://docs.google.com/document/d/e/2PACX-1vSM7gM4V1fjBiZVC9ugTyFdYGxIOyDfUdyCZ1Dzrtjg_k8l8KX1pk86Z3BGrnXPaCuh6NORex9m5-z2/pub"
              target="_blank"
              rel="noopener noreferrer"
              className="text-primary underline underline-offset-2 hover:opacity-80"
            >
              View full terms
            </a>
          </p>
        </div>

        <label className="flex items-start gap-2.5 cursor-pointer select-none">
          <input
            type="checkbox"
            checked={data.termsAccepted === true}
            onChange={e => onChange({ termsAccepted: e.target.checked ? true : null })}
            className="mt-0.5 h-4 w-4 shrink-0 accent-primary"
          />
          <span className="text-sm">I agree to the terms and conditions</span>
        </label>
      </div>
    </div>
  );
}
