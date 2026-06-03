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
import { Step8Reconciliation } from './steps/Step8Reconciliation';
import { Step9AccountsPayable } from './steps/Step9AccountsPayable';
import { Step10AccountsReceivable } from './steps/Step10AccountsReceivable';
import { Step11Payroll } from './steps/Step11Payroll';
import { Step12General } from './steps/Step12General';
import { Step13SecretarialManagement } from './steps/Step13SecretarialManagement';
import { Step14TermsAndConditions } from './steps/Step14TermsAndConditions';

export interface ReconciliationAccount {
  name: string;
  type: string;
  startDate: string;
}

export interface CashFlowAccount {
  accountName: string;
  enabled: boolean;
  note: string;
  startDate: string;
  cycleType: string;
  cycle: number;
  cycleDay: number | null;
  cycleNth: number | null;
}

export interface CreditCardAccount {
  accountName: string;
  enabled: boolean;
  note: string;
  statementDay: number | null;
  limitEnabled: boolean;
  limitNote: string;
  limitAmount: string;
  limitCycleDays: number;
}

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
  // Step 8
  reconciliationAccounts: ReconciliationAccount[];
  // Step 9
  apManageBills: boolean | null;
  apStartDate: string;
  apCycleType: string;
  apCycle: number;
  apCycleDay: number | null;
  apCycleNth: number | null;
  // Step 10 — Accounts Receivable
  arInvoicingEnabled: boolean | null;
  arInvoicingStartDate: string;
  arInvoicingCycleType: string;
  arInvoicingCycle: number;
  arInvoicingCycleDay: number | null;
  arInvoicingCycleNth: number | null;
  arInvoicingNote: string;
  arStatementsEnabled: boolean | null;
  arStatementsStartDate: string;
  arStatementsCycleType: string;
  arStatementsCycle: number;
  arStatementsCycleDay: number | null;
  arStatementsCycleNth: number | null;
  arStatementsNote: string;
  arCollectionEnabled: boolean | null;
  arCollectionStartDate: string;
  arCollectionCycleType: string;
  arCollectionCycle: number;
  arCollectionCycleDay: number | null;
  arCollectionCycleNth: number | null;
  arCollectionNote: string;
  arReportEnabled: boolean | null;
  arReportStartDate: string;
  arReportCycleType: string;
  arReportCycle: number;
  arReportCycleDay: number | null;
  arReportCycleNth: number | null;
  arReportNote: string;
  // Step 11 — Payroll
  payrollEnabled: boolean | null;
  payrollStartDate: string;
  payrollCycleType: string;
  payrollCycle: number;
  payrollCycleDay: number | null;
  payrollCycleNth: number | null;
  payrollNote: string;
  payrollTaxEnabled: boolean | null;
  payrollTaxCadEnabled: boolean;
  payrollTaxQcEnabled: boolean;
  payrollTaxStartDate: string;
  payrollTaxCycleType: string;
  payrollTaxCycle: number;
  payrollTaxCycleDay: number | null;
  payrollTaxCycleNth: number | null;
  payrollTaxNote: string;
  payrollTaxQcStartDate: string;
  payrollTaxQcCycleType: string;
  payrollTaxQcCycle: number;
  payrollTaxQcCycleDay: number | null;
  payrollTaxQcCycleNth: number | null;
  payrollTaxQcNote: string;
  payrollYearEndEnabled: boolean | null;
  payrollYearEndRl1: boolean;
  payrollYearEndT4: boolean;
  payrollYearEndCnesst: boolean;
  // Step 12 — General
  locationVisitEnabled: boolean | null;
  locationVisitFrequency: string | null;
  qcDocsEnabled: boolean | null;
  qcDocsNote: string;
  craDocsEnabled: boolean | null;
  craDocsNote: string;
  salesTaxEnabled: boolean | null;
  salesTaxNote: string;
  // Step 13 — Secretarial Management
  cashFlowEnabled: boolean | null;
  cashFlowAccounts: CashFlowAccount[];
  creditCardEnabled: boolean | null;
  creditCardAccounts: CreditCardAccount[];
  receiptTrackingEnabled: boolean | null;
  receiptTrackingStartDate: string;
  receiptTrackingCycleType: string;
  receiptTrackingCycle: number;
  receiptTrackingCycleDay: number | null;
  receiptTrackingCycleNth: number | null;
  receiptTrackingNote: string;
  // Step 14 — Terms & Conditions
  cardHolderName: string;
  cardNumber: string;
  cardExpiry: string;
  cardCvv: string;
  termsAccepted: boolean | null;
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
  reconciliationAccounts: [{ name: '', type: '', startDate: '' }],
  apManageBills: null,
  apStartDate: '',
  apCycleType: 'DAYS',
  apCycle: 30,
  apCycleDay: null,
  apCycleNth: null,
  arInvoicingEnabled: null,
  arInvoicingStartDate: '',
  arInvoicingCycleType: 'DAYS',
  arInvoicingCycle: 30,
  arInvoicingCycleDay: null,
  arInvoicingCycleNth: null,
  arInvoicingNote: '',
  arStatementsEnabled: null,
  arStatementsStartDate: '',
  arStatementsCycleType: 'DAYS',
  arStatementsCycle: 30,
  arStatementsCycleDay: null,
  arStatementsCycleNth: null,
  arStatementsNote: '',
  arCollectionEnabled: null,
  arCollectionStartDate: '',
  arCollectionCycleType: 'DAYS',
  arCollectionCycle: 30,
  arCollectionCycleDay: null,
  arCollectionCycleNth: null,
  arCollectionNote: '',
  arReportEnabled: null,
  arReportStartDate: '',
  arReportCycleType: 'DAYS',
  arReportCycle: 30,
  arReportCycleDay: null,
  arReportCycleNth: null,
  arReportNote: '',
  payrollEnabled: null,
  payrollStartDate: '',
  payrollCycleType: 'DAYS',
  payrollCycle: 30,
  payrollCycleDay: null,
  payrollCycleNth: null,
  payrollNote: '',
  payrollTaxEnabled: null,
  payrollTaxCadEnabled: false,
  payrollTaxQcEnabled: false,
  payrollTaxStartDate: '',
  payrollTaxCycleType: 'DAYS',
  payrollTaxCycle: 30,
  payrollTaxCycleDay: null,
  payrollTaxCycleNth: null,
  payrollTaxNote: '',
  payrollTaxQcStartDate: '',
  payrollTaxQcCycleType: 'DAYS',
  payrollTaxQcCycle: 30,
  payrollTaxQcCycleDay: null,
  payrollTaxQcCycleNth: null,
  payrollTaxQcNote: '',
  payrollYearEndEnabled: null,
  payrollYearEndRl1: false,
  payrollYearEndT4: false,
  payrollYearEndCnesst: false,
  locationVisitEnabled: null,
  locationVisitFrequency: null,
  qcDocsEnabled: null,
  qcDocsNote: '',
  craDocsEnabled: null,
  craDocsNote: '',
  salesTaxEnabled: null,
  salesTaxNote: '',
  cashFlowEnabled: null,
  cashFlowAccounts: [],
  creditCardEnabled: null,
  creditCardAccounts: [],
  receiptTrackingEnabled: null,
  receiptTrackingStartDate: '',
  receiptTrackingCycleType: 'DAYS',
  receiptTrackingCycle: 30,
  receiptTrackingCycleDay: null,
  receiptTrackingCycleNth: null,
  receiptTrackingNote: '',
  cardHolderName: '',
  cardNumber: '',
  cardExpiry: '',
  cardCvv: '',
  termsAccepted: null,
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
  {
    label: 'Reconciliation',
    title: 'Bank Accounts to Reconcile',
    description: 'Add the accounts you would like us to reconcile. Each will be on a 30-day cycle.',
  },
  {
    label: 'Payables',
    title: 'Accounts Payable Management',
    description: 'Do you want us to track and enter your bills?',
  },
  {
    label: 'Receivables',
    title: 'Accounts Receivable',
    description: 'How should we handle your accounts receivable?',
  },
  {
    label: 'Payroll',
    title: 'Payroll Management',
    description: 'Configure payroll-related services.',
  },
  {
    label: 'General',
    title: 'General Services',
    description: 'Additional services and document management.',
  },
  {
    label: 'Secretarial',
    title: 'Secretarial Management',
    description: 'Configure cash flow, credit card, and receipt tracking services.',
  },
  {
    label: 'Terms',
    title: 'Terms & Conditions',
    description: 'Review and accept the terms of service.',
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
    if (idx === (legalInserted ? 7 : 6)) return 'reconciliation';
    if (idx === (legalInserted ? 8 : 7)) return 'accountspayable';
    if (idx === (legalInserted ? 9 : 8)) return 'accountsreceivable';
    if (idx === (legalInserted ? 10 : 9)) return 'payroll';
    if (idx === (legalInserted ? 11 : 10)) return 'general';
    if (idx === (legalInserted ? 12 : 11)) return 'secretarial';
    if (idx === (legalInserted ? 13 : 12)) return 'terms';
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
    if (name === 'reconciliation') {
      if (form.reconciliationAccounts.length === 0) return false;
      return form.reconciliationAccounts.every(a => a.name.trim() !== '' && a.type !== '' && a.startDate !== '');
    }
    if (name === 'accountspayable') {
      if (form.apManageBills === null) return false;
      if (form.apManageBills === true && form.apStartDate === '') return false;
      return true;
    }
    if (name === 'accountsreceivable') {
      return (
        form.arInvoicingEnabled !== null &&
        form.arStatementsEnabled !== null &&
        form.arCollectionEnabled !== null &&
        form.arReportEnabled !== null
      );
    }
    if (name === 'payroll') {
      if (form.payrollEnabled === null) return false;
      if (form.country === 'CANADA') {
        if (form.payrollTaxEnabled === null) return false;
        if (form.payrollTaxEnabled === true && !form.payrollTaxCadEnabled && !form.payrollTaxQcEnabled) return false;
        if (form.payrollYearEndEnabled === null) return false;
      }
      return true;
    }
    if (name === 'general') {
      if (form.locationVisitEnabled === null) return false;
      if (form.locationVisitEnabled === true && form.locationVisitFrequency === null) return false;
      if (form.country === 'CANADA') {
        if (form.qcDocsEnabled === null) return false;
        if (form.craDocsEnabled === null) return false;
        if (form.salesTaxEnabled === null) return false;
      }
      return true;
    }
    if (name === 'secretarial') {
      if (form.cashFlowEnabled === null) return false;
      if (form.cashFlowEnabled === true) {
        for (const a of form.cashFlowAccounts) {
          if (a.enabled && !a.startDate) return false;
        }
      }
      if (form.creditCardEnabled === null) return false;
      if (form.creditCardEnabled === true) {
        for (const a of form.creditCardAccounts) {
          if (a.enabled && !a.statementDay) return false;
        }
      }
      if (form.receiptTrackingEnabled === null) return false;
      return true;
    }
    if (name === 'terms') {
      if (!form.cardHolderName.trim()) return false;
      if (!form.cardNumber.trim()) return false;
      if (!form.cardExpiry.trim()) return false;
      if (!form.cardCvv.trim()) return false;
      return form.termsAccepted === true;
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
        reconciliationAccounts: form.reconciliationAccounts.length > 0
          ? form.reconciliationAccounts
          : undefined,
        apManageBills: form.apManageBills ?? undefined,
        ...(form.apManageBills === true && {
          apStartDate: form.apStartDate || undefined,
          apCycleType: form.apCycleType || undefined,
          apCycle: form.apCycle || undefined,
          apCycleDay: form.apCycleDay ?? undefined,
          apCycleNth: form.apCycleNth ?? undefined,
        }),
        arInvoicingEnabled: form.arInvoicingEnabled ?? undefined,
        ...(form.arInvoicingEnabled === true && {
          arInvoicingStartDate: form.arInvoicingStartDate || undefined,
          arInvoicingCycleType: form.arInvoicingCycleType || undefined,
          arInvoicingCycle: form.arInvoicingCycle || undefined,
          arInvoicingCycleDay: form.arInvoicingCycleDay ?? undefined,
          arInvoicingCycleNth: form.arInvoicingCycleNth ?? undefined,
          arInvoicingNote: form.arInvoicingNote || undefined,
        }),
        arStatementsEnabled: form.arStatementsEnabled ?? undefined,
        ...(form.arStatementsEnabled === true && {
          arStatementsStartDate: form.arStatementsStartDate || undefined,
          arStatementsCycleType: form.arStatementsCycleType || undefined,
          arStatementsCycle: form.arStatementsCycle || undefined,
          arStatementsCycleDay: form.arStatementsCycleDay ?? undefined,
          arStatementsCycleNth: form.arStatementsCycleNth ?? undefined,
          arStatementsNote: form.arStatementsNote || undefined,
        }),
        arCollectionEnabled: form.arCollectionEnabled ?? undefined,
        ...(form.arCollectionEnabled === true && {
          arCollectionStartDate: form.arCollectionStartDate || undefined,
          arCollectionCycleType: form.arCollectionCycleType || undefined,
          arCollectionCycle: form.arCollectionCycle || undefined,
          arCollectionCycleDay: form.arCollectionCycleDay ?? undefined,
          arCollectionCycleNth: form.arCollectionCycleNth ?? undefined,
          arCollectionNote: form.arCollectionNote || undefined,
        }),
        arReportEnabled: form.arReportEnabled ?? undefined,
        ...(form.arReportEnabled === true && {
          arReportStartDate: form.arReportStartDate || undefined,
          arReportCycleType: form.arReportCycleType || undefined,
          arReportCycle: form.arReportCycle || undefined,
          arReportCycleDay: form.arReportCycleDay ?? undefined,
          arReportCycleNth: form.arReportCycleNth ?? undefined,
          arReportNote: form.arReportNote || undefined,
        }),
        payrollEnabled: form.payrollEnabled ?? undefined,
        ...(form.payrollEnabled === true && {
          payrollStartDate: form.payrollStartDate || undefined,
          payrollCycleType: form.payrollCycleType || undefined,
          payrollCycle: form.payrollCycle || undefined,
          payrollCycleDay: form.payrollCycleDay ?? undefined,
          payrollCycleNth: form.payrollCycleNth ?? undefined,
          payrollNote: form.payrollNote || undefined,
        }),
        payrollTaxEnabled: form.payrollTaxEnabled ?? undefined,
        ...(form.payrollTaxEnabled === true && {
          payrollTaxCadEnabled: form.payrollTaxCadEnabled,
          payrollTaxQcEnabled: form.payrollTaxQcEnabled,
          ...(form.payrollTaxCadEnabled && {
            payrollTaxStartDate: form.payrollTaxStartDate || undefined,
            payrollTaxCycleType: form.payrollTaxCycleType || undefined,
            payrollTaxCycle: form.payrollTaxCycle || undefined,
            payrollTaxCycleDay: form.payrollTaxCycleDay ?? undefined,
            payrollTaxCycleNth: form.payrollTaxCycleNth ?? undefined,
            payrollTaxNote: form.payrollTaxNote || undefined,
          }),
          ...(form.payrollTaxQcEnabled && {
            payrollTaxQcStartDate: form.payrollTaxQcStartDate || undefined,
            payrollTaxQcCycleType: form.payrollTaxQcCycleType || undefined,
            payrollTaxQcCycle: form.payrollTaxQcCycle || undefined,
            payrollTaxQcCycleDay: form.payrollTaxQcCycleDay ?? undefined,
            payrollTaxQcCycleNth: form.payrollTaxQcCycleNth ?? undefined,
            payrollTaxQcNote: form.payrollTaxQcNote || undefined,
          }),
        }),
        payrollYearEndEnabled: form.payrollYearEndEnabled ?? undefined,
        ...(form.payrollYearEndEnabled === true && {
          payrollYearEndRl1: form.payrollYearEndRl1,
          payrollYearEndT4: form.payrollYearEndT4,
          payrollYearEndCnesst: form.payrollYearEndCnesst,
        }),
        locationVisitEnabled: form.locationVisitEnabled ?? undefined,
        ...(form.locationVisitEnabled === true && {
          locationVisitFrequency: form.locationVisitFrequency ?? undefined,
        }),
        qcDocsEnabled: form.qcDocsEnabled ?? undefined,
        ...(form.qcDocsEnabled === true && { qcDocsNote: form.qcDocsNote || undefined }),
        craDocsEnabled: form.craDocsEnabled ?? undefined,
        ...(form.craDocsEnabled === true && { craDocsNote: form.craDocsNote || undefined }),
        salesTaxEnabled: form.salesTaxEnabled ?? undefined,
        ...(form.salesTaxEnabled === true && { salesTaxNote: form.salesTaxNote || undefined }),
        cashFlowEnabled: form.cashFlowEnabled ?? undefined,
        ...(form.cashFlowEnabled === true && {
          cashFlowAccounts: form.cashFlowAccounts,
        }),
        creditCardEnabled: form.creditCardEnabled ?? undefined,
        ...(form.creditCardEnabled === true && {
          creditCardAccounts: form.creditCardAccounts,
        }),
        receiptTrackingEnabled: form.receiptTrackingEnabled ?? undefined,
        ...(form.receiptTrackingEnabled === true && {
          receiptTrackingStartDate: form.receiptTrackingStartDate || undefined,
          receiptTrackingCycleType: form.receiptTrackingCycleType || undefined,
          receiptTrackingCycle: form.receiptTrackingCycle || undefined,
          receiptTrackingCycleDay: form.receiptTrackingCycleDay ?? undefined,
          receiptTrackingCycleNth: form.receiptTrackingCycleNth ?? undefined,
          receiptTrackingNote: form.receiptTrackingNote || undefined,
        }),
        cardHolderName: form.cardHolderName || undefined,
        cardNumber: form.cardNumber || undefined,
        cardExpiry: form.cardExpiry || undefined,
        cardCvv: form.cardCvv || undefined,
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
            {currentStepName === 'reconciliation' && (
              <Step8Reconciliation data={form} onChange={patch} />
            )}
            {currentStepName === 'accountspayable' && (
              <Step9AccountsPayable data={form} onChange={patch} />
            )}
            {currentStepName === 'accountsreceivable' && (
              <Step10AccountsReceivable data={form} onChange={patch} />
            )}
            {currentStepName === 'payroll' && (
              <Step11Payroll data={form} onChange={patch} />
            )}
            {currentStepName === 'general' && (
              <Step12General data={form} onChange={patch} />
            )}
            {currentStepName === 'secretarial' && (
              <Step13SecretarialManagement data={form} onChange={patch} />
            )}
            {currentStepName === 'terms' && (
              <Step14TermsAndConditions data={form} onChange={patch} />
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
