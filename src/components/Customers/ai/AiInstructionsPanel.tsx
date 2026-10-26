import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Bot, ChevronDown, ChevronRight, Lock, Pencil, RotateCcw, ShieldAlert } from 'lucide-react';
import type { AiEscalation, AiInstruction, AiInstructionChange, EscalationVerdict } from '@/api/aiInstructions';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Textarea } from '@/components/ui/textarea';
import {
  useAiEscalations,
  useAiInstructionChanges,
  useAiInstructions,
  useRevertAiInstructionChange,
  useUpdateAiInstruction,
} from '@/hooks/useAiInstructions';
import { cn } from '@/lib/utils';
import { fmtDateTime } from '../customer-format';

const TARGET_LABELS: Record<string, string> = {
  ASSISTANT: 'Chat assistant',
  ATTACHMENT_READER: 'Reading files',
  MATCHER: 'Matching receipts',
  STATEMENT_READER: 'Reading statements',
  PRODUCT_CATEGORIZER: 'Receipt item categories',
  BANK_FEED_CATEGORIZER: 'Bank-feed categories',
  SALES: 'Salesperson (people with no account)',
};

const VERDICT: Record<EscalationVerdict, { label: string; className: string }> = {
  RUNNING: { label: 'Checking…', className: 'border-indigo-200 bg-indigo-50 text-indigo-700' },
  FIXED: { label: 'Fixed', className: 'border-emerald-200 bg-emerald-50 text-emerald-700' },
  NOT_AN_ISSUE: { label: 'No mistake', className: 'border-slate-200 bg-slate-50 text-slate-700' },
  UNSURE: { label: 'Unsure', className: 'border-amber-200 bg-amber-50 text-amber-800' },
  FAILED: { label: 'Check failed', className: 'border-red-200 bg-red-50 text-red-700' },
};

const BY_LABEL: Record<string, string> = { STRONG_AI: 'Strong AI', STAFF: 'Staff', SEED: 'Built-in' };

/**
 * step12: what the customer site's AI is told, and who changed it. When a customer says the
 * AI got something wrong, the regular assistant hands the conversation to a stronger model,
 * which may rewrite these instructions on its own — every change is listed here and can be
 * reverted. Staff can edit any block, including the strong AI's own guide.
 */
export function AiInstructionsPanel() {
  return (
    <div className="flex flex-col gap-6">
      <Card className="border-indigo-100">
        <CardContent className="flex items-start gap-4 py-5">
          <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-indigo-50 text-indigo-700">
            <ShieldAlert size={20} />
          </span>
          <div className="text-sm">
            <p className="font-medium">How it works</p>
            <p className="text-muted-foreground">
              When a customer reports a mistake (a file read wrong, a receipt filed to the wrong transaction…), the
              assistant passes the conversation to a stronger AI. It checks what happened and, when the AI really was
              wrong, fixes the instructions below so it does not happen again. Changes apply within a minute; revert any
              of them here.
            </p>
          </div>
        </CardContent>
      </Card>
      <EscalationsSection />
      <ChangesSection />
      <InstructionsSection />
    </div>
  );
}

