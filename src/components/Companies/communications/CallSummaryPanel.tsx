import { useState } from 'react';
import { ChevronDown, ChevronRight, Sparkles } from 'lucide-react';
import type { CallSummary } from '@/api/phone';

/**
 * The AI summary of a call, shown beside its recording.
 *
 * Teal card + `Sparkles`, matching `PolishPanel` — that pairing is this app's visual
 * identity for "a model wrote this", and a reader should be able to tell AI text from a
 * person's at a glance without reading a label.
 *
 * Renders NOTHING when there is no summary at all (`null`), which is the state for every
 * call that happened before this feature existed and for every call when
 * `PHONE_SUMMARIZE_CALLS` is off. An empty labelled box on all of those would be noise.
 */
export function CallSummaryPanel({
  summary,
  isVoicemail,
}: {
  summary: CallSummary | null | undefined;
  isVoicemail?: boolean;
}) {
  if (!summary) return null;

  const label = isVoicemail ? 'Message summary' : 'Call summary';

  if (summary.status === 'pending') {
    return (
      <div className="flex flex-col gap-2">
        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          {label}
        </p>
        <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
          {/* The same spinner idiom the rest of the tab uses for in-flight work. */}
          <Sparkles size={13} className="animate-pulse text-teal-600" />
          Summarising this call…
        </div>
      </div>
    );
  }

  if (summary.status === 'ready' && summary.summary) {
    return (
      <div className="flex flex-col gap-2">
        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          {label}
        </p>
        <div className="rounded-md border border-teal-200 bg-teal-50/60 p-3 flex flex-col gap-2">
          <div className="flex items-center gap-1.5 text-xs font-medium text-teal-700">
            <Sparkles size={13} /> AI summary
          </div>
          {/* THE one-liner, repeated here on purpose: it is what the inbox row showed, so
              seeing it at the top of the card is what confirms this is the call the
              reader clicked. Absent on every summary written before the column existed,
              which is why it is a conditional and not a heading. */}
          {summary.shortSummary && (
            <p className="text-sm font-semibold text-foreground">
              {summary.shortSummary}
            </p>
          )}
          <p className="text-sm whitespace-pre-wrap text-foreground">
            {summary.summary}
          </p>
          <p className="text-xs text-muted-foreground">
            Generated from the recording — check the audio before relying on it.
          </p>
          {summary.transcript && <Transcript text={summary.transcript} />}
        </div>
      </div>
    );
  }

  // skipped / failed / ready-but-empty. Muted rather than alarming: neither state is
  // something the reader can act on, and `failed` retries were already exhausted.
  return (
    <div className="flex flex-col gap-2">
      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
        {label}
      </p>
      <p className="text-sm text-muted-foreground">
        {summary.reason ?? 'No summary is available for this call.'}
      </p>
    </div>
  );
}

/**
 * What was actually said, verbatim.
 *
 * ── WHY IT IS COLLAPSED ────────────────────────────────────────────────────────
 * A transcript is the raw material the summary was made from, and it is long — several
 * screens for a ten-minute call. Open by default it would bury the recording player and
 * the summary that most readers came for, every time, to serve the minority of calls
 * where somebody needs to check exactly what was said. Collapsed, it is one click away
 * and costs nothing on the rest.
 *
 * `max-h` with its own scroll, so a long transcript cannot stretch the detail pane past
 * the viewport and push the player off screen.
 */
function Transcript({ text }: { text: string }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="border-t border-teal-200/70 pt-2">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex items-center gap-1 text-xs font-medium text-teal-700 hover:text-teal-800"
      >
        {open ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
        {open ? 'Hide transcript' : 'Show transcript'}
      </button>
      {open && (
        <p className="mt-2 max-h-64 overflow-y-auto whitespace-pre-wrap rounded border border-teal-200/70 bg-white/70 p-2 text-xs leading-relaxed text-foreground">
          {text}
        </p>
      )}
    </div>
  );
}
