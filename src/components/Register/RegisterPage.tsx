import { useState } from 'react';
import { ChevronLeft, ChevronRight, CheckCircle2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { useRegisterCompany } from '@/hooks/useRegisterCompany';
import { StepIndicator } from './StepIndicator';
import { Step1QuickBooks } from './steps/Step1QuickBooks';
import { Step2Country } from './steps/Step2Country';
import { Step3BusinessInfo } from './steps/Step3BusinessInfo';
import { Step4ContactInfo } from './steps/Step4ContactInfo';
import { Step5LegalInfo } from './steps/Step5LegalInfo';
import { Step6Billing } from './steps/Step6Billing';
import { Step7Accountant } from './steps/Step7Accountant';

export interface FormData {
  // Step 1
  hasQbAccount: boolean | null;
  qbPlan: string | null;
  // Step 2
  country: string | null;
  // Step 3
  businessName: string;
  businessType: string | null;
  companyType: string | null;
  companyActivity: string;
  // Step 4
  personalName: string;
  privateEmail: string;
  privatePhone: string;
  storeNumber: string;
  // Step 5 (Canada only)
  neq: string;
  revenueQcId: string;
  craBn: string;
  fiscalYear: string;
  // Step 6
  billingEmail: string;
  billingPassword: string;
  // Step 7
  accountantName: string;
  accountantEmail: string;
  accountantPhone: string;
}

const EMPTY_FORM: FormData = {
  hasQbAccount: null,
  qbPlan: null,
  country: null,
  businessName: '',
  businessType: null,
  companyType: null,
  companyActivity: '',
  personalName: '',
  privateEmail: '',
  privatePhone: '',
  storeNumber: '',
  neq: '',
  revenueQcId: '',
  craBn: '',
  fiscalYear: '',
  billingEmail: '',
  billingPassword: '',
  accountantName: '',
  accountantEmail: '',
  accountantPhone: '',
};

interface StepConfig {
  label: string;
  title: string;
  description: string;
}

const BASE_STEPS: StepConfig[] = [
  {
    label: 'QuickBooks',
    title: 'QuickBooks Setup',
    description: 'Tell us about your current QuickBooks status.',
  },
  {
    label: 'Location',
    title: 'Business Location',
    description: 'Where is your business based?',
  },
  {
    label: 'Business',
    title: 'Business Information',
    description: 'Basic details about your company.',
  },
  {
    label: 'Contact',
    title: 'Contact Information',
    description: 'How we can reach your business.',
  },
  {
    label: 'Billing',
    title: 'Billing Information',
    description: 'Your billing account details (stored securely).',
  },
  {
    label: 'Accountant',
    title: 'Accountant Details',
    description: 'Information about your current accountant, if applicable.',
  },
];

const LEGAL_STEP: StepConfig = {
  label: 'Legal',
  title: 'Legal Information',
  description: 'Required for Canadian businesses — fill in what applies to you.',
};

export function RegisterPage() {
  const [form, setForm] = useState<FormData>(EMPTY_FORM);
  const [step, setStep] = useState(0);
  const mutation = useRegisterCompany();

  function patch(updates: Partial<FormData>) {
    setForm(prev => ({ ...prev, ...updates }));
  }

  // Build the step list dynamically — legal step inserted after contact if Canada
  const visibleSteps: StepConfig[] = (() => {
    const steps = [...BASE_STEPS];
    if (form.country === 'CANADA') {
      // Insert legal step at index 4 (after Contact at index 3)
      steps.splice(4, 0, LEGAL_STEP);
    }
    return steps;
  })();

  // Map visible step index to logical step name
  function getStepName(idx: number): string {
    const legalInserted = form.country === 'CANADA';
    if (idx === 0) return 'qb';
    if (idx === 1) return 'country';
    if (idx === 2) return 'business';
    if (idx === 3) return 'contact';
    if (legalInserted && idx === 4) return 'legal';
    if (idx === (legalInserted ? 5 : 4)) return 'billing';
    if (idx === (legalInserted ? 6 : 5)) return 'accountant';
    return '';
  }

  function isStepValid(): boolean {
    const name = getStepName(step);
    if (name === 'qb') {
      if (form.hasQbAccount === null) return false;
      if (form.hasQbAccount === false && !form.qbPlan) return false;
      return true;
    }
    if (name === 'country') return form.country !== null;
    if (name === 'business') {
      return (
        form.businessName.trim() !== '' &&
        form.businessType !== null &&
        form.companyType !== null &&
        form.companyActivity.trim() !== ''
      );
    }
    if (name === 'contact') {
      return (
        form.personalName.trim() !== '' &&
        form.privateEmail.includes('@') &&
        form.privatePhone.trim() !== '' &&
        form.storeNumber.trim() !== ''
      );
    }
    if (name === 'legal') {
      return (
        form.neq.trim() !== '' &&
        form.revenueQcId.trim() !== '' &&
        form.craBn.trim() !== '' &&
        form.fiscalYear.trim() !== ''
      );
    }
    if (name === 'billing') {
      return form.billingEmail.includes('@') && form.billingPassword.trim() !== '';
    }
    if (name === 'accountant') {
      return (
        form.accountantName.trim() !== '' &&
        form.accountantEmail.includes('@') &&
        form.accountantPhone.trim() !== ''
      );
    }
    return true;
  }

  function handleNext() {
    if (step < visibleSteps.length - 1) {
      setStep(s => s + 1);
    } else {
      handleSubmit();
    }
  }

  function handleBack() {
    setStep(s => Math.max(0, s - 1));
  }

  function handleSubmit() {
    if (form.hasQbAccount !== null && form.country && form.businessName) {
      mutation.mutate({
        hasQbAccount: form.hasQbAccount as boolean,
        qbPlan: form.qbPlan ?? undefined,
        country: form.country,
        businessName: form.businessName,
        businessType: form.businessType ?? undefined,
        companyType: form.companyType ?? undefined,
        companyActivity: form.companyActivity || undefined,
        personalName: form.personalName || undefined,
        privateEmail: form.privateEmail || undefined,
        privatePhone: form.privatePhone || undefined,
        storeNumber: form.storeNumber || undefined,
        neq: form.neq || undefined,
        revenueQcId: form.revenueQcId || undefined,
        craBn: form.craBn || undefined,
        fiscalYear: form.fiscalYear || undefined,
        billingEmail: form.billingEmail || undefined,
        billingPassword: form.billingPassword || undefined,
        accountantName: form.accountantName || undefined,
        accountantEmail: form.accountantEmail || undefined,
        accountantPhone: form.accountantPhone || undefined,
      });
    }
  }

  const currentStepName = getStepName(step);
  const isLastStep = step === visibleSteps.length - 1;
  const currentStepConfig = visibleSteps[step];

  // Success screen
  if (mutation.isSuccess) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-muted/40 px-4 py-12">
        <div className="w-full max-w-md">
          <Card>
            <CardContent className="flex flex-col items-center gap-4 py-10 text-center">
              <CheckCircle2 className="h-14 w-14 text-green-500" />
              <div>
                <h2 className="text-xl font-semibold">Registration Received!</h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  Thank you,{' '}
                  <span className="font-medium text-foreground">
                    {mutation.data.businessName}
                  </span>
                  . We have received your information and will be in touch shortly.
                </p>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-muted/40 px-4 py-12">
      <div className="w-full max-w-xl">
        {/* Header */}
        <div className="mb-8 text-center">
          <div className="mb-2 inline-block rounded-full bg-primary/10 px-3 py-1 text-xs font-medium text-primary">
            Company Registration
          </div>
          <h1 className="text-2xl font-bold tracking-tight">CYG Finance</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Fill out the form below and we will take care of the rest.
          </p>
        </div>

        {/* Step indicator */}
        <StepIndicator steps={visibleSteps} currentStep={step} />

        {/* Form card */}
        <Card className="mt-6">
          <CardHeader className="border-b">
            <CardTitle className="text-base">{currentStepConfig.title}</CardTitle>
            <CardDescription>{currentStepConfig.description}</CardDescription>
          </CardHeader>

          <CardContent className="pt-5">
            {currentStepName === 'qb' && (
              <Step1QuickBooks data={form} onChange={patch} />
            )}
            {currentStepName === 'country' && (
              <Step2Country data={form} onChange={patch} />
            )}
            {currentStepName === 'business' && (
              <Step3BusinessInfo data={form} onChange={patch} />
            )}
            {currentStepName === 'contact' && (
              <Step4ContactInfo data={form} onChange={patch} />
            )}
            {currentStepName === 'legal' && (
              <Step5LegalInfo data={form} onChange={patch} />
            )}
            {currentStepName === 'billing' && (
              <Step6Billing data={form} onChange={patch} />
            )}
            {currentStepName === 'accountant' && (
              <Step7Accountant data={form} onChange={patch} />
            )}
          </CardContent>

          <CardFooter className="flex justify-between gap-3">
            <Button
              variant="outline"
              onClick={handleBack}
              disabled={step === 0 || mutation.isPending}
              className="gap-1.5"
            >
              <ChevronLeft size={16} />
              Back
            </Button>

            <div className="flex items-center gap-2">
              {mutation.isError && (
                <p className="text-xs text-destructive">
                  {mutation.error instanceof Error
                    ? mutation.error.message
                    : 'Something went wrong'}
                </p>
              )}
              <Button
                onClick={handleNext}
                disabled={!isStepValid() || mutation.isPending}
                className="gap-1.5"
              >
                {isLastStep ? (
                  mutation.isPending ? (
                    'Submitting...'
                  ) : (
                    'Submit'
                  )
                ) : (
                  <>
                    Next
                    <ChevronRight size={16} />
                  </>
                )}
              </Button>
            </div>
          </CardFooter>
        </Card>

        <p className="mt-4 text-center text-xs text-muted-foreground">
          Your information is kept confidential and used only for bookkeeping purposes.
        </p>
      </div>
    </div>
  );
}
