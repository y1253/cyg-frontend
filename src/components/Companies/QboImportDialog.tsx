import { useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  Bot,
  Check,
  ChevronDown,
  Loader2,
  MessageSquarePlus,
  Send,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  SKIP,
  SPLIT,
  type ImportAction,
  type ImportQuestion,
  type ImportSnapshot,
} from '@/api/qboImport';
import { useQboImport } from '@/hooks/useQboImport';
import { cn } from '@/lib/utils';

/** YYYY-MM-DD, `years` back from today (local). */
function yearsAgo(years: number): string {
  const d = new Date();
  d.setFullYear(d.getFullYear() - years);
  return d.toLocaleDateString('en-CA');
}

const PERIODS = [
  { key: '1y', label: 'Last year', since: () => yearsAgo(1) },
  { key: '2y', label: 'Last 2 years', since: () => yearsAgo(2) },
  { key: 'date', label: 'From a date', since: () => null },
  { key: 'all', label: 'Everything', since: () => null },
] as const;

type PeriodKey = (typeof PERIODS)[number]['key'];

/**
 * step11.md (2026-11-25): the popup behind "Turn on" (and "Re-run QuickBooks import"). The
 * company's QuickBooks history is read and turned into the customer's own rules; every mess
 * in it is asked here, the AI checks the result, and only when the admin applies is the push
 * to QuickBooks switched on. It all runs on the server (`quickbooks-import`) — this window
 * only sends the admin's choices over the realtime socket and draws the snapshots that come
 * back, so closing it and opening it again picks the import up where it was.
 */