function SectionTitle({ children, count }: { children: React.ReactNode; count?: number }) {
  return (
    <h3 className="mb-2 flex items-center gap-2 text-xs font-semibold tracking-wide text-muted-foreground uppercase">
      {children}
      {count !== undefined && (
        <span className="rounded-full bg-indigo-100 px-1.5 text-[11px] text-indigo-800">{count}</span>
      )}
    </h3>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return (
    <p className="rounded-xl border border-dashed border-indigo-200 bg-white/60 px-4 py-5 text-center text-sm text-muted-foreground">
      {children}
    </p>
  );
}

// ---- problems checked --------------------------------------------------------------

function EscalationsSection() {
  const { data = [], isLoading, isError } = useAiEscalations();
  return (
    <section>
      <SectionTitle count={data.length}>Problems customers reported</SectionTitle>
      {isError && <p className="text-sm text-destructive">Could not load them.</p>}
      {isLoading ? (
        <div className="h-14 animate-pulse rounded-xl bg-muted" />
      ) : !data.length ? (
        <Empty>No customer has reported a mistake yet.</Empty>
      ) : (
        <ul className="flex flex-col gap-2">
          {data.slice(0, 50).map((e) => (
            <EscalationRow key={e.id} escalation={e} />
          ))}
        </ul>
      )}
    </section>
  );
}

function EscalationRow({ escalation: e }: { escalation: AiEscalation }) {
  const v = VERDICT[e.verdict] ?? VERDICT.UNSURE;
  return (
    <li className="rounded-xl border bg-white px-4 py-3 text-sm">
      <div className="flex flex-wrap items-center gap-2">
        <Badge variant="outline" className={cn('px-1.5 py-0 text-[11px]', v.className)}>
          {v.label}
        </Badge>
        {e.customer ? (
          <Link to={`/admin/customers/${e.customer.id}`} className="font-medium hover:underline">
            {e.customer.name}
          </Link>
        ) : (
          <span className="font-medium">A customer</span>
        )}
        <span className="text-xs text-muted-foreground">
          {e.companyName ?? 'personal books'} · {e.channel.toLowerCase()} · {fmtDateTime(e.createdAt)}
          {e.changes > 0 && ` · ${e.changes} change${e.changes === 1 ? '' : 's'}`}
        </span>
      </div>
      <p className="mt-1.5 line-clamp-3 whitespace-pre-line text-muted-foreground">{e.complaint}</p>
      {e.summary && <p className="mt-1.5">{e.summary}</p>}
    </li>
  );
}

// ---- change log ----------------------------------------------------------------------

function ChangesSection() {
  const { data = [], isLoading, isError } = useAiInstructionChanges();
  const changes = data.filter((c) => c.by !== 'SEED');
  return (
    <section>
      <SectionTitle count={changes.length}>Changes</SectionTitle>
      {isError && <p className="text-sm text-destructive">Could not load the changes.</p>}
      {isLoading ? (
        <div className="h-14 animate-pulse rounded-xl bg-muted" />
      ) : !changes.length ? (
        <Empty>No instruction has been changed yet.</Empty>
      ) : (
        <ul className="flex flex-col gap-2">
          {changes.slice(0, 50).map((c) => (
            <ChangeRow key={c.id} change={c} />
          ))}
        </ul>
      )}
    </section>
  );
}

function ChangeRow({ change: c }: { change: AiInstructionChange }) {
  const revert = useRevertAiInstructionChange();
  const [open, setOpen] = useState(false);
  const canRevert = c.action !== 'REVERT' && !c.revertedAt;
  return (
    <li className={cn('rounded-xl border bg-white px-4 py-3 text-sm', c.revertedAt && 'opacity-60')}>
      <div className="flex flex-wrap items-start gap-3">
        <button
          type="button"
          className="flex min-w-0 flex-1 items-start gap-1.5 text-left"
          onClick={() => setOpen((o) => !o)}
        >
          {open ? <ChevronDown size={15} className="mt-0.5 shrink-0" /> : <ChevronRight size={15} className="mt-0.5 shrink-0" />}
          <span className="min-w-0">
            <span className="font-medium">{c.title}</span>{' '}
            <span className="text-xs text-muted-foreground">
              {c.action.toLowerCase()} by {c.staffUser?.name ?? BY_LABEL[c.by] ?? c.by} · {fmtDateTime(c.createdAt)}
              {c.revertedAt && ' · reverted'}
            </span>
            {c.reason && <span className="mt-0.5 block text-muted-foreground">{c.reason}</span>}
          </span>
        </button>
        {canRevert && (
          <Button
            size="sm"
            variant="outline"
            className="h-7 gap-1"
            disabled={revert.isPending}
            onClick={() => revert.mutate(c.id)}
          >
            <RotateCcw size={13} /> Revert
          </Button>
        )}
      </div>
      {revert.error && <p className="mt-1 text-xs text-destructive">{revert.error.message}</p>}
      {open && (
        <div className="mt-2 grid gap-2 md:grid-cols-2">
          <TextBox label="Before" text={c.beforeText} />
          <TextBox label="After" text={c.afterText} />
        </div>
      )}
    </li>
  );
}

function TextBox({ label, text }: { label: string; text: string | null }) {
  return (
    <div className="min-w-0">
      <p className="mb-1 text-[11px] font-semibold text-muted-foreground uppercase">{label}</p>
      <pre className="max-h-64 overflow-auto rounded-lg bg-muted/60 p-2 text-xs whitespace-pre-wrap">
        {text ?? '—'}
      </pre>
    </div>
  );
}

// ---- the instructions ------------------------------------------------------------------

function InstructionsSection() {
  const { data = [], isLoading, isError } = useAiInstructions();
  const regular = data.filter((i) => !i.isStrong);
  const strong = data.filter((i) => i.isStrong);
  const targets = [...new Set(regular.map((i) => i.target))];
  return (
    <section className="flex flex-col gap-4">
      {isError && <p className="text-sm text-destructive">Could not load the instructions.</p>}
      {isLoading && <div className="h-14 animate-pulse rounded-xl bg-muted" />}
      {targets.map((t) => {
        const rows = regular.filter((i) => i.target === t);
        return (
          <div key={t}>
            <SectionTitle count={rows.length}>{TARGET_LABELS[t] ?? t}</SectionTitle>
            <ul className="flex flex-col gap-2">
              {rows.map((i) => (
                <InstructionRow key={i.id} instruction={i} />
              ))}
            </ul>
          </div>
        );
      })}
      {!!strong.length && (
        <div>
          <SectionTitle count={strong.length}>
            <Bot size={13} /> Strong AI
          </SectionTitle>
          <ul className="flex flex-col gap-2">
            {strong.map((i) => (
              <InstructionRow key={i.id} instruction={i} />
            ))}
          </ul>
        </div>
      )}
      {!isLoading && !data.length && (
        <Empty>No instructions in the database yet — the AI uses its built-in ones. Run the seed script.</Empty>
      )}
    </section>
  );
}

function InstructionRow({ instruction: i }: { instruction: AiInstruction }) {
  const update = useUpdateAiInstruction();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState(i.text);

  return (
    <li className={cn('rounded-xl border bg-white px-4 py-3 text-sm', i.isStrong && 'border-indigo-200')}>
      <div className="flex flex-wrap items-start gap-3">
        <button
          type="button"
          className="flex min-w-0 flex-1 items-start gap-1.5 text-left"
          onClick={() => setOpen((o) => !o)}
        >
          {open ? <ChevronDown size={15} className="mt-0.5 shrink-0" /> : <ChevronRight size={15} className="mt-0.5 shrink-0" />}
          <span className="min-w-0">
            <span className="font-medium">{i.title}</span>{' '}
            <span className="text-xs text-muted-foreground">
              {i.key} · updated {fmtDateTime(i.updatedAt)}
            </span>
            {i.locked && !i.isStrong && (
              <span className="ml-1.5 inline-flex items-center gap-0.5 text-xs text-amber-700">
                <Lock size={11} /> staff only
              </span>
            )}
          </span>
        </button>
        {!editing && (
          <Button
            size="sm"
            variant="outline"
            className="h-7 gap-1"
            onClick={() => (setText(i.text), setEditing(true), setOpen(true))}
          >
            <Pencil size={13} /> Edit
          </Button>
        )}
      </div>
      {open &&
        (editing ? (
          <div className="mt-2 flex flex-col gap-2">
            <Textarea
              value={text}
              rows={Math.min(24, Math.max(4, text.split('\n').length + 1))}
              className="font-mono text-xs"
              onChange={(e) => setText(e.target.value)}
            />
            <div className="flex items-center justify-end gap-2">
              {update.error && <span className="mr-auto text-xs text-destructive">{update.error.message}</span>}
              <Button size="sm" variant="outline" onClick={() => setEditing(false)}>
                Cancel
              </Button>
              <Button
                size="sm"
                disabled={update.isPending || !text.trim() || text === i.text}
                onClick={() => update.mutate({ id: i.id, text }, { onSuccess: () => setEditing(false) })}
              >
                Save
              </Button>
            </div>
          </div>
        ) : (
          <pre className="mt-2 max-h-96 overflow-auto rounded-lg bg-muted/60 p-2 text-xs whitespace-pre-wrap">
            {i.text}
          </pre>
        ))}
    </li>
  );
}