export function QboImportDialog({
  companyId,
  open,
  turnOn,
  onClose,
}: {
  companyId: number;
  open: boolean;
  /** Opened from "Turn on": the push is switched on when the import is done. */
  turnOn: boolean;
  onClose: () => void;
}) {
  const { snapshot, error, sending, send, reset } = useQboImport(companyId, open);
  const opened = useRef(false);

  useEffect(() => {
    if (!open) {
      opened.current = false;
      return;
    }
    if (opened.current) return;
    opened.current = true;
    reset();
    void send({ action: 'open', turnOn });
  }, [open, turnOn, send, reset]);

  const s = snapshot;
  const busy = !s || s.state === 'LOADING' || s.state === 'APPLYING';

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="flex max-h-[90vh] flex-col gap-4 sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>Set up rules from QuickBooks</DialogTitle>
          <DialogDescription>
            The company&rsquo;s QuickBooks history is turned into its own name and description
            rules here, so new bank transactions are named and filed the way QuickBooks has them.
          </DialogDescription>
        </DialogHeader>

        <div className="-mx-1 min-h-0 flex-1 overflow-y-auto px-1">
          {!s ? (
            <Progress lines={['Opening…']} />
          ) : s.state === 'PERIOD' ? (
            <PeriodStep busy={sending} onStart={(since) => void send({ action: 'period', since })} />
          ) : s.state === 'LOADING' || s.state === 'APPLYING' ? (
            <Progress lines={s.log} />
          ) : s.state === 'REVIEW' ? (
            <ReviewStep s={s} sending={sending} send={send} />
          ) : s.state === 'DONE' ? (
            <DoneStep s={s} />
          ) : (
            <div className="flex items-start gap-2 rounded-md border border-destructive/40 bg-destructive/5 p-3 text-sm">
              <AlertTriangle className="mt-0.5 size-4 shrink-0 text-destructive" />
              <span>{s.error ?? 'The import failed.'}</span>
            </div>
          )}
          {error && <p className="mt-3 text-sm text-destructive">{error}</p>}
        </div>

        <DialogFooter className="gap-2 sm:justify-between">
          <div className="flex gap-2">
            {s && s.turnOn && ['PERIOD', 'REVIEW', 'FAILED'].includes(s.state) && (
              <Button
                variant="ghost"
                disabled={sending}
                onClick={() => void send({ action: 'skip-import' })}
              >
                Turn on without the import
              </Button>
            )}
          </div>
          <div className="flex gap-2">
            {s?.state === 'FAILED' && (
              <Button
                variant="outline"
                disabled={sending}
                onClick={() => void send({ action: 'open', turnOn })}
              >
                Start again
              </Button>
            )}
            {s && s.state !== 'DONE' && s.state !== 'APPLYING' && (
              <Button
                variant="outline"
                disabled={sending}
                onClick={() => {
                  void send({ action: 'cancel' });
                  onClose();
                }}
              >
                Cancel import
              </Button>
            )}
            <Button variant={s?.state === 'DONE' ? 'default' : 'ghost'} onClick={onClose}>
              {s?.state === 'DONE' ? 'Close' : busy ? 'Hide' : 'Close for now'}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Progress({ lines }: { lines: string[] }) {
  const last = lines.length ? lines[lines.length - 1] : 'Working…';
  return (
    <div className="flex flex-col gap-3 py-6">
      <div className="flex items-center gap-2 text-sm font-medium">
        <Loader2 className="size-4 animate-spin text-teal-600" /> {last}
      </div>
      {lines.length > 1 && (
        <ul className="flex flex-col gap-1 text-xs text-muted-foreground">
          {lines.slice(0, -1).map((l, i) => (
            <li key={i} className="flex items-center gap-1.5">
              <Check className="size-3 text-teal-600" /> {l}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function PeriodStep({
  busy,
  onStart,
}: {
  busy: boolean;
  onStart: (since: string | null) => void;
}) {
  const [period, setPeriod] = useState<PeriodKey>('1y');
  const [date, setDate] = useState(yearsAgo(1));
  const since =
    period === 'date' ? date || null : PERIODS.find((p) => p.key === period)!.since();
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-1">
        <Label>Clean up and learn from QuickBooks transactions since when?</Label>
        <p className="text-xs text-muted-foreground">
          Older history is often messy. Only transactions from this date on are read.
        </p>
      </div>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {PERIODS.map((p) => (
          <Button
            key={p.key}
            type="button"
            variant={period === p.key ? 'default' : 'outline'}
            onClick={() => setPeriod(p.key)}
          >
            {p.label}
          </Button>
        ))}
      </div>
      {period === 'date' && (
        <div className="flex max-w-xs flex-col gap-1.5">
          <Label htmlFor="qbo-since">From</Label>
          <Input
            id="qbo-since"
            type="date"
            value={date}
            max={new Date().toLocaleDateString('en-CA')}
            onChange={(e) => setDate(e.target.value)}
          />
        </div>
      )}
      <div>
        <Button
          disabled={busy || (period === 'date' && !date)}
          onClick={() => onStart(period === 'all' ? null : since)}
        >
          {busy && <Loader2 className="size-4 animate-spin" />} Read QuickBooks
        </Button>
      </div>
    </div>
  );
}

function ReviewStep({
  s,
  sending,
  send,
}: {
  s: ImportSnapshot;
  sending: boolean;
  send: (cmd: ImportAction) => Promise<void>;
}) {
  const [fixHistory, setFixHistory] = useState(false);
  const open = s.questions.filter((q) => !q.answer);
  const fixCount = s.historyFix.recategorize + s.historyFix.toMix;
  const activeNames = s.names.filter(
    (n) => !n.skip && (n.aliases.length || n.split || (n.category && !n.keepCategory)),
  );
  const activeDescriptions = s.descriptions.filter((d) => !d.skip);

  return (
    <div className="flex flex-col gap-5">
      {s.stats && (
        <p className="text-sm text-muted-foreground">
          {s.stats.qboTransactions} QuickBooks transactions
          {s.since ? ` since ${s.since}` : ''}, {s.stats.matched} matched to bank rows ·{' '}
          {s.stats.payees} payees.
        </p>
      )}

      {s.aiAvailable && <AiPanel s={s} sending={sending} send={send} />}

      <section className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="text-sm font-semibold">
            Questions{' '}
            <span className="font-normal text-muted-foreground">
              {s.questions.length - open.length} of {s.questions.length} answered
            </span>
          </h3>
          {open.length > 0 && (
            <Button
              size="sm"
              variant="outline"
              disabled={sending}
              onClick={() => void send({ action: 'answer-rest' })}
            >
              Use the suggested answer for the rest
            </Button>
          )}
        </div>
        {s.questions.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Nothing to ask — QuickBooks&rsquo; history is consistent.
          </p>
        ) : (
          s.questions.map((q) => (
            <QuestionCard key={q.id} q={q} disabled={sending} send={send} />
          ))
        )}
      </section>

      <RulesSummary names={activeNames} descriptions={activeDescriptions} />

      {fixCount > 0 && (
        <label className="flex items-start gap-2 rounded-md border p-3 text-sm">
          <Checkbox
            checked={fixHistory}
            onCheckedChange={(v) => setFixHistory(v === true)}
            className="mt-0.5"
          />
          <span>
            Also fix QuickBooks&rsquo; history{s.since ? ` since ${s.since}` : ''}
            <span className="block text-xs text-muted-foreground">
              {s.historyFix.recategorize > 0 &&
                `${s.historyFix.recategorize} transaction(s) moved to the category you picked. `}
              {s.historyFix.toMix > 0 &&
                `${s.historyFix.toMix} transaction(s) of split names moved to their “-mix” payee.`}
            </span>
          </span>
        </label>
      )}

      <div className="flex flex-col gap-1.5">
        <Button
          className="self-start"
          disabled={sending || s.aiBusy || open.length > 0}
          onClick={() => void send({ action: 'apply', fixHistory })}
        >
          {sending && <Loader2 className="size-4 animate-spin" />}
          {s.turnOn ? 'Save the rules and turn on' : 'Save the rules'}
        </Button>
        {(open.length > 0 || s.aiBusy) && (
          <p className="text-xs text-muted-foreground">
            {s.aiBusy
              ? 'Waiting for the AI to finish checking…'
              : `Answer the ${open.length} open question${open.length === 1 ? '' : 's'} first.`}
          </p>
        )}
      </div>
    </div>
  );
}

function QuestionCard({
  q,
  disabled,
  send,
}: {
  q: ImportQuestion;
  disabled: boolean;
  send: (cmd: ImportAction) => Promise<void>;
}) {
  const [note, setNote] = useState(q.note ?? '');
  const [noting, setNoting] = useState(!!q.note);
  const answer = (value: string) =>
    void send({ action: 'answer', questionId: q.id, value, note: note.trim() || undefined });

  return (
    <div
      className={cn(
        'flex flex-col gap-2 rounded-md border p-3',
        q.answer ? 'bg-muted/30' : 'border-amber-300 bg-amber-50/40',
      )}
    >
      <div className="flex items-start gap-2">
        {q.kind === 'AI' ? (
          <Bot className="mt-0.5 size-4 shrink-0 text-violet-600" />
        ) : q.answer ? (
          <Check className="mt-0.5 size-4 shrink-0 text-teal-600" />
        ) : (
          <AlertTriangle className="mt-0.5 size-4 shrink-0 text-amber-600" />
        )}
        <div className="min-w-0">
          <p className="text-sm font-medium">{q.title}</p>
          {q.detail && <p className="text-xs text-muted-foreground">{q.detail}</p>}
        </div>
      </div>
      <div className="flex flex-wrap gap-1.5 pl-6">
        {q.options.map((o) => (
          <Button
            key={o.value}
            size="sm"
            type="button"
            variant={q.answer === o.value ? 'default' : 'outline'}
            className={cn('h-auto min-h-8 flex-col items-start py-1 text-left whitespace-normal', o.value === SKIP && 'text-muted-foreground')}
            disabled={disabled}
            title={o.detail}
            onClick={() => answer(o.value)}
          >
            <span>
              {o.label}
              {q.suggested === o.value && !q.answer && (
                <Badge variant="secondary" className="ml-1.5 font-normal">
                  suggested
                </Badge>
              )}
            </span>
            {o.detail && o.value !== SPLIT && (
              <span className="text-[11px] font-normal opacity-70">{o.detail}</span>
            )}
          </Button>
        ))}
      </div>
      <div className="pl-6">
        {noting ? (
          <Textarea
            rows={2}
            value={note}
            placeholder="A note for the AI (optional) — sent with your answer"
            onChange={(e) => setNote(e.target.value)}
          />
        ) : (
          <button
            type="button"
            className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
            onClick={() => setNoting(true)}
          >
            <MessageSquarePlus className="size-3.5" /> Add a note
          </button>
        )}
      </div>
    </div>
  );
}

function AiPanel({
  s,
  sending,
  send,
}: {
  s: ImportSnapshot;
  sending: boolean;
  send: (cmd: ImportAction) => Promise<void>;
}) {
  const [text, setText] = useState('');
  const submit = () => {
    const t = text.trim();
    if (!t) return;
    void send({ action: 'message', text: t });
    setText('');
  };
  return (
    <section className="flex flex-col gap-2 rounded-md border border-violet-200 bg-violet-50/40 p-3">
      <div className="flex items-center gap-2 text-sm font-semibold">
        <Bot className="size-4 text-violet-600" /> AI check
        {s.aiBusy && (
          <span className="flex items-center gap-1 text-xs font-normal text-muted-foreground">
            <Loader2 className="size-3 animate-spin" /> checking…
          </span>
        )}
      </div>
      {s.aiChanges.length > 0 && (
        <div className="flex flex-col gap-1">
          <p className="text-xs font-medium text-violet-900">The AI changed:</p>
          <ul className="list-disc pl-5 text-xs text-violet-900">
            {s.aiChanges.map((c, i) => (
              <li key={i}>{c}</li>
            ))}
          </ul>
        </div>
      )}
      {s.chat.length > 0 && (
        <div className="flex max-h-48 flex-col gap-1.5 overflow-y-auto">
          {s.chat.map((m, i) => (
            <p
              key={i}
              className={cn(
                'rounded-md px-2 py-1 text-sm whitespace-pre-wrap',
                m.from === 'ai' ? 'bg-white' : 'self-end bg-teal-600 text-white',
              )}
            >
              {m.text}
            </p>
          ))}
        </div>
      )}
      <form
        className="flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
      >
        <Input
          value={text}
          placeholder='Tell the AI — e.g. "Costco is always Office Supplies"'
          onChange={(e) => setText(e.target.value)}
        />
        <Button type="submit" size="icon" disabled={sending || !text.trim()} title="Send">
          <Send className="size-4" />
        </Button>
      </form>
    </section>
  );
}

function RulesSummary({
  names,
  descriptions,
}: {
  names: ImportSnapshot['names'];
  descriptions: ImportSnapshot['descriptions'];
}) {
  const [open, setOpen] = useState(false);
  const shown = useMemo(() => names.slice(0, 300), [names]);
  return (
    <section className="flex flex-col gap-2">
      <button
        type="button"
        className="flex items-center gap-1 self-start text-sm font-semibold"
        onClick={() => setOpen((o) => !o)}
      >
        <ChevronDown className={cn('size-4 transition-transform', !open && '-rotate-90')} />
        Rules to save: {names.length} name{names.length === 1 ? '' : 's'},{' '}
        {descriptions.length} description{descriptions.length === 1 ? '' : 's'}
      </button>
      {open && (
        <div className="flex flex-col gap-3 rounded-md border p-3 text-xs">
          <ul className="flex flex-col gap-1">
            {shown.map((n) => (
              <li key={n.id}>
                <span className="font-medium">{n.payee}</span>
                {n.split
                  ? ` → sub-names (${n.categories.map((c) => c.category).join(', ')}) · QuickBooks: ${n.payee}-mix`
                  : n.category && !n.keepCategory
                    ? ` → ${n.category}`
                    : ''}
                {n.aliases.length > 0 && (
                  <span className="text-muted-foreground"> · renames {n.aliases.join(', ')}</span>
                )}
              </li>
            ))}
            {names.length > shown.length && (
              <li className="text-muted-foreground">…and {names.length - shown.length} more</li>
            )}
          </ul>
          {descriptions.length > 0 && (
            <ul className="flex flex-col gap-1 border-t pt-2">
              {descriptions.slice(0, 200).map((d) => (
                <li key={d.id}>
                  “{d.example}” → <span className="font-medium">{d.payee}</span>
                  {d.category ? ` / ${d.category}` : ''}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </section>
  );
}

function DoneStep({ s }: { s: ImportSnapshot }) {
  const r = s.result;
  if (!r) return <p className="text-sm">{s.error ?? 'Done.'}</p>;
  return (
    <div className="flex flex-col gap-3 text-sm">
      <p className="flex items-center gap-2 font-medium">
        <Check className="size-4 text-teal-600" />
        {r.rules} rule{r.rules === 1 ? '' : 's'} saved
        {r.subNames ? `, ${r.subNames} sub-name${r.subNames === 1 ? '' : 's'}` : ''}
        {r.historyFixed ? `, ${r.historyFixed} QuickBooks transaction(s) fixed` : ''}.
      </p>
      {r.categoriesCreated.length > 0 && (
        <p className="text-muted-foreground">
          New categories: {r.categoriesCreated.join(', ')}
        </p>
      )}
      <p className={r.turnedOn ? 'text-teal-700' : 'text-muted-foreground'}>
        {r.turnedOn
          ? 'Bank transactions now go to QuickBooks.'
          : s.turnOn
            ? 'Sending to QuickBooks was not switched on.'
            : 'Sending to QuickBooks is unchanged.'}
      </p>
      {s.error && <p className="text-destructive">{s.error}</p>}
      {[...r.errors, ...r.historyErrors].length > 0 && (
        <div className="rounded-md border border-amber-300 bg-amber-50/50 p-3">
          <p className="mb-1 font-medium">Left as they were:</p>
          <ul className="list-disc pl-5 text-xs">
            {[...r.errors, ...r.historyErrors].slice(0, 40).map((e, i) => (
              <li key={i}>{e}</li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
